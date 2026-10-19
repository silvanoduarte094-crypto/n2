# Arquitetura do N2

Documento técnico do N2 — decisões, fluxo de dados, módulos e pontos de extensão.

## Visão geral

O N2 é um app **local-first** dividido em três camadas:

```
┌─────────────────────────────────────────────────────────────┐
│  Navegador (frontend React + Vite + TypeScript)             │
│                                                             │
│  UI ── Zustand ── IndexedDB (sessões, memórias, settings)   │
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
- `memories`: memórias persistidas com tags e flag de fixada.
- `settings`: provedores, prompt, temperatura, conectores e preferências.
- Sessão ativa, painéis abertos, streaming, status, toasts e erros.

Cada mutação relevante persiste no IndexedDB (`src/lib/db.ts`) de forma
assíncrona. `loadAll()` hidrata a aplicação no boot.

### Fluxo de uma mensagem

```
sendMessage(texto)
  → cria mensagem do usuário
  → runCompletion()
      → monta prompt de sistema (config + memórias relevantes)
      → agent loop (até 8 etapas)
          → provider.streamComplete()  (SSE)
          → delta de texto → patchAssistant() → UI
          → tool_calls? executa tools.ts e volta ao passo anterior
      → salva sessão no IndexedDB
  → fim: status idle
```

### Streaming

Os provedores expõem um único contrato:

```ts
streamComplete({ provider, messages, tools, temperature, maxTokens, signal })
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
| `memory_search` / `memory_save` | Consulta e grava memórias | IndexedDB |
| `connector_call` | Chama conectores REST/webhook | Token do conector |

Segurança: URLs passam por validação no bridge; endpoints de metadata de nuvem
(`169.254.169.254`, `metadata.google.internal`, etc.) são bloqueados.

### Interface

Componentes principais:

- `App.tsx` — shell, tema, atalhos e montagem dos painéis.
- `Sidebar.tsx` — sessões, busca, ações (fixar, renomear, duplicar, excluir).
- `TopBar.tsx` — título, provedor, modelo, ações rápidas.
- `ChatView.tsx` / `MessageBubble.tsx` — mensagens, tool cards, ações.
- `Composer.tsx` — texto, anexos, voz (ditado) e envio.
- `SettingsModal.tsx` — abas Geral, Provedores, Agente, Conectores, Dados, Sobre.
- `MemoryPanel.tsx`, `RightPanel.tsx`, `CommandPalette.tsx`, `ToastHost.tsx`.

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

### Bridge local e proxy remoto

O frontend escolhe o destino assim:

1. `settings.proxyUrl` vazio → `/api/proxy` no mesmo host (bridge local).
2. `settings.proxyUrl` preenchido → `<proxyUrl>/api/proxy` (bridge remoto).
3. Se o bridge não responder com 404, a UI orienta a configurar uma Proxy URL.

Para proteger um bridge remoto:

```bash
N2_PROXY_TOKEN=um-segredo-forte N2_HOST=0.0.0.0 npm start
```

E no app: **Configurações → Geral → Token do proxy** com o mesmo valor.

## Persistência

Banco `n2-db` (IndexedDB) com stores:

- `kv` — configurações e metadados.
- `sessions` — conversas.
- `memories` — memórias.
- `connectors`, `attachments` — quando aplicável.

Backup: **Configurações → Dados → Exportar** gera um JSON com tudo. Importar
substitui os dados atuais após confirmação.

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
- **MCP:** o tipo já existe no modelo de dados; o cliente nativo está no roadmap.

## Decisões de engenharia

| Decisão | Motivo |
| --- | --- |
| Zustand em vez de Redux | Menos boilerplate, seletores simples. |
| IndexedDB via `idb` | Persistência grande e estruturada sem servidor. |
| Bridge em Node | CORS dos provedores e proteção das chaves. |
| esbuild para o servidor | Build rápido e um único `.cjs` portátil. |
| SSE em vez de WebSocket | Simples, passa por proxies e é nativo dos provedores. |
| Sem framework de UI | CSS próprio, bundle menor e controle total do design. |
