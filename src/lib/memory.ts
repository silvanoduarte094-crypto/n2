import type { Memory } from '../types';

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
export function scoreMemory(memory: Memory, queryTokens: string[]): number {
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
  const ageDays = (Date.now() - memory.updatedAt) / 86_400_000;
  score += Math.max(0, 0.6 - ageDays * 0.01);
  return score;
}

export function searchMemories(memories: Memory[], query: string, limit = 8): Memory[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return memories.slice(0, limit);
  return memories
    .map((memory) => ({ memory, score: scoreMemory(memory, queryTokens) }))
    .filter((row) => row.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.memory);
}

export function buildMemoryContext(memories: Memory[], query: string, enabled: boolean): string {
  if (!enabled || !memories.length) return '';
  const relevant = searchMemories(memories, query, 8);
  if (!relevant.length) return '';
  return `\n\nMemórias relevantes do usuário (fatos que ele pediu para lembrar):\n${relevant
    .map((memory) => `- ${memory.text}${memory.tags.length ? ` [${memory.tags.join(', ')}]` : ''}`)
    .join('\n')}\nUse essas memórias apenas quando forem pertinentes. Não invente memórias.`;
}
