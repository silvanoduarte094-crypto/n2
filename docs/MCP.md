# MCP no N2

O N2 fala **MCP (Model Context Protocol)** nativamente pelo transporte
**Streamable HTTP**. As ferramentas de cada servidor MCP entram no loop do agente
como ferramentas normais, com nome, descrição e schema de argumentos.

## O que é suportado

- Handshake `initialize` + `notifications/initialized`
- `tools/list` com paginação (`nextCursor`)
- `tools/call` com resultado em texto, conteúdo estruturado e `isError`
- Respostas em JSON ou em **SSE** (`text/event-stream`)
- Sessão via cabeçalho `Mcp-Session-Id` (com renovação automática)
- Cabeçalhos extras e `Authorization` configuráveis por conector

Cada ferramenta descoberta vira `mcp_<conector>_<ferramenta>` (até 60
caracteres). O agente também tem duas ferramentas genéricas:

- `mcp_list_tools` — lista as ferramentas de um conector
- `mcp_call` — chama uma ferramenta pelo nome, com argumentos em JSON

## Configurar

1. Abra **Configurações → Conectores → Novo conector**.
2. Escolha o tipo **MCP**.
3. Informe a URL do endpoint, por exemplo `http://127.0.0.1:3001/mcp`.
4. Se o servidor exigir autenticação, preencha o cabeçalho de autorização
   (normalmente `Bearer <token>`).
5. Clique em **Testar MCP**. O N2 faz o handshake e mostra quantas ferramentas
   foram encontradas.
6. Salve e mantenha o conector ativo.

As ferramentas são redescobertas a cada execução (com cache de 5 minutos). Se um
servidor estiver fora do ar, o chat continua funcionando e o modelo é avisado de
que aquele conector está indisponível.

## CORS e bridge

Muitos servidores MCP locais não enviam cabeçalhos CORS. Nesse caso, use o **app
completo** (bridge em `127.0.0.1:7331`) ou um bridge no Codespaces. O bridge
repassa `Mcp-Session-Id` e `Mcp-Protocol-Version` para o navegador.

Na versão web pura, o servidor MCP precisa liberar a origem do N2 e expor o
cabeçalho de sessão:

```http
Access-Control-Allow-Origin: https://silvanoduarte094-crypto.github.io
Access-Control-Allow-Headers: content-type, authorization, mcp-session-id, mcp-protocol-version
Access-Control-Expose-Headers: mcp-session-id, mcp-protocol-version
```

## Limitações atuais

- **stdio** ainda não é executado pelo bridge. Para usar um servidor que só fala
  stdio, exponha-o via um adaptador HTTP local.
- O transporte legado **HTTP+SSE** (dois endpoints) não é usado; o N2 usa
  Streamable HTTP.
- O resultado de uma ferramenta é truncado em 24 mil caracteres.
- Ferramentas MCP são tratadas como qualquer ferramenta: o modelo decide quando
  chamar. Você pode desligar o **modo agente** para desativá-las.

## Testes

O repositório inclui um servidor MCP de teste com handshake, paginação, JSON,
SSE e erros:

```bash
npm run test:mcp
```

Os testes cobrem descoberta, chamada, resultado estruturado, erro de ferramenta e
erro JSON-RPC.
