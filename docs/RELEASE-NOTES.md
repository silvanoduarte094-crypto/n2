# N2 v0.1.1 · Núcleo de Inteligência

Versão focada na experiência **na web**: conexão direta ou via bridge, com um
bridge gratuito no GitHub Codespaces para provedores sem CORS (como GitHub
Models). Continua local-first, sem telemetria.

## Download

- **`n2-windows-x64.zip`** — app portátil para Windows x64 com Node incluso.
  Extraia, execute `start.bat` e o navegador abre em `http://127.0.0.1:7331`.
- **`n2-source.zip`** — código-fonte completo.

## Novidades

- **Três modos de conexão** em Configurações → Geral: **Automático**, **Bridge** e
  **Direto** (chamadas do navegador com CORS).
- **Fallback automático:** se o bridge não responder, o N2 repete a requisição
  direto do navegador quando o provedor permite.
- **Detecção de bridge ausente** com o marcador `x-n2-bridge` — mensagens de erro
  claras em vez de falhas silenciosas.
- **Bridge gratuito no Codespaces:** botão nas configurações, `.devcontainer`
  pronto, token gerado automaticamente e porta pública para a versão web.
- **Toggles por provedor:** “Chamadas diretas do navegador (CORS)” no cartão de
  cada provedor.
- **GitHub Models orientado:** aviso explícito no onboarding e nas configurações
  quando não há CORS disponível.
- Mocks locais agora enviam cabeçalhos CORS (úteis para testar o modo direto).

## O que funciona direto no navegador

| Provedor | Direto (CORS) |
| --- | --- |
| OpenAI | ✅ |
| Anthropic | ✅ (o N2 envia `anthropic-dangerous-direct-browser-access`) |
| Google Gemini | ✅ |
| Ollama local | ✅ (configure `OLLAMA_ORIGINS`) |
| GitHub Models | ❌ — use o bridge local ou o do Codespaces |

Guia completo: `docs/WEB.md`.

## Como usar

1. Baixe `n2-windows-x64.zip` e extraia.
2. Execute `start.bat`.
3. Configure um provedor no onboarding. Para GitHub Models, crie um token com
   `models:read` em <https://github.com/settings/tokens>.
4. Na web (GitHub Pages), use OpenAI/Anthropic/Gemini/Ollama direto ou abra um
   bridge no Codespaces para GitHub Models.

## Requisitos

- Windows x64 (o pacote inclui o runtime) — ou qualquer navegador para a versão web.
- Node 20+ apenas para rodar a partir do código-fonte.

## Notas

- O N2 é um projeto original sob licença MIT; não redistribui código ou modelos
  proprietários de terceiros.
- As chaves de API ficam somente no IndexedDB do navegador do usuário.
- Verifique o SHA256 em `n2-windows-x64.zip.sha256`.

## Links

- Documentação: `docs/`
- Web (modos de conexão): `docs/WEB.md`
- Arquitetura: `docs/ARCHITECTURE.md`
- Segurança: `SECURITY.md`
- Roadmap: `docs/ROADMAP.md`
