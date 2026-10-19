import type { Provider, Settings } from '../../types';
import { joinUrl, proxyFetch, responseError } from './http';
import { GITHUB_DIRECT_HINT } from '../../config';

export async function testProvider(settings: Settings, provider: Provider): Promise<string> {
  if (!provider.baseUrl.trim()) throw new Error('Base URL vazia.');
  if (!provider.model.trim()) throw new Error('Modelo vazio.');
  if (provider.kind !== 'ollama' && !provider.apiKey.trim()) throw new Error('API key vazia.');

  if (provider.kind === 'anthropic') {
    const response = await proxyFetch(settings, joinUrl(provider.baseUrl, 'v1/messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      directOk: provider.direct !== false,
      providerLabel: provider.name,
    });
    if (!response.ok) throw new Error(await responseError(response));
    return 'Conexão OK — Anthropic respondeu.';
  }

  if (provider.kind === 'gemini') {
    const url = joinUrl(
      provider.baseUrl,
      `v1beta/models?key=${encodeURIComponent(provider.apiKey)}`,
    );
    const response = await proxyFetch(settings, url, {
      method: 'GET',
      directOk: provider.direct !== false,
      providerLabel: provider.name,
    });
    if (!response.ok) throw new Error(await responseError(response));
    const data = (await response.json()) as { models?: unknown[] };
    return `Conexão OK — ${data.models?.length || 0} modelos visíveis.`;
  }

  const body = {
    model: provider.model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 4,
    stream: false,
  };
  const response = await proxyFetch(settings, joinUrl(provider.baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey || 'none'}`,
      ...(provider.headers || {}),
    },
    body: JSON.stringify(body),
    directOk: provider.direct !== false,
    providerLabel: provider.name,
    directHint: provider.id === 'github' ? GITHUB_DIRECT_HINT : undefined,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return 'Conexão OK — o modelo respondeu.';
}
