import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_SETTINGS } from '../src/config';
import type { Connector, Settings } from '../src/types';
import {
  callMcpTool,
  clearMcpCache,
  collectMcpTools,
  listMcpTools,
} from '../src/lib/mcp';

const SESSION = 'mock-session-123';
const checks: string[] = [];
function ok(name: string) {
  checks.push(name);
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/mcp') {
    res.writeHead(404).end();
    return;
  }
  const message = await readBody(req);
  const session = req.headers['mcp-session-id'];
  const id = message.id;
  const json = (payload: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(200, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(payload));
  };

  if (message.method === 'initialize') {
    json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-mcp', version: '1.0.0' },
        },
      },
      { 'mcp-session-id': SESSION },
    );
    return;
  }
  if (message.method === 'notifications/initialized') {
    res.writeHead(202).end();
    return;
  }
  if (session !== SESSION) {
    json({ jsonrpc: '2.0', id, error: { code: -32000, message: 'missing session' } });
    return;
  }
  if (message.method === 'tools/list') {
    if (!message.params?.cursor) {
      json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            { name: 'echo', description: 'Echo text', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
            { name: 'sse_echo', description: 'Echo over SSE', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
          ],
          nextCursor: 'page-2',
        },
      });
    } else {
      json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            { name: 'add', description: 'Add numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
          ],
        },
      });
    }
    return;
  }
  if (message.method === 'tools/call') {
    const { name, arguments: args = {} } = message.params || {};
    if (name === 'echo') {
      json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `echo:${args.text}` }] } });
      return;
    }
    if (name === 'sse_echo') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: `sse:${args.text}` }] },
        })}\n\n`,
      );
      res.end();
      return;
    }
    if (name === 'add') {
      json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: String(Number(args.a) + Number(args.b)) }],
          structuredContent: { sum: Number(args.a) + Number(args.b) },
        },
      });
      return;
    }
    if (name === 'fail') {
      json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'boom' }], isError: true } });
      return;
    }
    json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Tool not found' } });
    return;
  }
  json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } });
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as AddressInfo).port;

const connector: Connector = {
  id: 'c_mock',
  name: 'Mock MCP',
  type: 'mcp',
  url: `http://127.0.0.1:${port}/mcp`,
  enabled: true,
  description: 'Mock server for tests',
};

const settings: Settings = {
  ...structuredClone(DEFAULT_SETTINGS),
  connectionMode: 'direct',
  proxyUrl: '',
  proxyToken: '',
  connectors: [connector],
};

try {
  clearMcpCache();
  const tools = await listMcpTools(settings, connector, undefined, false);
  assert.equal(tools.length, 3);
  assert.deepEqual(tools.map((tool) => tool.name), ['echo', 'sse_echo', 'add']);
  ok('MCP: handshake, paginação e tools/list');

  const echo = await callMcpTool(settings, connector, 'echo', { text: 'olá' });
  assert.equal(echo, 'echo:olá');
  ok('MCP: tools/call via JSON');

  const sse = await callMcpTool(settings, connector, 'sse_echo', { text: 'stream' });
  assert.equal(sse, 'sse:stream');
  ok('MCP: tools/call via SSE');

  const sum = await callMcpTool(settings, connector, 'add', { a: 2, b: 3 });
  assert.match(sum, /5/);
  ok('MCP: resultado estruturado');

  const failure = await callMcpTool(settings, connector, 'fail', {});
  assert.match(failure, /boom/);
  ok('MCP: erro da ferramenta é devolvido ao agente');

  await assert.rejects(
    () => callMcpTool(settings, connector, 'missing', {}),
    /Tool not found/,
  );
  ok('MCP: erro JSON-RPC vira exceção');

  clearMcpCache();
  const collected = await collectMcpTools(settings);
  assert.equal(collected.errors.length, 0);
  assert.equal(collected.tools.length, 3);
  assert.ok(collected.tools.some((tool) => tool.definition.name === 'mcp_mock_mcp_echo'));
  assert.equal(collected.tools.find((tool) => tool.toolName === 'echo')?.connectorId, 'c_mock');
  ok('MCP: ferramentas viram tools nativas do agente');

  const definitions = collected.tools.map((tool) => tool.definition);
  assert.ok(definitions.every((tool) => tool.parameters.type === 'object'));
  ok('MCP: schemas preservados');

  console.log(`✓ MCP: ${checks.length} verificações passaram`);
} finally {
  server.close();
}
