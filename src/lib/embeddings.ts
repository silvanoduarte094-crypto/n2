import type { Provider, Settings } from '../types';
import { proxyFetch, responseError, joinUrl } from './providers/http';

export interface EmbeddingResult {
  vector: number[];
  model: string;
  providerId: string;
}

const cache = new Map<string, number[]>();
const failures = new Map<string, number>();
const CACHE_MAX = 240;
const FAILURE_COOLDOWN = 60_000;

function cacheGet(key: string): number[] | undefined {
  return cache.get(key);
}

function cacheSet(key: string, vector: number[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, vector);
}

/** Provider used for embeddings, restricted to endpoints we can actually call. */
export function getEmbeddingsProvider(settings: Settings): Provider | undefined {
  return settings.providers.find((provider) => provider.id === settings.embeddingsProviderId);
}

export function embeddingsSupported(provider?: Provider): boolean {
  if (!provider) return false;
  if (provider.kind === 'ollama') return true;
  if (provider.kind !== 'openai') return false;
  // GitHub Models only proxies chat/completions, not embeddings.
  return provider.id !== 'github' && !/models\.github\.ai/i.test(provider.baseUrl);
}

export function embeddingsReady(settings: Settings): boolean {
  const provider = getEmbeddingsProvider(settings);
  if (!provider || !embeddingsSupported(provider)) return false;
  if (!provider.baseUrl.trim() || !settings.embeddingsModel.trim()) return false;
  return provider.kind === 'ollama' || !!provider.apiKey.trim();
}

function normalize(vector: number[]): number[] {
  return vector.map((value) => (Number.isFinite(value) ? value : 0));
}

async function requestEmbedding(
  settings: Settings,
  provider: Provider,
  text: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const model = settings.embeddingsModel.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const common = {
    method: 'POST',
    headers: { 'content-type': 'application/json' } as Record<string, string>,
    signal: controller.signal,
    directOk: provider.direct !== false,
    providerLabel: provider.name,
  };

  try {
    if (provider.kind === 'ollama') {
      const base = provider.baseUrl.trim().replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
      const response = await proxyFetch(settings, `${base}/api/embeddings`, {
        ...common,
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const data = (await response.json()) as { embedding?: number[] };
      if (!Array.isArray(data.embedding) || !data.embedding.length) {
        throw new Error(`Ollama não devolveu um embedding. Rode \`ollama pull ${model}\` e tente de novo.`);
      }
      return normalize(data.embedding);
    }

    const response = await proxyFetch(settings, joinUrl(provider.baseUrl, 'embeddings'), {
      ...common,
      headers: {
        ...common.headers,
        authorization: `Bearer ${provider.apiKey}`,
        ...(provider.headers || {}),
      },
      body: JSON.stringify({ model, input: text }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    const data = (await response.json()) as { data?: { embedding?: number[] }[] };
    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || !embedding.length) {
      throw new Error(`${provider.name} não devolveu um embedding para o modelo ${model}.`);
    }
    return normalize(embedding);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' && !signal?.aborted) {
      throw new Error('Tempo esgotado ao gerar o embedding (20s).');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Embeds a text using the configured local/OpenAI-compatible endpoint.
 * Throws when semantic search is unavailable; callers fall back to lexical search.
 */
export async function embedText(
  settings: Settings,
  text: string,
  signal?: AbortSignal,
): Promise<EmbeddingResult> {
  const provider = getEmbeddingsProvider(settings);
  if (!provider) throw new Error('Nenhum provedor de embeddings configurado.');
  if (!embeddingsSupported(provider)) {
    throw new Error(`${provider.name} não oferece endpoint de embeddings compatível. Use Ollama ou OpenAI.`);
  }
  if (!embeddingsReady(settings)) {
    throw new Error('Configure o provedor e o modelo de embeddings nas configurações do agente.');
  }
  const model = settings.embeddingsModel.trim();
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  const providerKey = `${provider.id}:${provider.baseUrl}:${model}`;
  const key = `${providerKey}:${clean}`;
  const cached = cacheGet(key);
  if (cached) return { vector: cached, model, providerId: provider.id };

  const failedAt = failures.get(providerKey);
  if (failedAt && Date.now() - failedAt < FAILURE_COOLDOWN) {
    throw new Error('Embeddings temporariamente indisponíveis; usando busca lexical.');
  }

  try {
    const vector = await requestEmbedding(settings, provider, clean, signal);
    failures.delete(providerKey);
    cacheSet(key, vector);
    return { vector, model, providerId: provider.id };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError' && signal?.aborted)) {
      failures.set(providerKey, Date.now());
    }
    throw error;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
