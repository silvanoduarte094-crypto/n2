import { Parser } from 'expr-eval';
import type { Connector, Memory, Settings, ToolDefinition } from '../types';
import { proxyFetch, responseError } from './providers/http';
import { searchMemoriesHybrid } from './memory';
import { callMcpTool, findMcpConnector, listMcpTools, type RuntimeMcpTool } from './mcp';
import { truncate } from './utils';

export interface ToolContext {
  settings: Settings;
  memories: Memory[];
  addMemory: (text: string, tags?: string[], source?: string) => Promise<Memory>;
  signal?: AbortSignal;
  /** MCP tools discovered at the start of the run, exposed as native tools. */
  runtimeTools?: RuntimeMcpTool[];
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'calculator',
    description: 'Evaluate a mathematical expression safely. Use for arithmetic, percentages and unit-free math.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Expression such as (1200 * 0.18) / 3' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'current_datetime',
    description: 'Return the current date and time, optionally in a specific IANA timezone.',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone, e.g. America/Sao_Paulo' },
      },
    },
  },
  {
    name: 'web_search',
    description: 'Search the public web and return titles, URLs and snippets. Best effort; always cite URLs.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Number of results, 1-8', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch a public URL and return its readable text, title and main links.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL' },
        max_chars: { type: 'number', description: 'Maximum characters to return, default 12000' },
      },
      required: ['url'],
    },
  },
  {
    name: 'github_search',
    description: 'Search public GitHub repositories, issues or users. Returns name, URL, description and stars.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'GitHub search query' },
        type: { type: 'string', enum: ['repositories', 'issues', 'users'], description: 'What to search' },
        limit: { type: 'number', description: '1-8 results', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_read_file',
    description: 'Read a text file from a public GitHub repository (README, source file, docs).',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path, e.g. README.md' },
        ref: { type: 'string', description: 'Branch, tag or commit SHA (optional)' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  {
    name: 'memory_save',
    description: 'Save a durable fact about the user or project to long-term memory. Use only when the user asks to remember something or it is clearly durable.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The fact, written as a standalone sentence' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
      },
      required: ['text'],
    },
  },
  {
    name: 'memory_search',
    description: 'Search the user long-term memory bank for relevant facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for' },
        limit: { type: 'number', description: '1-10 results', default: 6 },
      },
      required: ['query'],
    },
  },
  {
    name: 'mcp_list_tools',
    description:
      'List the tools exposed by an MCP connector. Use before calling an MCP tool you have not seen in the current tool list.',
    parameters: {
      type: 'object',
      properties: {
        connector: { type: 'string', description: 'MCP connector name or id' },
      },
      required: ['connector'],
    },
  },
  {
    name: 'mcp_call',
    description:
      'Call a tool exposed by an MCP connector by name. Prefer the native mcp_* tools when they are available.',
    parameters: {
      type: 'object',
      properties: {
        connector: { type: 'string', description: 'MCP connector name or id' },
        tool: { type: 'string', description: 'Exact MCP tool name' },
        arguments: { type: 'string', description: 'JSON object with the tool arguments' },
      },
      required: ['connector', 'tool'],
    },
  },
  {
    name: 'list_connectors',
    description: 'List the external connectors configured by the user (MYRKAVELL, webhooks, REST APIs).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'connector_call',
    description: 'Call a configured external connector by name. Use only when the user explicitly wants to interact with that system.',
    parameters: {
      type: 'object',
      properties: {
        connector: { type: 'string', description: 'Connector name or id' },
        path: { type: 'string', description: 'Optional path appended to the connector URL' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
        body: { type: 'string', description: 'JSON body as a string, for POST/PUT/PATCH' },
      },
      required: ['connector'],
    },
  },
];

