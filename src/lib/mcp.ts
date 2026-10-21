import type { Connector, Settings, ToolDefinition } from '../types';
import { APP_VERSION } from '../config';
import { iterateSSE, proxyFetch, responseError } from './providers/http';

const PROTOCOL_VERSION = '2025-03-26';
const TOOL_CACHE_TTL = 5 * 60_000;
const MAX_TOOL_PAGES = 10;
const MAX_RESULT_CHARS = 24_000;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  result?: any;
  error?: { code?: number; message?: string; data?: unknown };
  params?: unknown;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface ToolCacheEntry {
  at: number;
  tools: McpTool[];
}

const sessions = new Map<string, string>();
const toolCache = new Map<string, ToolCacheEntry>();
let requestId = 0;

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpError';
  }
}

function nextId(): number {
  requestId += 1;
  return requestId;
}

function connectorHeaders(connector: Connector): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': PROTOCOL_VERSION,
    ...(connector.headers || {}),
  };
  if (connector.authHeader) headers.authorization = connector.authHeader;
  return headers;
}

function isEventStream(response: Response): boolean {
  return (response.headers.get('content-type') || '').includes('text/event-stream');
}

function extractMessage(payload: unknown, id: number): JsonRpcMessage | null {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const match = extractMessage(item, id);
      if (match) return match;
    }
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const message = payload as JsonRpcMessage;
  if (message.id === id) return message;
  return null;
}

