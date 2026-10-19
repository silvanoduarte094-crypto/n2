import type { Settings } from '../../types';

export class ProxyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyError';
  }
}

/**
 * All model traffic goes through the local N2 bridge (`/api/proxy`) or a
 * user-configured remote bridge. This keeps provider keys out of CORS
 * workarounds and lets the desktop build talk to any provider.
 */
export async function proxyFetch(
  settings: Settings,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const base = settings.proxyUrl.trim().replace(/\/+$/, '');
  const endpoint = base ? `${base}/api/proxy` : '/api/proxy';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.proxyToken.trim()) headers['x-n2-token'] = settings.proxyToken.trim();
  let response: Response;
  try {
    response = await fetch(endpoint, {
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
    throw new ProxyError(
      'Não consegui falar com o bridge local do N2. Rode `npm start` (ou `npm run dev:all`) ou configure uma Proxy URL nas configurações.',
    );
  }
  if (response.status === 404) {
    throw new ProxyError(
      'O bridge local não foi encontrado. Em modo estático (GitHub Pages), configure uma Proxy URL nas configurações.',
    );
  }
  if (!response.ok && response.status !== 200) {
    const text = await response.text();
    throw new ProxyError(text || `Bridge retornou HTTP ${response.status}.`);
  }
  return response;
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
