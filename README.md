# N2 · Núcleo de Inteligência

App de IA local-first com chat, agentes, ferramentas, memória, voz e conectores.
Roda no seu computador, guarda os dados no seu navegador e fala com o provedor de
IA que você escolher — incluindo **GitHub Models**, OpenAI, Anthropic, Gemini e
Ollama.

> O N2 é um projeto original. Ele não usa código, marca ou modelo proprietário de
> terceiros; o "Astra" citado no pedido inicial serviu apenas como referência de
> qualidade de produto.

- **Licença:** MIT
- **Telemetria:** nenhuma
- **Dados:** IndexedDB no seu navegador + bridge local em `127.0.0.1`
- **Distribuição:** GitHub Pages (interface) e GitHub Releases (app completo)
- **Conexão:** chamadas diretas no navegador (CORS) ou via bridge local/Codespaces

---

## Sumário

- [Download](#download)
- [Primeiros passos](#primeiros-passos)
- [Provedores de IA](#provedores-de-ia)
- [GitHub Models (gratuito)](#github-models-gratuito)
- [MYRKAVELL e conectores](#myrkavell-e-conectores)
- [MCP, rotinas e RAG](#mcp-rotinas-e-rag)
- [Recursos](#recursos)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Desenvolvimento](#desenvolvimento)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Publicar no GitHub](#publicar-no-github)
- [Roadmap](#roadmap)
- [Licença](#licença)

---

## Download

### Opção 1 — app completo (recomendado)

Baixe o pacote **`n2-windows-x64.zip`** na página de releases:

```
https://github.com/silvanoduarte094-crypto/n2/releases/latest
```

1. Extraia o zip em uma pasta (ex.: `C:\N2`).
2. Execute `start.bat`.
3. O navegador abre em `http://127.0.0.1:7331`.

O pacote já inclui o Node portátil, o frontend compilado e o bridge local.
Não precisa instalar nada — nem Node, nem Docker.

### Opção 2 — interface web (GitHub Pages)

```
https://silvanoduarte094-crypto.github.io/n2/
```

A versão web fala **direto do navegador** com OpenAI, Anthropic, Gemini e Ollama
(provedores que liberam CORS) — basta colar a chave nas configurações. A conexão é
escolhida em **Configurações → Geral → Conexão** (Automático, Bridge ou Direto).

Dois casos exigem um bridge:

- **GitHub Models** — a API não envia cabeçalhos CORS.
- Provedores que bloqueiam chamadas do navegador.

Para esses casos, abra um **bridge gratuito no Codespaces** com um clique
(`https://codespaces.new/silvanoduarte094-crypto/n2`), copie a URL e o token
exibidos no terminal e cole em **Configurações → Geral → Proxy / bridge**.
O passo a passo está em [docs/WEB.md](docs/WEB.md).

### Opção 3 — a partir do código

```bash
git clone https://github.com/silvanoduarte094-crypto/n2.git
cd n2
npm install
npm run build:all
npm start
```

---

## Primeiros passos

1. Abra o app. O onboarding pede o provedor e a chave (Ollama não precisa).
2. Escolha um modelo no topo do chat.
3. Escreva uma mensagem. O agente pode usar ferramentas (calculadora, data,
   busca na web, leitura de URLs, GitHub e conectores) quando o **modo agente**
   está ligado.
4. Ajuste tudo em **Configurações** (`Ctrl+,`): provedores, agente, memória,
   conectores, dados e aparência.

Atalhos úteis:

| Atalho | Ação |
| --- | --- |
| `Ctrl+K` | Command palette |
| `Ctrl+,` | Configurações |
| `Ctrl+N` | Novo chat |
| `Ctrl+B` | Mostrar/ocultar barra lateral |
| `Ctrl+M` | Painel de memória |
| `Enter` | Enviar (configurável) |
| `Shift+Enter` | Nova linha |

---

## Provedores de IA

O N2 é agnóstico de provedor. Cada provedor tem tipo de API, URL base, chave e
modelo, e você pode alternar no topo do chat.

| Provedor | Tipo | Observação |
| --- | --- | --- |
| GitHub Models | OpenAI-compatível | Padrão. Token pessoal com `models:read`. |
| OpenAI | OpenAI-compatível | `api.openai.com/v1`. |
| Anthropic | Anthropic | `api.anthropic.com`. |
| Google Gemini | Gemini | `generativelanguage.googleapis.com`. |
| Ollama | Ollama | Local, sem chave: `ollama serve` + `ollama pull llama3.2`. |
| Qualquer outro | OpenAI-compatível | Basta informar a Base URL. |

As chaves ficam **somente no IndexedDB** do seu navegador. O bridge local
encaminha as requisições e não grava cabeçalhos de autorização.

---

## GitHub Models (gratuito)

1. Acesse <https://github.com/settings/tokens> e crie um token clássico.
2. Marque o escopo **`models:read`** (ou use um fine-grained token com essa
   permissão).
3. No N2, abra **Configurações → Provedores → GitHub Models**, cole o token e
   escolha o modelo (ex.: `openai/gpt-4.1`).
4. Clique em **Testar conexão**.

O endpoint usado é `https://models.github.ai/inference`. Ele não envia cabeçalhos
CORS para o navegador: no **app completo** o bridge local cuida disso; na **versão
web** (GitHub Pages), abra um bridge no Codespaces — veja
[docs/WEB.md](docs/WEB.md). OpenAI, Anthropic, Gemini e Ollama funcionam direto no
navegador, sem bridge.

---

## MYRKAVELL e conectores

O N2 conversa com o MYRKAVELL (e com outros sistemas) por REST, webhook ou MCP.

1. Abra **Configurações → Conectores → Criar conector MYRKAVELL**.
2. Informe a URL base, o método padrão e o token.
3. Salve. O agente só chama o conector quando o pedido for explícito.
4. Peça: _"Consulte o status no MYRKAVELL usando o conector."_

O contrato sugerido (endpoints, payloads, erros e escopos) está em
[docs/MYRKAVELL-CONNECTOR.md](docs/MYRKAVELL-CONNECTOR.md).

> MCP nativo está no roadmap. Hoje o tipo `mcp` funciona como registro de
> endpoint; use REST para a integração completa.

---

## MCP, rotinas e RAG

- **MCP nativo:** conecte servidores MCP via Streamable HTTP; as ferramentas
  entram no agente como `mcp_<conector>_<ferramenta>`. Guia:
  [docs/MCP.md](docs/MCP.md).
- **Rotinas agendadas:** instruções recorrentes com cron local, notificações e
  execução no provedor ativo. Guia: [docs/AUTOMATION.md](docs/AUTOMATION.md).
- **RAG local:** memórias indexadas com embeddings do Ollama ou de uma API
  compatível com OpenAI, com busca híbrida e fallback lexical. Os vetores ficam
  no IndexedDB.
- **Observabilidade:** tokens, latência, requisições e custo estimado por
  provedor em **Configurações → Uso**.
- **Fallback:** se o provedor ativo falhar antes de responder, o N2 tenta os
  provedores de reserva na ordem configurada.

---

## Recursos

**Chat e interface**

- Streaming em tempo real, cancelar, regenerar e apagar mensagens
- Markdown com realce de código, copiar bloco e tabelas
- Anexos de texto/imagem, ditado por voz (Web Speech API)
- Temas escuro/claro/sistema, cor de destaque, tamanho de texto
- Command palette, atalhos, toasts, responsivo e PWA instalável

**Agente**

- Loop de ferramentas com limite de 8 etapas por mensagem
- Ferramentas: calculadora, data/hora, busca na web, leitura de URL, GitHub
  (busca e leitura de arquivos), memória e conectores
- Cartões de ferramenta com argumentos, resultado e duração
- Modo agente ligável/desligável, prompt de sistema editável e variáveis
  (`{{user}}`, `{{date}}`, `{{tools}}`, `{{memories}}`...) com prévia
- Ferramentas MCP descobertas automaticamente e fallback entre provedores

**Memória**

- Memórias persistentes com tags, fixar, editar e excluir
- Busca lexical + semântica (RAG) com embeddings locais e fallback lexical
- Exportar/importar backup completo (conversas, memórias, uso, conectores,
  configurações)

**Automação**

- Rotinas com cron local, notificações e histórico de última execução
- Conectores REST, webhook e MCP, incluindo MYRKAVELL

**Observabilidade**

- Tokens, requisições, latência e custo estimado por provedor
- Preços por 1M de tokens configuráveis; histórico local sem telemetria

**Provedores**

- GitHub Models, OpenAI-compatível, Anthropic, Gemini e Ollama
- Streaming SSE unificado, teste de conexão, troca de modelo no chat
- Cadeia de fallback ordenada e modos Auto/Bridge/Direto

**Bridge local**

- Proxy de streaming, proteção das chaves e serving do app em um só processo
- Token opcional (`N2_PROXY_TOKEN`) para bridges remotos
- Bloqueio de endpoints de metadata (SSRF) e limites de tamanho

---

## Privacidade e segurança

- Nenhum dado sai do seu dispositivo sem ação sua.
- Não há telemetria, analytics ou contas.
- As mensagens só vão para o provedor de IA que você configurou.
- As chaves ficam no IndexedDB e trafegam apenas até o provedor via bridge.
- O bridge escuta em `127.0.0.1` por padrão. Se você o expuser na rede, defina
  `N2_PROXY_TOKEN` e configure o mesmo token no app.

Detalhes e modelo de ameaças: [SECURITY.md](SECURITY.md).

---

## Desenvolvimento

Pré-requisito: Node 24+ (ou use o Node portátil em `.tools/node`).

```bash
npm install

# desenvolvimento
npm run dev:all        # bridge + Vite com hot reload

# build
npm run build:all      # frontend + bridge
npm start              # serve dist/ + API em http://127.0.0.1:7331

# qualidade
npm run typecheck
npm test

# mocks locais (LLM OpenAI-compatível + MYRKAVELL)
npm run mock
```

Comandos úteis:

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Vite em `:5173` (frontend) |
| `npm run dev:server` | Bridge em `:7331` (watch) |
| `npm run build:server` | Gera `server/dist/server.cjs` |
| `npm run package:win` | Gera `release/n2-windows-x64.zip` |
| `npm run test:transport` | Modos bridge/direto/auto |
| `npm run test:cron` | Parser e próxima execução das rotinas |
| `npm run test:mcp` | Handshake, paginação, JSON, SSE e erros MCP |
| `npm run test:memory` | Embeddings, RAG e fallback lexical |
| `npm run mock:llm` | Mock de LLM e embeddings em `:11434` |
| `npm run mock:myrkavell` | Mock do MYRKAVELL em `:8788` |

---

## Estrutura do projeto

```
n2/
├─ src/                     # frontend React + Vite + TypeScript
│  ├─ components/           # UI (chat, sidebar, settings, palettes…)
│  ├─ lib/
│  │  ├─ agent/             # loop de agente e prompt de sistema
│  │  ├─ providers/         # OpenAI, Anthropic, Gemini, Ollama, proxy
│  │  ├─ tools.ts           # ferramentas do agente
│  │  ├─ memory.ts          # busca e ranking de memórias
│  │  └─ db.ts              # IndexedDB, backups e configurações
│  └─ store/useStore.ts     # estado global (Zustand)
├─ server/index.ts          # bridge local: proxy, CORS, estáticos
├─ scripts/                 # builds, mocks e empacotamento
├─ docs/                    # arquitetura, conector, release, roadmap
├─ public/                  # ícones, manifest, service worker
└─ .github/workflows/       # CI, Pages e Release
```

Arquitetura detalhada: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Publicar no GitHub

O passo a passo completo (criar repositório, habilitar Pages, gerar release e
link de download) está em [docs/RELEASE.md](docs/RELEASE.md). Resumo:

```bash
git init
git add .
git commit -m "feat: N2 v0.2.0"
git branch -M main
git remote add origin https://github.com/silvanoduarte094-crypto/n2.git
git push -u origin main
```

Depois crie uma tag para disparar o release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Em poucos minutos o GitHub Actions publica:

- `n2-windows-x64.zip` — app portátil com Node incluso
- `n2-source.zip` — código-fonte
- GitHub Pages — interface web

---

## Roadmap

- [x] Chat com streaming, Markdown e código
- [x] Provedores GitHub Models/OpenAI/Anthropic/Gemini/Ollama
- [x] Agente com 8 etapas e ferramentas
- [x] Memória com busca e backup
- [x] Voz, PWA, temas e atalhos
- [x] Conectores REST/webhook/MCP (registro)
- [x] Cliente MCP nativo (Streamable HTTP + SSE)
- [x] RAG com embeddings locais e busca híbrida
- [x] Rotinas agendadas com cron local
- [x] Observabilidade de tokens, latência e custo
- [x] Fallback entre provedores
- [ ] Webhooks de entrada, multiagentes e workspace de arquivos
- [ ] MCP stdio e execução de rotinas com o app fechado
- [ ] SDK de plugins e marketplace
- [ ] Apps móveis e sincronização opcional

Detalhes: [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Licença

MIT — veja [LICENSE](LICENSE).

© 2026 N2 contributors. Feito para rodar no seu computador, com os seus dados.
