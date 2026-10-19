import type { ConnectionMode, Settings } from '../../types';

export class ProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyError';
  }
}

/** The bridge endpoint could not be reached, so `auto` mode may fall back to direct calls. */
class BridgeUnavailableError extends ProxyError {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeUnavailableError';
  }
}

export interface ProxyInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  /** `false` marks providers that never accept direct browser calls (no CORS). */
  directOk?: boolean;
  /** Extra headers added only to direct browser calls. */
  directHeaders?: Record<string, string>;
  /** Friendly name used in error messages. */
  providerLabel?: string;
  /** Specific message shown when direct calls are blocked. */
  directHint?: string;
}

function isLocalPage(): boolean {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/** Resolves where traffic goes, considering the user preference and the page origin. */
export function resolveConnection(settings: Settings): 'bridge' | 'direct' {
  const mode: ConnectionMode = settings.connectionMode || 'auto';
  if (mode === 'bridge') return 'bridge';
  if (mode === 'direct') return 'direct';
  if (settings.proxyUrl.trim()) return 'bridge';
  return isLocalPage() ? 'bridge' : 'direct';
}

function bridgeEndpoint(settings: Settings): string {
  const base = settings.proxyUrl.trim().replace(/\/+$/, '');
  return base ? `${base}/api/proxy` : '/api/proxy';
}

async function bridgeFetch(settings: Settings, url: string, init: ProxyInit): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.proxyToken.trim()) headers['x-n2-token'] = settings.proxyToken.trim();
  let response: Response;
  try {
    response = await fetch(bridgeEndpoint(settings), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url,
        method: init.method || 'POST',
        headers: init.headers || {},
        body: init.body ?? '',
      }),
      signal: init.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new BridgeUnavailableError(
      'Não consegui falar com o bridge do N2. Rode o app completo (`npm start` / `start-release.bat`) ou configure uma Proxy URL nas configurações.',
    );
  }
  const fromBridge = response.headers.get('x-n2-bridge') === '1';
  if (!fromBridge && (response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504)) {
    throw new BridgeUnavailableError(
      response.status === 404
        ? 'O bridge do N2 não foi encontrado neste endereço. Em modo estático (GitHub Pages), configure uma Proxy URL ou use chamadas diretas.'
        : `O bridge respondeu HTTP ${response.status}. Verifique se ele está no ar.`,
    );
  }
  return response;
}

async function directFetch(url: string, init: ProxyInit): Promise<Response> {
  if (!url) throw new ProxyError('URL do provedor vazia. Confira a Base URL nas configurações.');
  const headers = { ...(init.headers || {}), ...(init.directHeaders || {}) };
  try {
    return await fetch(url, {
      method: init.method || 'GET',
      headers,
      body: init.method === 'GET' || init.method === 'HEAD' ? undefined : init.body,
      signal: init.signal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ProxyError(
      `O navegador não conseguiu chamar ${init.providerLabel || 'o serviço'} diretamente (bloqueio de CORS ou rede). Use o app completo com bridge local, um bridge via Codespaces, ou escolha um provedor compatível com chamadas diretas.`,
    );
  }
}

/**
 * Sends a model/tool request either through the N2 bridge or straight from the
 * browser (`direct`), depending on the connection preference. In `auto` mode a
 * dead bridge falls back to direct calls when the provider allows it.
 */
export async function proxyFetch(
  settings: Settings,
  url: string,
  init: ProxyInit = {},
): Promise<Response> {
  const directAllowed = init.directOk !== false;
  const preferBridge = resolveConnection(settings) === 'bridge';
  const mode = settings.connectionMode || 'auto';

  if (preferBridge) {
    try {
      return await bridgeFetch(settings, url, init);
    } catch (error) {
      const bridgeDown = error instanceof BridgeUnavailableError;
      if (!bridgeDown || mode !== 'auto') throw error;
      if (!directAllowed) {
        throw new ProxyError(
          init.directHint ||
            'O bridge não está disponível e este provedor não aceita chamadas diretas do navegador.',
        );
      }
      return directFetch(url, init);
    }
  }

  if (!directAllowed) {
    throw new ProxyError(
      init.directHint ||
        `${init.providerLabel || 'Este provedor'} está configurado como "somente via bridge". Ative as chamadas diretas no cartão do provedor ou suba um bridge.`,
    );
  }
  return directFetch(url, init);
}

export async function responseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
      detail?: string;
    };
    if (typeof json.error === 'string') return json.error;
    return json.error?.message || json.message || json.detail || text.slice(0, 800);
  } catch {
    return text.slice(0, 800) || `HTTP ${response.status} ${response.statusText}`;
  }
}

/** Parses a server-sent-events body into `data:` payload strings. */
export async function* iterateSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith('data:')) {
          const data = line.slice(5).trimStart();
          if (data) yield data;
        }
        newline = buffer.indexOf('\n');
      }
    }
    const tail = buffer + decoder.decode();
    if (tail.startsWith('data:')) {
      const data = tail.slice(5).trim();
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
