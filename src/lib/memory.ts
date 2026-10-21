import type { Memory, Settings } from '../types';
import { cosineSimilarity, embedText, embeddingsReady } from './embeddings';

const STOPWORDS = new Set(
  `a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se como mais menos muito pouco sobre entre até após antes
  the and for with from this that these those you your about into over under again then than very much many some any
  eu voce você ele ela nos nós eles elas meu minha seu sua nosso nossa isso isto aquilo
  é eh são sao foi eram ser estar tem têm ter há ha vai vou pode podem`
    .toLowerCase()
    .split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
  return map;
}

/**
 * Lightweight lexical ranking. No embeddings, no network, no external model.
 * Good enough for a personal memory bank and predictable on every machine.
 */
function contentScore(memory: Memory, queryTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const haystack = `${memory.text} ${memory.tags.join(' ')}`;
  const tokens = tokenize(haystack);
  const tf = termFrequency(tokens);
  let score = 0;
  for (const term of queryTokens) {
    const count = tf.get(term) || 0;
    if (count > 0) score += 1 + Math.log(count);
    if (haystack.toLowerCase().includes(term)) score += 0.35;
  }
  return score;
}

function recencyBoost(memory: Memory): number {
  const ageDays = (Date.now() - memory.updatedAt) / 86_400_000;
  return Math.max(0, 0.6 - ageDays * 0.01);
}

export function scoreMemory(memory: Memory, queryTokens: string[]): number {
  return contentScore(memory, queryTokens) + recencyBoost(memory);
}

export function searchMemories(memories: Memory[], query: string, limit = 8): Memory[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return memories.slice(0, limit);
  return memories
    .map((memory) => ({
      memory,
      content: contentScore(memory, queryTokens),
      score: scoreMemory(memory, queryTokens),
    }))
    .filter((row) => row.content > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.memory);
}

function formatMemoryContext(relevant: Memory[]): string {
  if (!relevant.length) return '';
  return `\n\nMemórias relevantes do usuário (fatos que ele pediu para lembrar):\n${relevant
    .map((memory) => `- ${memory.text}${memory.tags.length ? ` [${memory.tags.join(', ')}]` : ''}`)
    .join('\n')}\nUse essas memórias apenas quando forem pertinentes. Não invente memórias.`;
}

export function buildMemoryContext(memories: Memory[], query: string, enabled: boolean): string {
  if (!enabled || !memories.length) return '';
  return formatMemoryContext(searchMemories(memories, query, 8));
}

/**
 * Hybrid ranking: lexical BM25-like score plus cosine similarity when the
 * memory bank has embeddings from the configured local/OpenAI endpoint.
 * Falls back silently to lexical ranking if embeddings are unavailable.
 */
export async function searchMemoriesHybrid(
  memories: Memory[],
  query: string,
  limit: number,
  settings: Settings,
  signal?: AbortSignal,
): Promise<Memory[]> {
  const lexical = searchMemories(memories, query, Math.max(limit, 12));
  if (!settings.ragEnabled || !memories.length || !embeddingsReady(settings)) {
    return lexical.slice(0, limit);
  }

  let queryVector: number[];
  try {
    queryVector = (await embedText(settings, query, signal)).vector;
  } catch {
    return lexical.slice(0, limit);
  }

  const queryTokens = tokenize(query);
  const maxContent = Math.max(
    1,
    ...memories.map((memory) => contentScore(memory, queryTokens)),
  );
  const model = settings.embeddingsModel.trim();
  const scored = memories.map((memory) => {
    const lex = contentScore(memory, queryTokens) / maxContent;
    const usable =
      Array.isArray(memory.embedding) &&
      memory.embedding.length > 0 &&
      (!memory.embeddingModel || memory.embeddingModel === model);
    const semantic = usable
      ? Math.max(0, cosineSimilarity(queryVector, memory.embedding as number[]))
      : 0;
    return {
      memory,
      score: lex * 0.4 + semantic * 0.6 + recencyBoost(memory) * 0.08,
      semantic,
      usable,
    };
  });

  const hasVectors = scored.some((row) => row.usable);
  if (!hasVectors) return lexical.slice(0, limit);

  return scored
    .filter((row) => row.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.memory);
}

export async function buildMemoryContextHybrid(
  memories: Memory[],
  query: string,
  enabled: boolean,
  settings: Settings,
  signal?: AbortSignal,
): Promise<string> {
  if (!enabled || !memories.length) return '';
  const relevant = await searchMemoriesHybrid(memories, query, 8, settings, signal);
  return formatMemoryContext(relevant);
}

export interface ReindexResult {
  updated: Memory[];
  indexed: number;
  failed: number;
  error?: string;
}

/** Embeds memories that are missing a vector for the current model. */
export async function reindexMemories(
  memories: Memory[],
  settings: Settings,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ReindexResult> {
  if (!embeddingsReady(settings)) {
    throw new Error('Configure um provedor de embeddings (Ollama ou OpenAI) antes de indexar.');
  }
  const model = settings.embeddingsModel.trim();
  const pending = memories.filter(
    (memory) => !memory.embedding?.length || memory.embeddingModel !== model,
  );
  const updated: Memory[] = [];
  let failed = 0;
  let error: string | undefined;
  let done = 0;

  for (const memory of pending) {
    if (signal?.aborted) break;
    try {
      const result = await embedText(settings, `${memory.text} ${memory.tags.join(' ')}`, signal);
      updated.push({
        ...memory,
        embedding: result.vector,
        embeddingModel: result.model,
        embeddedAt: Date.now(),
      });
    } catch (reason) {
      failed += 1;
      if (!error) error = reason instanceof Error ? reason.message : String(reason);
      if (failed >= 3) break;
    }
    done += 1;
    onProgress?.(done, pending.length);
  }
  return { updated, indexed: updated.length, failed, error };
}

/** Embeds a single memory; returns the original when embeddings are off/unavailable. */
export async function embedMemory(
  memory: Memory,
  settings: Settings,
): Promise<Memory> {
  if (!settings.ragEnabled || !embeddingsReady(settings)) return memory;
  try {
    const result = await embedText(settings, `${memory.text} ${memory.tags.join(' ')}`);
    return {
      ...memory,
      embedding: result.vector,
      embeddingModel: result.model,
      embeddedAt: Date.now(),
    };
  } catch {
    return memory;
  }
}
