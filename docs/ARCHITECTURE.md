# Arquitetura do N2

Documento técnico do N2 — decisões, fluxo de dados, módulos e pontos de extensão.

## Visão geral

O N2 é um app **local-first** dividido em três camadas:

```
┌─────────────────────────────────────────────────────────────┐
│  Navegador (frontend React + Vite + TypeScript)             │
│                                                             │
│  UI ── Zustand ── IndexedDB (sessões, memórias, uso, settings) │
│         │                                                   │
│         └── agent loop ── tools ── providers (fetch/SSE)    │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/proxy  (JSON + SSE)
┌───────────────────────────▼─────────────────────────────────┐
│  Bridge local (Node, server/index.ts)                       │
│  • encaminha requisições para provedores e conectores       │
│  • evita CORS e esconde as chaves da página estática        │
│  • serve dist/ em http://127.0.0.1:7331                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│  Provedores de IA · GitHub Models, OpenAI, Anthropic,       │
│  Gemini, Ollama · APIs externas · conectores (MYRKAVELL)    │
└─────────────────────────────────────────────────────────────┘
```

Princípios:

1. **Local-first:** tudo que é dado do usuário vive no IndexedDB; o app funciona
   offline para histórico e memória.
2. **Sem confiança no modelo:** o agente só executa ferramentas declaradas; os
   resultados são renderizados como dados, nunca como HTML executável.
3. **Chaves fora do código:** nenhuma chave é embutida no bundle; cada usuário
   configura a sua e ela é enviada apenas ao bridge/provedor.
4. **Um arquivo de bridge:** o servidor é compilado para `server/dist/server.cjs`
   e pode ser servido por qualquer Node 24+.

## Frontend

### Estado

O Zustand (`src/store/useStore.ts`) concentra:

- `sessions`: lista de conversas com mensagens, modelo, provedor e metadados.
- `memories`: memórias persistidas com tags, flag de fixada e embedding opcional.
- `settings`: provedores, prompt, temperatura, conectores, fallback, RAG e rotinas.
- `usage`: medições locais de requisições, tokens, latência e custo estimado.
- Sessão ativa, painéis abertos, streaming, status, toasts e erros.

Cada mutação relevante persiste no IndexedDB (`src/lib/db.ts`) de forma
assíncrona. `init()` hidrata a aplicação no boot e abre o banco na versão 2.

### Fluxo de uma mensagem

```
sendMessage(texto)
  → cria mensagem do usuário
  → runCompletion()
      → runAgent()
          → descobre ferramentas MCP (timeout de 8s)
          → monta prompt (config + variáveis + memórias híbridas)
          → agent loop (até 8 etapas)
              → streamChat() no provedor ativo (SSE)
              → falha antes de emitir texto? tenta fallback
              → delta de texto → patchAssistant() → UI
              → tool_calls? executa tools/MCP e volta ao passo anterior
      → salva sessão e registro de uso no IndexedDB
  → fim: status idle
```

### Streaming

Os provedores expõem um único contrato:

```ts
streamChat(provider, messages, { settings, temperature, maxTokens, tools, signal })
  → AsyncGenerator<StreamEvent>
```

`StreamEvent` cobre `text`, `tool_call`, `usage`, `finish` e `error`. Cada
adaptador (`src/lib/providers/*.ts`) converte o formato do provedor para esse
contrato:

- **OpenAI-compatível / GitHub Models / Ollama:** `chat/completions` com SSE.
- **Anthropic:** `messages` com eventos `content_block_delta`.
- **Gemini:** `streamGenerateContent` com partes de texto e function calls.

### Ferramentas

`src/lib/tools.ts` declara cada ferramenta com JSON Schema e uma implementação.
O loop de agente converte as declarações para o formato do provedor e serializa
os resultados de volta como mensagens `tool`.

Ferramentas atuais:

