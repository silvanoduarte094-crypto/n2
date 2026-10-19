import type {
  Provider,
  ProviderMessage,
  StreamEvent,
  ToolDefinition,
  Usage,
} from '../../types';
import type { StreamOptions } from './openai';
import { iterateSSE, joinUrl, proxyFetch, responseError } from './http';

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: unknown } }
  | { functionResponse: { name: string; response: { result: string } } };

type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

function toGeminiContents(messages: ProviderMessage[]): {
  system: string;
  contents: GeminiContent[];
} {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      const part: GeminiPart = {
        functionResponse: {
          name: message.name || 'tool',
          response: { result: message.content },
        },
      };
      const last = contents[contents.length - 1];
      if (last?.role === 'user') last.parts.push(part);
      else contents.push({ role: 'user', parts: [part] });
      continue;
    }

    const parts: GeminiPart[] = [];
    let text = message.content;
    for (const file of message.attachments?.filter((a) => a.text) || []) {
      text += `\n\n[Arquivo anexado: ${file.name}]\n${file.text}`;
    }
    if (text) parts.push({ text });
    for (const image of message.attachments?.filter((a) => a.dataUrl && a.mime.startsWith('image/')) || []) {
      const match = /^data:([^;]+);base64,(.*)$/.exec(image.dataUrl || '');
      if (match) {
        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
      }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) {
        let args: unknown = {};
        try {
          args = JSON.parse(call.arguments || '{}');
        } catch {
          args = { raw: call.arguments };
        }
        parts.push({ functionCall: { name: call.name, args } });
      }
    }
    if (!parts.length) parts.push({ text: '' });

    const role: 'user' | 'model' = message.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }

  return { system: systemParts.filter(Boolean).join('\n\n'), contents };
}

export async function* streamGemini(
  provider: Provider,
  messages: ProviderMessage[],
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const { system, contents } = toGeminiContents(messages);
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    },
  };
  if (system) body.systemInstruction = { role: 'user', parts: [{ text: system }] };
  if (options.tools?.length) {
    body.tools = [
      {
        functionDeclarations: options.tools.map((tool: ToolDefinition) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ];
  }

  const model = encodeURIComponent(provider.model);
  const url = joinUrl(
    provider.baseUrl,
    `v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.apiKey)}`,
  );
  const response = await proxyFetch(options.settings, url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...(provider.headers || {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
    directOk: provider.direct !== false,
    providerLabel: provider.name,
  });
  if (!response.ok) throw new Error(await responseError(response));
  if (!response.body) throw new Error('O provedor não retornou um stream.');

  const toolCalls: { name: string; arguments: string }[] = [];
  let usage: Usage | undefined;

  for await (const data of iterateSSE(response.body)) {
    let payload: any;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    if (payload.usageMetadata) {
      usage = {
        promptTokens: payload.usageMetadata.promptTokenCount,
        completionTokens: payload.usageMetadata.candidatesTokenCount,
        totalTokens: payload.usageMetadata.totalTokenCount,
      };
    }
    const parts = payload.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (typeof part.text === 'string' && part.text) {
        yield { type: 'text', text: part.text };
      }
      if (part.functionCall?.name) {
        toolCalls.push({
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        });
      }
    }
  }

  for (const [index, call] of toolCalls.entries()) {
    yield {
      type: 'tool_call',
      call: {
        id: `gemini_${Date.now()}_${index}`,
        name: call.name,
        arguments: call.arguments,
      },
    };
  }
  if (usage) yield { type: 'usage', usage };
  yield { type: 'done' };
}
