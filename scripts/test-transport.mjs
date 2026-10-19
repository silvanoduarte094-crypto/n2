/**
 * Verifies the connection-mode transport in src/lib/providers/http.ts
 * (bridge, direct, auto + fallback) using stubbed fetch/browser globals.
 *
 * Run with: node scripts/test-transport.mjs
 */
import assert from 'node:assert/strict';
import { proxyFetch, ProxyError, resolveConnection } from '../src/lib/providers/http.ts';

const settings = (overrides = {}) => ({
  connectionMode: 'auto',
  proxyUrl: '',
  proxyToken: '',
  ...overrides,
});

function jsonResponse(status, body = {}, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function sseResponse() {
  return new Response('data: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const calls = [];
function setHost(hostname) {
  globalThis.window = { location: { hostname } };
}
function setFetch(handler) {
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
}

const providerUrl = 'https://api.example.com/v1/chat/completions';
const init = { method: 'POST', headers: { authorization: 'Bearer k' }, body: '{}' };

async function run() {
  // 1. auto + localhost -> bridge local
  setHost('127.0.0.1');
  setFetch(() => sseResponse());
  await proxyFetch(settings(), providerUrl, init);
  assert.equal(calls[0].url, '/api/proxy', 'auto/localhost deve usar o bridge');
  assert.equal(JSON.parse(calls[0].init.body).url, providerUrl);

  // 2. auto + página hospedada -> chamada direta
  setHost('silvanoduarte094-crypto.github.io');
  setFetch(() => sseResponse());
  await proxyFetch(settings(), providerUrl, init);
  assert.equal(calls[0].url, providerUrl, 'auto/hospedado deve chamar direto');
  assert.equal(calls[0].init.method, 'POST');

  // 3. auto + proxyUrl -> bridge remoto
  setHost('silvanoduarte094-crypto.github.io');
  setFetch(() => sseResponse());
  await proxyFetch(settings({ proxyUrl: 'https://bridge.example.com/' }), providerUrl, init);
  assert.equal(calls[0].url, 'https://bridge.example.com/api/proxy');

  // 4. bridge 404 sem marcador + auto -> fallback direto
  setHost('127.0.0.1');
  setFetch((url) => (url === '/api/proxy' ? jsonResponse(404, { error: 'nope' }) : sseResponse()));
  await proxyFetch(settings(), providerUrl, init);
  assert.equal(calls.length, 2, 'deve tentar bridge e depois direto');
  assert.equal(calls[1].url, providerUrl);

  // 5. bridge 404 com marcador -> resposta real do bridge, sem fallback
  setHost('127.0.0.1');
  setFetch((url) =>
    url === '/api/proxy'
      ? jsonResponse(404, { error: 'modelo não encontrado' }, { 'x-n2-bridge': '1' })
      : sseResponse(),
  );
  const marked = await proxyFetch(settings(), providerUrl, init);
  assert.equal(calls.length, 1, 'não deve repetir direto quando o bridge respondeu');
  assert.equal(marked.status, 404);

  // 6. modo direto + provedor sem CORS -> mensagem específica
  setHost('silvanoduarte094-crypto.github.io');
  setFetch(() => sseResponse());
  await assert.rejects(
    () => proxyFetch(settings({ connectionMode: 'direct' }), providerUrl, { ...init, directOk: false, directHint: 'HINT GITHUB' }),
    (error) => error instanceof ProxyError && error.message === 'HINT GITHUB',
  );
  assert.equal(calls.length, 0, 'nenhuma chamada de rede deve acontecer');

  // 7. modo direto + bloqueio genérico
  await assert.rejects(
    () => proxyFetch(settings({ connectionMode: 'direct' }), providerUrl, { ...init, directOk: false, providerLabel: 'Meu Provedor' }),
    (error) => error instanceof ProxyError && /somente via bridge/.test(error.message),
  );

  // 8. falha de rede no modo direto -> erro amigável de CORS
  setHost('silvanoduarte094-crypto.github.io');
  setFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    () => proxyFetch(settings(), providerUrl, { ...init, providerLabel: 'OpenAI' }),
    (error) => error instanceof ProxyError && /bloqueio de CORS ou rede/.test(error.message),
  );

  // 9. bridge fora do ar + auto -> fallback direto
  setHost('127.0.0.1');
  setFetch((url) => {
    if (url === '/api/proxy') throw new TypeError('Failed to fetch');
    return sseResponse();
  });
  await proxyFetch(settings(), providerUrl, init);
  assert.equal(calls.length, 2);

  // 10. bridge fora do ar + modo bridge -> erro, sem fallback
  setHost('127.0.0.1');
  setFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    () => proxyFetch(settings({ connectionMode: 'bridge' }), providerUrl, init),
    (error) => error instanceof ProxyError && /bridge/.test(error.message),
  );
  assert.equal(calls.length, 1);

  // 11. resolveConnection em cada cenário
  assert.equal(resolveConnection(settings()), 'bridge');
  setHost('silvanoduarte094-crypto.github.io');
  assert.equal(resolveConnection(settings()), 'direct');
  assert.equal(resolveConnection(settings({ proxyUrl: 'https://x.dev' })), 'bridge');
  assert.equal(resolveConnection(settings({ connectionMode: 'direct' })), 'direct');
  setHost('127.0.0.1');
  assert.equal(resolveConnection(settings({ connectionMode: 'bridge' })), 'bridge');

  console.log('✓ transporte: 11 cenários verificados (bridge, direto, auto, fallback, erros)');
}

run().catch((error) => {
  console.error('✗ falha no teste de transporte:', error);
  process.exit(1);
});