| Ferramenta | O que faz | Observação |
| --- | --- | --- |
| `calculator` | Avalia expressões matemáticas | `expr-eval`, sem `eval` |
| `datetime` | Data/hora atual e cálculos | Fuso local |
| `web_search` | Busca na web | Endpoint configurável |
| `web_fetch` | Baixa uma URL e extrai texto | Limite de tamanho |
| `github_search` | Busca repositórios/código | API pública do GitHub |
| `github_read` | Lê arquivos de repositórios | API pública |
| `memory_search` / `memory_save` | Consulta e grava memórias | Busca híbrida + IndexedDB |
| `connector_call` | Chama conectores REST/webhook | Token do conector |
| `mcp_list_tools` / `mcp_call` | Lista/chama ferramentas MCP | JSON-RPC via bridge |
| `mcp_<conector>_<tool>` | Ferramentas MCP descobertas | Dinâmicas por execução |

Segurança: URLs passam por validação no bridge; endpoints de metadata de nuvem
(`169.254.169.254`, `metadata.google.internal`, etc.) são bloqueados.

### MCP

`src/lib/mcp.ts` implementa o cliente **Streamable HTTP**:

- handshake `initialize`, `notifications/initialized` e sessão `Mcp-Session-Id`;
- `tools/list` paginado e `tools/call`;
- respostas JSON ou SSE;
- descoberta por conector com cache de 5 minutos e timeout de 8s no início da
  execução;
- nomes nativos `mcp_<conector>_<ferramenta>`, além das ferramentas genéricas.

Falhas de um servidor MCP não bloqueiam o chat: o erro é resumido no prompt e o
agente segue com as demais ferramentas. Detalhes em [MCP.md](MCP.md).

### RAG local

`src/lib/embeddings.ts` chama `POST /api/embeddings` (Ollama) ou
`POST /embeddings` (OpenAI-compatível) e normaliza o vetor. As memórias guardam
`embedding`, `embeddingModel` e `embeddedAt`.

`src/lib/memory.ts` combina:

- ranking lexical (tokens, TF e recência) sempre disponível;
- similaridade de cosseno quando a memória tem vetor do modelo atual;
- fallback silencioso para lexical se o provedor de embeddings falhar.

A reindexação é manual (aba Dados) ou acontece ao salvar uma memória nova com o
RAG ativo. Nenhum texto sai do dispositivo além da chamada ao endpoint de
embeddings escolhido.

### Rotinas

`src/lib/cron.ts` interpreta cron de 5 campos, calcula a próxima execução e
descreve o agendamento. O agendador fica em `App.tsx` e verifica a cada 30s;
`runRoutine` cria uma sessão `Rotina: <nome>` e usa o mesmo pipeline do chat.
Detalhes em [AUTOMATION.md](AUTOMATION.md).

### Fallback e observabilidade

`runAgent` monta a lista `[provedor ativo, ...fallbackProviderIds]` e só troca de
provedor se a falha acontecer **antes** de qualquer texto/ferramenta. Ao trocar,
atualiza a sessão e a mensagem para o modelo que respondeu.

Ao final de cada execução, `runCompletion` grava um `UsageRecord` (provedor,
modelo, tokens, latência, sucesso e custo estimado). O custo usa os preços por
1M de tokens configurados no cartão do provedor; sem preços, o painel mostra
apenas tokens e latência.

### Interface

Componentes principais:

- `App.tsx` — shell, tema, atalhos e montagem dos painéis.
- `Sidebar.tsx` — sessões, busca, ações (fixar, renomear, duplicar, excluir).
- `TopBar.tsx` — título, provedor, modelo, ações rápidas.
- `ChatView.tsx` / `MessageBubble.tsx` — mensagens, tool cards, ações.
- `Composer.tsx` — texto, anexos, voz (ditado) e envio.
- `SettingsModal.tsx` — abas Geral, Provedores, Agente, Rotinas, Uso, Conectores,
  Dados e Sobre.
- `RightPanel.tsx`, `CommandPalette.tsx`, `Toast.tsx`.

## Bridge local

`server/index.ts` expõe:

