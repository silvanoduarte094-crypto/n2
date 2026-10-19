import type {
  Provider,
  ProviderMessage,
  StreamEvent,
  ToolDefinition,
  Usage,
} from '../../types';
import type { StreamOptions } from './openai';
import { iterateSSE, joinUrl, proxyFetch, responseError } from './http';

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicBlock[] };

function textBlock(text: string): AnthropicBlock {
  return { type: 'text', text };
}

function toAnthropicMessages(messages: ProviderMessage[]): {
  system: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const converted: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      const block: AnthropicBlock = {
        type: 'tool_result',
        tool_use_id: message.toolCallId || '',
        content: message.content,
      };
      const last = converted[converted.length - 1];
      if (last?.role === 'user') last.content.push(block);
      else converted.push({ role: 'user', content: [block] });
      continue;
    }

    const blocks: AnthropicBlock[] = [];
    let text = message.content;
    for (const file of message.attachments?.filter((a) => a.text) || []) {
      text += `\n\n[Arquivo anexado: ${file.name}]\n${file.text}`;
    }
    if (text) blocks.push(textBlock(text));
    for (const image of message.attachments?.filter((a) => a.dataUrl && a.mime.startsWith('image/')) || []) {
      const match = /^data:([^;]+);base64,(.*)$/.exec(image.dataUrl || '');
      if (match) {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: match[1], data: match[2] },
        });
      }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.arguments || '{}');
        } catch {
          input = { raw: call.arguments };
        }
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input });
      }
    }
    if (!blocks.length) blocks.push(textBlock(''));

    const last = converted[converted.length - 1];
    if (last?.role === message.role) last.content.push(...blocks);
    else converted.push({ role: message.role as 'user' | 'assistant', content: blocks });
  }

  return { system: systemParts.filter(Boolean).join('\n\n'), messages: converted };
}

export async function* streamAnthropic(
  provider: Provider,
  messages: ProviderMessage[],
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
  const body: Record<string, unknown> = {
    model: provider.model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    messages: anthropicMessages,
    stream: true,
  };
  if (system) body.system = system;
  if (options.tools?.length) {
    body.tools = options.tools.map((tool: ToolDefinition) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  const response = await proxyFetch(options.settings, joinUrl(provider.baseUrl, 'v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...(provider.headers || {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
    directOk: provider.direct !== false,
    providerLabel: provider.name,
  });
  if (!response.ok) throw new Error(await responseError(response));
  if (!response.body) throw new Error('O provedor não retornou um stream.');

  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
  let usage: Usage | undefined;

  for await (const data of iterateSSE(response.body)) {
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    switch (payload.type) {
      case 'content_block_start': {
        const block = payload.content_block;
        if (block?.type === 'tool_use') {
          toolCalls.set(payload.index, {
            id: block.id,
            name: block.name,
            arguments: '',
          });
        } else if (block?.type === 'text' && block.text) {
          yield { type: 'text', text: block.text };
        }
        break;
      }
      case 'content_block_delta': {
        const delta = payload.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          yield { type: 'text', text: delta.text };
        } else if (delta?.type === 'thinking_delta' && delta.thinking) {
          yield { type: 'reasoning', text: delta.thinking };
        } else if (delta?.type === 'input_json_delta') {
          const call = toolCalls.get(payload.index);
          if (call) call.arguments += delta.partial_json || '';
        }
        break;
      }
      case 'message_delta': {
        if (payload.usage) {
          usage = {
            completionTokens: payload.usage.output_tokens,
          };
        }
        break;
      }
      case 'error': {
        throw new Error(payload.error?.message || 'Erro retornado pela Anthropic.');
      }
      default:
        break;
    }
  }

  for (const call of toolCalls.values()) {
    yield {
      type: 'tool_call',
      call: {
        id: call.id,
        name: call.name,
        arguments: call.arguments || '{}',
      },
    };
  }
  if (usage) yield { type: 'usage', usage };
  yield { type: 'done' };
}
