import http from 'node:http';

/**
 * Local mock of an OpenAI-compatible streaming endpoint.
 * Used by `npm run test:ui` / manual UI checks. It never leaves the machine.
 */
const PORT = Number(process.env.MOCK_LLM_PORT || 11434);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers':
    'authorization, content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
  'access-control-expose-headers': 'x-n2-bridge',
  'access-control-max-age': '86400',
};

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url?.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ data: [{ id: 'llama3.2' }, { id: 'mock-agent' }] }));
    return;
  }
  if (req.method !== 'POST' || !req.url?.includes('chat/completions')) {
    res.writeHead(404, { 'content-type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      // ignore
    }
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const last = messages[messages.length - 1];
    const toolMessages = messages.filter((message) => message.role === 'tool');
    const usedTool = toolMessages.length > 0;
    const usedConnector =
      toolMessages.some((message) => String(message.content).includes('MYRKAVELL')) ||
      messages.some((message) => JSON.stringify(message.tool_calls || '').includes('connector_call'));
    const userText = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
    const wantsConnector = !usedTool && /myrkavell|conector|connector/i.test(String(userText));
    const wantsTool = !usedTool && !wantsConnector && /calcul|2\+2|ferramenta|tool/i.test(String(userText));

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      ...CORS,
    });

    if (wantsConnector) {
      sse(res, { choices: [{ delta: { role: 'assistant', content: 'Consultando o conector MYRKAVELL. ' } }] });
      sse(res, {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_mock_connector_1',
                  type: 'function',
                  function: {
                    name: 'connector_call',
                    arguments: '{"connector":"MYRKAVELL","path":"status","method":"GET"}',
                  },
                },
              ],
            },
          },
        ],
      });
      sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
      sse(res, { usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 } });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    if (wantsTool) {
      sse(res, { choices: [{ delta: { role: 'assistant', content: 'Vou calcular isso. ' } }] });
      sse(res, {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_mock_1',
                  type: 'function',
                  function: { name: 'calculator', arguments: '{"expression":"2+2"}' },
                },
              ],
            },
          },
        ],
      });
      sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
      sse(res, { usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 } });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const connectorResult =
      [...toolMessages].reverse().find((message) => String(message.content).includes('MYRKAVELL'))?.content || '';
    const finalText = usedConnector
      ? `O conector **MYRKAVELL** respondeu:\n\n\`\`\`json\n${connectorResult}\n\`\`\`\n\nIntegração validada de ponta a ponta.`
      : usedTool
        ? 'O resultado é **4**.\n\n```js\n2 + 2 // 4\n```\n\n> Resposta gerada pelo mock local do N2.'
        : `Recebi: **${String(userText).slice(0, 120) || 'olá'}**.\n\nEste é o mock local do N2. Ele simula streaming, Markdown, código e o loop de ferramentas.\n\n- provider: Ollama (mock)\n- modelo: ${payload.model || 'llama3.2'}\n- último papel: ${last?.role || 'n/a'}`;

    const chunks = finalText.match(/[\s\S]{1,18}/g) || [finalText];
    let index = 0;
    const timer = setInterval(() => {
      if (index >= chunks.length) {
        clearInterval(timer);
        sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
        sse(res, { usage: { prompt_tokens: 40, completion_tokens: chunks.join('').length, total_tokens: 40 + chunks.join('').length } });
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      sse(res, { choices: [{ delta: { content: chunks[index] } }] });
      index += 1;
    }, 12);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock OpenAI-compatible LLM listening on http://127.0.0.1:${PORT}/v1`);
});
