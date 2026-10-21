import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_SETTINGS } from '../src/config';
import type { Memory, Settings } from '../src/types';
import {
  buildMemoryContextHybrid,
  embedMemory,
  reindexMemories,
  searchMemories,
  searchMemoriesHybrid,
} from '../src/lib/memory';

const checks: string[] = [];
function ok(name: string) {
  checks.push(name);
}

/** Tiny concept embedding so "bebida quente" is close to "café" without shared words. */
const CONCEPTS: Record<string, number> = {
  cafe: 0,
  bebida: 0,
  quente: 0,
  manha: 0,
  cha: 0,
  react: 1,
  typescript: 1,
  codigo: 1,
  projeto: 1,
  programacao: 1,
  cor: 2,
  azul: 2,
  favorita: 2,
  verde: 2,
};

function embed(text: string, dim = 24): number[] {
  const vector = new Array(dim).fill(0);
  const words = String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const word of words) {
    if (word in CONCEPTS) {
      vector[CONCEPTS[word]] += 1;
      continue;
    }
    let hash = 0;
    for (const character of word) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    vector[3 + (hash % (dim - 3))] += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*' }).end();
    return;
  }
  if (req.method !== 'POST' || !req.url?.includes('embeddings')) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let payload: any = {};
    try {
      payload = JSON.parse(body);
    } catch {
      // ignore
    }
    const input = payload.prompt ?? payload.input ?? '';
    const text = Array.isArray(input) ? input.join(' ') : String(input);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ embedding: embed(text) }));
  });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;

const base: Settings = structuredClone(DEFAULT_SETTINGS);
base.providers = base.providers.map((provider) =>
  provider.id === 'ollama'
    ? { ...provider, baseUrl: `http://127.0.0.1:${port}/v1`, model: 'nomic-embed-text' }
    : provider,
);
base.ragEnabled = true;
base.embeddingsProviderId = 'ollama';
base.embeddingsModel = 'nomic-embed-text';
base.connectionMode = 'direct';

const now = Date.now();
const memories: Memory[] = [
  {
    id: 'm1',
    text: 'Prefiro café sem açúcar de manhã.',
    tags: ['preferência'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'm2',
    text: 'Meu projeto usa React e TypeScript.',
    tags: ['projeto'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'm3',
    text: 'Minha cor favorita é azul.',
    tags: ['preferência'],
    createdAt: now,
    updatedAt: now,
  },
];

try {
  const single = await embedMemory(memories[0], base);
  assert.ok(Array.isArray(single.embedding));
  assert.equal(single.embedding?.length, 24);
  assert.equal(single.embeddingModel, 'nomic-embed-text');
  ok('RAG: embedMemory gera e marca o vetor');

  const reindexed = await reindexMemories(memories, base);
  assert.equal(reindexed.indexed, 3);
  assert.equal(reindexed.failed, 0);
  assert.ok(reindexed.updated.every((memory) => memory.embedding?.length === 24));
  ok('RAG: reindexação em lote');

  const lexical = searchMemories(reindexed.updated, 'bebida quente', 3);
  assert.equal(lexical.length, 0);
  const hybrid = await searchMemoriesHybrid(reindexed.updated, 'bebida quente', 3, base);
  assert.equal(hybrid[0]?.id, 'm1');
  ok('RAG: busca híbrida encontra "café" a partir de "bebida quente"');

  const context = await buildMemoryContextHybrid(
    reindexed.updated,
    'bebida quente',
    true,
    base,
  );
  assert.match(context, /café sem açúcar/);
  assert.doesNotMatch(context, /React e TypeScript/);
  ok('RAG: contexto injetado no prompt');

  const direct = await searchMemoriesHybrid(reindexed.updated, 'React', 3, {
    ...base,
    ragEnabled: false,
  });
  assert.equal(direct[0]?.id, 'm2');
  ok('RAG: modo lexical continua funcionando sem embeddings');

  server.close();
  await new Promise<void>((resolve) => server.once('close', resolve));
  const fallback = await searchMemoriesHybrid(reindexed.updated, 'café', 3, base);
  assert.equal(fallback[0]?.id, 'm1');
  ok('RAG: falha de embeddings cai para busca lexical');

  console.log(`✓ memória/RAG: ${checks.length} verificações passaram`);
} finally {
  if (server.listening) server.close();
}
