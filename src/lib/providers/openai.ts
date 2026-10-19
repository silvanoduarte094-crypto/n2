import type {
  Provider,
  ProviderMessage,
  Settings,
  StreamEvent,
  ToolDefinition,
  Usage,
} from '../../types';
import { iterateSSE, joinUrl, proxyFetch, responseError } from './http';
import { GITHUB_DIRECT_HINT } from '../../config';

export interface StreamOptions {
  settings: Settings;
  temperature: number;
  maxTokens: number;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

function isReasoningModel(model: string): boolean {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
}

function toOpenAIMessages(messages: ProviderMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content,
      };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    const images = message.attachments?.filter((a) => a.dataUrl && a.mime.startsWith('image/')) || [];
    const textFiles = message.attachments?.filter((a) => a.text) || [];
    let content = message.content;
    for (const file of textFiles) {
      content += `\n\n[Arquivo anexado: ${file.name}]\n${file.text}`;
    }
    if (images.length) {
      return {
        role: message.role,
        content: [
          { type: 'text', text: content || 'Analise as imagens anexadas.' },
          ...images.map((image) => ({
            type: 'image_url',
            image_url: { url: image.dataUrl },
          })),
        ],
      };
    }
    return { role: message.role, content };
  });
}

export async function* streamOpenAI(
  provider: Provider,
  messages: ProviderMessage[],
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const reasoning = isReasoningModel(provider.model);
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: toOpenAIMessages(messages),
    stream: true,
  };
  if (!reasoning) body.temperature = options.temperature;
  body[reasoning ? 'max_completion_tokens' : 'max_tokens'] = options.maxTokens;
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = 'auto';
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'text/event-stream',
    authorization: `Bearer ${provider.apiKey || 'none'}`,
    ...(provider.headers || {}),
  };

  const response = await proxyFetch(options.settings, provider.baseUrl ? joinUrl(provider.baseUrl, 'chat/completions') : '', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: options.signal,
    directOk: provider.direct !== false,
    providerLabel: provider.name,
    directHint: provider.id === 'github' ? GITHUB_DIRECT_HINT : undefined,
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  if (!response.body) throw new Error('O provedor não retornou um stream.');

  const toolCalls = new Map<
    number,
    { id: string; name: string; arguments: string; started: boolean }
  >();
  let usage: Usage | undefined;

  for await (const data of iterateSSE(response.body)) {
    if (data === '[DONE]') break;
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    if (payload.usage) {
      usage = {
        promptTokens: payload.usage.prompt_tokens,
        completionTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens,
      };
    }
    const choice = payload.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    const reasoningText = delta.reasoning_content || delta.reasoning;
    if (typeof reasoningText === 'string' && reasoningText) {
      yield { type: 'reasoning', text: reasoningText };
    }
    if (typeof delta.content === 'string' && delta.content) {
      yield { type: 'text', text: delta.content };
    } else if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (part?.type === 'text' && part.text) yield { type: 'text', text: part.text };
      }
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const call of delta.tool_calls) {
        const index = typeof call.index === 'number' ? call.index : 0;
        const current = toolCalls.get(index) || {
          id: call.id || '',
          name: '',
          arguments: '',
          started: false,
        };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments += call.function.arguments;
        current.started = true;
        toolCalls.set(index, current);
      }
    }
  }

  for (const [index, call] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
    if (!call.name) continue;
    yield {
      type: 'tool_call',
      call: {
        id: call.id || `call_${Date.now()}_${index}`,
        name: call.name,
        arguments: call.arguments || '{}',
      },
    };
  }
  if (usage) yield { type: 'usage', usage };
  yield { type: 'done' };
}
