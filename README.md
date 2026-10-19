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

---

## Sumário

- [Download](#download)
- [Primeiros passos](#primeiros-passos)
- [Provedores de IA](#provedores-de-ia)
- [GitHub Models (gratuito)](#github-models-gratuito)
- [MYRKAVELL e conectores](#myrkavell-e-conectores)
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

A versão web não inclui o bridge local. Para usá-la com um provedor real,
configure uma **Proxy URL** nas configurações (veja
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#bridge-local-e-proxy-remoto)) ou rode o
bridge em outra máquina. Sem proxy, você ainda pode usar Ollama em
`http://127.0.0.1:11434` se o navegador permitir.

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
CORS para o navegador, por isso o N2 usa o bridge local por padrão.

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
- Modo agente ligável/desligável e prompt de sistema editável

**Memória**

- Memórias persistentes com tags, fixar, editar e excluir
- Busca lexical e injeção das memórias relevantes no contexto
- Exportar/importar backup completo (conversas, memórias, conectores,
  configurações)

**Provedores**

- GitHub Models, OpenAI-compatível, Anthropic, Gemini e Ollama
- Streaming SSE unificado, teste de conexão, troca de modelo no chat

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
| `npm run mock:llm` | Mock de LLM em `:11434` |
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
git commit -m "feat: N2 v0.1.0"
git branch -M main
git remote add origin https://github.com/silvanoduarte094-crypto/n2.git
git push -u origin main
```

Depois crie uma tag para disparar o release:

```bash
git tag v0.1.0
git push origin v0.1.0
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
- [ ] Cliente MCP nativo
- [ ] RAG com embeddings locais
- [ ] Rotinas agendadas e webhooks de entrada
- [ ] Multiagentes e workspace de arquivos
- [ ] SDK de plugins e marketplace
- [ ] Apps móveis e sincronização opcional

Detalhes: [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Licença

MIT — veja [LICENSE](LICENSE).

© 2026 N2 contributors. Feito para rodar no seu computador, com os seus dados.