| Rota | Método | Descrição |
| --- | --- | --- |
| `/api/health` | GET | Status, versão e raiz |
| `/api/proxy` | POST | Encaminha `{ url, method, headers, body }` e devolve o corpo (streaming) |
| `/*` | GET | Serve `dist/` com fallback SPA para `index.html` |

Decisões de segurança:

- Escuta em `127.0.0.1` por padrão (`N2_HOST` para mudar).
- `access-control-allow-origin: *` somente para o bridge local; em bridge remoto,
  use `N2_PROXY_TOKEN`.
- Cabeçalhos proibidos são removidos (`host`, `content-length`, `connection`,
  `cookie`, `sec-*`).
- Corpo máximo de 12 MB e timeout de 180 s por requisição.
- Cabeçalhos de CORS do upstream não são repassados; o bridge define os seus.
- Toda resposta do bridge leva `x-n2-bridge: 1` (exposto por CORS), para o app
  diferenciar "bridge ausente" de um erro real do provedor.

### Modos de conexão

O frontend escolhe o destino em `src/lib/providers/http.ts`:

1. `connectionMode: 'bridge'` → sempre via bridge (`/api/proxy` local ou `<proxyUrl>/api/proxy`).
2. `connectionMode: 'direct'` → chamadas diretas do navegador (`fetch` CORS).
3. `connectionMode: 'auto'` (padrão) → usa o bridge quando existe (app completo ou
   `proxyUrl` configurada); em páginas estáticas sem proxy, cai para o modo direto.

No modo `auto`, se o bridge não responder (erro de rede, ou 404/50x sem o marcador
`x-n2-bridge`), a requisição é repetida direto do navegador quando o provedor
permite CORS. Provedores marcados com `direct: false` (ex.: GitHub Models) mostram
uma orientação clara em vez de tentar uma chamada condenada. No navegador, apenas
OpenAI, Anthropic, Gemini e Ollama (com `OLLAMA_ORIGINS`) funcionam direto — veja
[docs/WEB.md](WEB.md).

Para proteger um bridge remoto:

```bash
N2_PROXY_TOKEN=um-segredo-forte N2_HOST=0.0.0.0 npm start
```

E no app: **Configurações → Geral → Token do proxy** com o mesmo valor.

Para subir um bridge pronto no Codespaces (sem instalar nada), use o botão em
**Configurações → Geral** ou rode `.devcontainer` direto no repositório.

## Persistência

Banco `n2-db` (IndexedDB) com stores:

- `kv` — configurações e metadados.
- `sessions` — conversas (com anexos e tool calls).
- `memories` — memórias e vetores opcionais.
- `usage` — histórico de requisições, tokens, latência e custo (limite de 5.000
  registros).

Backup: **Configurações → Dados → Exportar** gera um JSON com conversas, memórias,
configurações e uso. Importar substitui os dados atuais após confirmação.

## PWA

- `public/manifest.webmanifest` — nome, ícones e cores.
- `public/sw.js` — cache do shell e fallback offline.
- Registro em `src/main.tsx` apenas em produção.

## Extensão

Pontos pensados para crescer:

- **Novo provedor:** implemente o contrato em `src/lib/providers/` e registre em
  `src/lib/providers/index.ts`.
- **Nova ferramenta:** adicione o schema e o executor em `src/lib/tools.ts`.
- **Novo conector:** use a aba Conectores; nada de código.
- **MCP:** cadastre um servidor Streamable HTTP na aba Conectores. Suporte a
  stdio está no roadmap.

## Decisões de engenharia

| Decisão | Motivo |
| --- | --- |
| Zustand em vez de Redux | Menos boilerplate, seletores simples. |
| IndexedDB via `idb` | Persistência grande e estruturada sem servidor. |
| Bridge em Node | CORS dos provedores e proteção das chaves. |
| esbuild para o servidor | Build rápido e um único `.cjs` portátil. |
| SSE em vez de WebSocket | Simples, passa por proxies e é nativo dos provedores. |
| Sem framework de UI | CSS próprio, bundle menor e controle total do design. |
