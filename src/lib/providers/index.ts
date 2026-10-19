import type { Provider, ProviderMessage, StreamEvent } from '../../types';
import { streamOpenAI, type StreamOptions } from './openai';
import { streamAnthropic } from './anthropic';
import { streamGemini } from './gemini';

export type { StreamOptions };

export async function* streamChat(
  provider: Provider,
  messages: ProviderMessage[],
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
  if (!provider.baseUrl.trim()) {
    throw new Error(`Configure a Base URL do provedor ${provider.name}.`);
  }
  if (!provider.model.trim()) {
    throw new Error(`Configure o modelo do provedor ${provider.name}.`);
  }
  if (provider.kind !== 'ollama' && !provider.apiKey.trim()) {
    throw new Error(
      `Adicione uma API key para ${provider.name}. Em GitHub Models, use um token com permissão models:read.`,
    );
  }

  switch (provider.kind) {
    case 'anthropic':
      yield* streamAnthropic(provider, messages, options);
      return;
    case 'gemini':
      yield* streamGemini(provider, messages, options);
      return;
    case 'openai':
    case 'ollama':
    default:
      yield* streamOpenAI(provider, messages, options);
  }
}
