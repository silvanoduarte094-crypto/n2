# N2 v0.1.0 · Núcleo de Inteligência

Primeira versão pública do N2: um app de IA local-first com chat, agentes,
memória, voz e conectores. Sem telemetria. Seus dados ficam no seu dispositivo.

## Download

- **`n2-windows-x64.zip`** — app portátil para Windows x64 com Node incluso.
  Extraia, execute `start.bat` e o navegador abre em `http://127.0.0.1:7331`.
- **`n2-source.zip`** — código-fonte completo.

## Destaques

- **Chat com streaming** em tempo real, Markdown, realce de código, regenerar e
  cancelar.
- **Cinco provedores:** GitHub Models (padrão), OpenAI-compatível, Anthropic,
  Gemini e Ollama local.
- **Agente com ferramentas:** calculadora, data/hora, busca na web, leitura de
  URLs, GitHub, memória e conectores — até 8 etapas por mensagem.
- **Memória durável** com tags, fixar, busca e injeção no contexto.
- **Voz:** ditado por Web Speech API e leitura de respostas em voz alta.
- **Conectores:** REST, webhook e MCP (registro), com integração MYRKAVELL
  pronta para uso. Contrato em `docs/MYRKAVELL-CONNECTOR.md`.
- **PWA instalável**, temas escuro/claro/sistema, command palette e atalhos.
- **Backup completo** via exportar/importar JSON.
- **Bridge local** que protege as chaves e evita CORS, com token opcional para
  bridges remotos.

## Como usar

1. Baixe `n2-windows-x64.zip` e extraia.
2. Execute `start.bat`.
3. Configure um provedor no onboarding. Para GitHub Models, crie um token com
   `models:read` em <https://github.com/settings/tokens>.

## Requisitos

- Windows x64 (o pacote inclui o runtime).
- Para a versão web (GitHub Pages), um bridge/proxy configurado ou Ollama local.

## Notas

- O N2 é um projeto original sob licença MIT; não redistribui código ou modelos
  proprietários de terceiros.
- As chaves de API ficam somente no IndexedDB do navegador do usuário.
- Verifique o SHA256 em `n2-windows-x64.zip.sha256`.

## Links

- Documentação: `docs/`
- Arquitetura: `docs/ARCHITECTURE.md`
- Segurança: `SECURITY.md`
- Roadmap: `docs/ROADMAP.md`