function toolError(message: string): string {
  return JSON.stringify({ error: message });
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function decodeDuckDuckGoLink(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}

function stripHtml(html: string, baseUrl: string): { title: string; text: string; links: string[] } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, svg, iframe, nav, footer, form').forEach((el) => el.remove());
  const title = doc.title?.trim() || '';
  const main = doc.querySelector('article, main, [role="main"]') || doc.body;
  const text = (main?.textContent || '')
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const links = Array.from(doc.querySelectorAll('a[href]'))
    .map((a) => {
      try {
        return new URL(a.getAttribute('href') || '', baseUrl).toString();
      } catch {
        return '';
      }
    })
    .filter((href) => /^https?:\/\//.test(href))
    .slice(0, 40);
  return { title, text, links: [...new Set(links)] };
}

async function proxyJson(
  settings: Settings,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {},
): Promise<unknown> {
  const response = await proxyFetch(settings, url, init);
  if (!response.ok) throw new Error(await responseError(response));
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function webSearch(
  settings: Settings,
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<string> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await proxyFetch(settings, url, {
    method: 'GET',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results = Array.from(doc.querySelectorAll('.result'))
    .map((node) => {
      const link = node.querySelector('.result__a') as HTMLAnchorElement | null;
      const snippet = node.querySelector('.result__snippet')?.textContent?.trim() || '';
      if (!link) return null;
      const href = decodeDuckDuckGoLink(link.getAttribute('href') || '');
      if (!/^https?:\/\//.test(href)) return null;
      return {
        title: link.textContent?.trim() || href,
        url: href,
        snippet: truncate(snippet.replace(/\s+/g, ' '), 260),
      };
    })
    .filter(Boolean)
    .slice(0, limit);
  if (!results.length) {
    return JSON.stringify({
      query,
      results: [],
      note: 'Nenhum resultado parseável. A busca pode ter sido bloqueada; use web_fetch em uma URL conhecida.',
    });
  }
  return JSON.stringify({ query, results });
}

export async function executeTool(
  name: string,
  rawArguments: string,
  context: ToolContext,
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = rawArguments ? (JSON.parse(rawArguments) as Record<string, unknown>) : {};
  } catch {
    return toolError('Argumentos inválidos: envie um objeto JSON.');
  }

  try {
    switch (name) {
      case 'calculator': {
        const expression = String(args.expression || '').trim();
        if (!expression || expression.length > 240) return toolError('Expressão vazia ou longa demais.');
        const parser = new Parser({ operators: { add: true, concatenate: false } });
        const value = parser.evaluate(expression);
        return JSON.stringify({ expression, value });
      }
      case 'current_datetime': {
        const timezone = String(args.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        const date = new Date();
        const formatter = new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: timezone,
        });
        return JSON.stringify({
          iso: date.toISOString(),
          timezone,
          formatted: formatter.format(date),
        });
      }
      case 'web_search': {
        const query = String(args.query || '').trim();
        if (!query) return toolError('Query vazia.');
        const limit = clampInt(args.limit, 1, 8, 5);
        return await webSearch(context.settings, query, limit, context.signal);
      }
      case 'web_fetch': {
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return toolError('Envie uma URL http(s) absoluta.');
        const response = await proxyFetch(context.settings, url, {
          method: 'GET',
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml,text/plain,application/json',
          },
          signal: context.signal,
        });
        if (!response.ok) return toolError(`HTTP ${response.status}: ${await responseError(response)}`);
        const contentType = response.headers.get('content-type') || '';
        const maxChars = clampInt(args.max_chars, 1000, 30000, 12000);
        const raw = await response.text();
        if (/json|text\/plain|xml|javascript/i.test(contentType) && !/html/i.test(contentType)) {
          return JSON.stringify({ url, contentType, text: truncate(raw, maxChars) });
        }
        const parsed = stripHtml(raw, url);
        return JSON.stringify({
          url,
          contentType,
          title: parsed.title,
          text: truncate(parsed.text, maxChars),
          links: parsed.links.slice(0, 20),
          truncated: parsed.text.length > maxChars,
        });
      }
      case 'github_search': {
        const query = String(args.query || '').trim();
        if (!query) return toolError('Query vazia.');
        const type = String(args.type || 'repositories');
        const limit = clampInt(args.limit, 1, 8, 5);
        const path =
          type === 'issues'
            ? `search/issues?q=${encodeURIComponent(query)}&per_page=${limit}`
            : type === 'users'
              ? `search/users?q=${encodeURIComponent(query)}&per_page=${limit}`
              : `search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;
        const data = (await proxyJson(context.settings, `https://api.github.com/${path}`, {
          method: 'GET',
          headers: {
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
          },
          signal: context.signal,
        })) as any;
        const items = Array.isArray(data?.items)
          ? data.items.map((item: any) => ({
              name: item.full_name || item.name || item.login || item.title,
              url: item.html_url,
              description: truncate(item.description || '', 220),
              stars: item.stargazers_count,
              language: item.language,
              updated: item.updated_at,
            }))
          : [];
        return JSON.stringify({ query, type, results: items });
      }
      case 'github_read_file': {
        const owner = String(args.owner || '').trim();
        const repo = String(args.repo || '').trim();
        const path = String(args.path || '').trim();
        const ref = String(args.ref || 'HEAD').trim();
        if (!owner || !repo || !path) return toolError('owner, repo e path são obrigatórios.');
        const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/${encodeURIComponent(ref)}/${path
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')}`;
        const response = await proxyFetch(context.settings, url, { method: 'GET', signal: context.signal });
        if (!response.ok) return toolError(`HTTP ${response.status} ao ler ${owner}/${repo}/${path}.`);
        const text = await response.text();
        return JSON.stringify({
          owner,
          repo,
          path,
          ref,
          text: truncate(text, 20000),
          truncated: text.length > 20000,
        });
      }
      case 'memory_save': {
        const text = String(args.text || '').trim();
        if (!text) return toolError('Texto vazio.');
        if (text.length > 2000) return toolError('Memória longa demais (máx. 2000 caracteres).');
        const tags = Array.isArray(args.tags) ? args.tags.map(String).slice(0, 8) : [];
        const memory = await context.addMemory(text, tags, 'agent');
        return JSON.stringify({ saved: true, id: memory.id, text: memory.text, tags: memory.tags });
      }
      case 'memory_search': {
        const query = String(args.query || '').trim();
        const limit = clampInt(args.limit, 1, 10, 6);
        const matches = await searchMemoriesHybrid(
          context.memories,
          query,
          limit,
          context.settings,
          context.signal,
        );
        return JSON.stringify({
          query,
          semantic: context.settings.ragEnabled,
          results: matches.map((memory) => ({
            text: memory.text,
            tags: memory.tags,
            updatedAt: new Date(memory.updatedAt).toISOString(),
          })),
        });
      }
      case 'mcp_list_tools': {
        const reference = String(args.connector || '').trim();
        const connector = findMcpConnector(context.settings, reference);
        if (!connector) return toolError(`Conector MCP "${reference}" não encontrado.`);
        if (!connector.enabled) return toolError(`Conector MCP "${connector.name}" está desativado.`);
        const tools = await listMcpTools(context.settings, connector, context.signal, false);
        return JSON.stringify({
          connector: connector.name,
          tools: tools.map((tool) => ({
            name: tool.name,
            description: truncate(tool.description || '', 240),
            required: Array.isArray((tool.inputSchema as any)?.required)
              ? (tool.inputSchema as any).required
              : [],
          })),
        });
      }
      case 'mcp_call': {
        const reference = String(args.connector || '').trim();
        const tool = String(args.tool || '').trim();
        const connector = findMcpConnector(context.settings, reference);
        if (!connector) return toolError(`Conector MCP "${reference}" não encontrado.`);
        if (!connector.enabled) return toolError(`Conector MCP "${connector.name}" está desativado.`);
        if (!tool) return toolError('Informe o nome da ferramenta MCP.');
        let callArgs: Record<string, unknown> = {};
        if (typeof args.arguments === 'string' && args.arguments.trim()) {
          try {
            const parsed = JSON.parse(args.arguments);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              return toolError('"arguments" deve ser um objeto JSON.');
            }
            callArgs = parsed as Record<string, unknown>;
          } catch {
            return toolError('"arguments" não é um JSON válido.');
          }
        } else if (args.arguments && typeof args.arguments === 'object') {
          callArgs = args.arguments as Record<string, unknown>;
        }
        return await callMcpTool(context.settings, connector, tool, callArgs, context.signal);
      }
      case 'list_connectors': {
        return JSON.stringify({
          connectors: context.settings.connectors.map((connector) => ({
            id: connector.id,
            name: connector.name,
            type: connector.type,
            description: connector.description,
            enabled: connector.enabled,
          })),
        });
      }
      case 'connector_call': {
        const key = String(args.connector || '').trim().toLowerCase();
        const connector: Connector | undefined = context.settings.connectors.find(
          (item) => item.id.toLowerCase() === key || item.name.toLowerCase() === key,
        );
        if (!connector) return toolError(`Connector "${args.connector}" não encontrado.`);
        if (!connector.enabled) return toolError(`Connector "${connector.name}" está desativado.`);
        const method = String(args.method || connector.method || 'POST').toUpperCase();
        const suffix = String(args.path || '');
        const url = suffix ? `${connector.url.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}` : connector.url;
        const headers: Record<string, string> = {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(connector.headers || {}),
        };
        if (connector.authHeader) headers.authorization = connector.authHeader;
        const init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal } = {
          method,
          headers,
          signal: context.signal,
        };
        if (method !== 'GET' && args.body) init.body = String(args.body);
        const response = await proxyFetch(context.settings, url, init);
        const text = await response.text();
        if (!response.ok) return toolError(`Connector HTTP ${response.status}: ${truncate(text, 1200)}`);
        return JSON.stringify({ connector: connector.name, status: response.status, body: truncate(text, 12000) });
      }
      default: {
        const runtime = context.runtimeTools?.find((tool) => tool.definition.name === name);
        if (!runtime) return toolError(`Ferramenta desconhecida: ${name}`);
        const connector = context.settings.connectors.find(
          (item) => item.id === runtime.connectorId,
        );
        if (!connector) return toolError(`Conector MCP da ferramenta ${name} não existe mais.`);
        if (!connector.enabled) return toolError(`Conector MCP "${connector.name}" está desativado.`);
        return await callMcpTool(context.settings, connector, runtime.toolName, args, context.signal);
      }
    }
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error));
  }
}
