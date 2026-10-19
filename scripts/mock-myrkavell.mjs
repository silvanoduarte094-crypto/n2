import http from 'node:http';

/**
 * Local mock of the MYRKAVELL connector contract.
 * Endpoints:
 *   GET  /v1/status  -> project status
 *   GET  /v1/tasks   -> task list
 *   POST /v1/echo    -> echoes a JSON body
 */
const PORT = Number(process.env.MOCK_MYRKAVELL_PORT || 8788);

function json(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/v1/status') {
    json(res, 200, {
      project: 'MYRKAVELL',
      status: 'online',
      version: '0.1.0-mock',
      agents: 3,
      memory_items: 42,
      last_sync: new Date().toISOString(),
      message: 'Conector MYRKAVELL respondeu com sucesso.',
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/v1/tasks') {
    json(res, 200, {
      tasks: [
        { id: 'T-001', title: 'Definir contrato do conector N2', status: 'done' },
        { id: 'T-002', title: 'Validar autenticação e CORS', status: 'in_progress' },
        { id: 'T-003', title: 'Publicar build no GitHub Releases', status: 'todo' },
      ],
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/v1/echo') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(body || '{}');
      } catch {
        parsed = { raw: body };
      }
      json(res, 200, { ok: true, received: parsed, at: new Date().toISOString() });
    });
    return;
  }
  json(res, 404, { error: 'not_found', path: url.pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Mock MYRKAVELL listening on http://127.0.0.1:${PORT}/v1`);
});