async function readRpcResponse(
  response: Response,
  id: number,
): Promise<{ message: JsonRpcMessage; sessionId?: string }> {
  const sessionId = response.headers.get('mcp-session-id') || undefined;
  if (isEventStream(response) && response.body) {
    for await (const data of iterateSSE(response.body)) {
      if (data === '[DONE]') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const match = extractMessage(parsed, id);
      if (match) return { message: match, sessionId };
    }
    throw new McpError('O servidor MCP encerrou o stream sem responder ao pedido.');
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new McpError(`O servidor MCP respondeu HTTP ${response.status} sem corpo.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new McpError(`Resposta MCP inválida: ${text.slice(0, 200)}`);
  }
  const match = extractMessage(parsed, id);
  if (!match) throw new McpError('Resposta MCP sem o id esperado.');
  return { message: match, sessionId };
}

async function rpc(
  settings: Settings,
  connector: Connector,
  method: string,
  params: unknown,
  signal?: AbortSignal,
): Promise<{ result: any; sessionId?: string }> {
  const id = nextId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await proxyFetch(settings, connector.url, {
      method: 'POST',
      headers: {
        ...connectorHeaders(connector),
        ...(sessions.get(connector.id) ? { 'mcp-session-id': sessions.get(connector.id) as string } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: controller.signal,
      directOk: true,
      providerLabel: `MCP ${connector.name || connector.id}`,
      directHint:
        'Este servidor MCP não permite chamadas diretas do navegador. Use o app completo com bridge local ou um bridge via Codespaces.',
    });

    if (response.status === 404 && sessions.has(connector.id)) {
      sessions.delete(connector.id);
      throw new McpError('Sessão MCP expirada.');
    }
    if (!response.ok) {
      throw new McpError(`MCP HTTP ${response.status}: ${await responseError(response)}`);
    }
    if (response.status === 202) return { result: null };

    const { message, sessionId } = await readRpcResponse(response, id);
    if (sessionId) sessions.set(connector.id, sessionId);
    if (message.error) {
      throw new McpError(
        `MCP ${method}: ${message.error.message || 'erro desconhecido'}${
          message.error.code ? ` (${message.error.code})` : ''
        }`,
      );
    }
    return { result: message.result, sessionId };
  } catch (error) {
    if (error instanceof McpError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new McpError(`Tempo esgotado ao falar com o servidor MCP (${method}).`);
    }
    throw new McpError(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function initialize(
  settings: Settings,
  connector: Connector,
  signal?: AbortSignal,
): Promise<void> {
  const result = await rpc(
    settings,
    connector,
    'initialize',
    {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'n2', version: APP_VERSION },
    },
    signal,
  );
  const sessionId = result.sessionId;
  if (sessionId) sessions.set(connector.id, sessionId);
  if (!result.result || typeof result.result !== 'object') {
    throw new McpError('Handshake MCP inválido: o servidor não devolveu capabilities.');
  }
  try {
    await proxyFetch(settings, connector.url, {
      method: 'POST',
      headers: {
        ...connectorHeaders(connector),
        ...(sessions.get(connector.id) ? { 'mcp-session-id': sessions.get(connector.id) as string } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      signal,
      directOk: true,
      providerLabel: `MCP ${connector.name || connector.id}`,
    });
  } catch {
    // Some servers do not accept the notification; tool calls still work.
  }
}

async function ensureSession(
  settings: Settings,
  connector: Connector,
  signal?: AbortSignal,
): Promise<void> {
  if (sessions.has(connector.id)) return;
  await initialize(settings, connector, signal);
}

function resetSession(connectorId: string): void {
  sessions.delete(connectorId);
  toolCache.delete(connectorId);
}

export function clearMcpCache(): void {
  sessions.clear();
  toolCache.clear();
}

export function findMcpConnector(settings: Settings, reference: string): Connector | undefined {
  const key = reference.trim().toLowerCase();
  return settings.connectors.find(
    (connector) =>
      connector.type === 'mcp' &&
      (connector.id.toLowerCase() === key || connector.name.toLowerCase() === key),
  );
}

export async function listMcpTools(
  settings: Settings,
  connector: Connector,
  signal?: AbortSignal,
  useCache = true,
): Promise<McpTool[]> {
  const cached = toolCache.get(connector.id);
  if (useCache && cached && Date.now() - cached.at < TOOL_CACHE_TTL) return cached.tools;

  await ensureSession(settings, connector, signal);
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
    const { result } = await rpc(
      settings,
      connector,
      'tools/list',
      cursor ? { cursor } : {},
      signal,
    );
    const pageTools = Array.isArray(result?.tools) ? result.tools : [];
    for (const tool of pageTools) {
      if (tool && typeof tool.name === 'string' && tool.name.trim()) {
        tools.push({
          name: tool.name,
          description: typeof tool.description === 'string' ? tool.description : undefined,
          inputSchema:
            tool.inputSchema && typeof tool.inputSchema === 'object'
              ? tool.inputSchema
              : undefined,
        });
      }
    }
    cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : undefined;
    if (!cursor) break;
  }
  toolCache.set(connector.id, { at: Date.now(), tools });
  return tools;
}

function serializeToolResult(result: any): string {
  if (!result) return JSON.stringify({ ok: true, content: [] });
  const parts: string[] = [];
  if (Array.isArray(result.content)) {
    for (const item of result.content) {
      if (item?.type === 'text' && typeof item.text === 'string') parts.push(item.text);
      else if (item?.type === 'resource' && typeof item.resource?.text === 'string') {
        parts.push(item.resource.text);
      } else if (item) parts.push(JSON.stringify(item));
    }
  }
  if (result.structuredContent) {
    parts.push(JSON.stringify(result.structuredContent));
  }
  const text = parts.join('\n').trim() || JSON.stringify(result);
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n… (resultado truncado)`
    : text;
}

export async function callMcpTool(
  settings: Settings,
  connector: Connector,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  try {
    await ensureSession(settings, connector, signal);
    const { result } = await rpc(
      settings,
      connector,
      'tools/call',
      { name: toolName, arguments: args },
      signal,
    );
    const text = serializeToolResult(result);
    if (result?.isError) {
      return JSON.stringify({ error: text || `A ferramenta MCP ${toolName} retornou erro.` });
    }
    return text;
  } catch (error) {
    if (error instanceof McpError && /Sessão MCP expirada/.test(error.message)) {
      resetSession(connector.id);
      await ensureSession(settings, connector, signal);
      const { result } = await rpc(
        settings,
        connector,
        'tools/call',
        { name: toolName, arguments: args },
        signal,
      );
      return serializeToolResult(result);
    }
    throw error;
  }
}

export interface RuntimeMcpTool {
  definition: ToolDefinition;
  connectorId: string;
  toolName: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'mcp';
}

/**
 * Discovers tools from every enabled MCP connector and turns them into native
 * agent tools. Failures are reported per connector but never block the chat.
 */
export async function collectMcpTools(
  settings: Settings,
  signal?: AbortSignal,
): Promise<{ tools: RuntimeMcpTool[]; errors: string[] }> {
  const connectors = settings.connectors.filter(
    (connector) => connector.type === 'mcp' && connector.enabled && connector.url.trim(),
  );
  const tools: RuntimeMcpTool[] = [];
  const errors: string[] = [];
  const usedNames = new Set<string>();

  for (const connector of connectors) {
    try {
      const discovered = await listMcpTools(settings, connector, signal);
      for (const tool of discovered) {
        let name = `mcp_${slug(connector.name || connector.id)}_${slug(tool.name)}`.slice(0, 60);
        let suffix = 2;
        while (usedNames.has(name)) {
          const tail = `_${suffix}`;
          name = `${name.slice(0, 60 - tail.length)}${tail}`;
          suffix += 1;
        }
        usedNames.add(name);
        tools.push({
          definition: {
            name,
            description:
              (tool.description || `Ferramenta ${tool.name} do conector MCP ${connector.name}.`) +
              ` (MCP: ${connector.name || connector.id})`,
            parameters:
              tool.inputSchema && (tool.inputSchema as any).type === 'object'
                ? (tool.inputSchema as any)
                : { type: 'object', properties: {} },
          },
          connectorId: connector.id,
          toolName: tool.name,
        });
      }
    } catch (error) {
      errors.push(
        `${connector.name || connector.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { tools, errors };
}
