# Roadmap do N2

Estado atual: **v0.2.0 — Fase 2 iniciada com MCP nativo, RAG local, rotinas,
observabilidade e fallback**. Abaixo, o que já existe e o que vem depois, na
ordem de prioridade.

## Fase 1 — MVP (concluída)

- [x] Chat com streaming, cancelar, regenerar e histórico
- [x] Markdown, realce de código, copiar bloco e tabelas
- [x] Provedores: GitHub Models, OpenAI-compatível, Anthropic, Gemini e Ollama
- [x] Teste de conexão e troca de modelo no topo do chat
- [x] Agente com até 8 etapas e ferramentas
- [x] Ferramentas: calculadora, data/hora, busca web, leitura de URL, GitHub,
      memória e conectores
- [x] Memória com tags, fixar, busca e injeção no contexto
- [x] Voz de saída e ditado por voz
- [x] Anexos de texto/imagem
- [x] Tema escuro/claro/sistema, cor de destaque e tamanho de texto
- [x] Command palette e atalhos
- [x] PWA instalável com service worker
- [x] IndexedDB, exportar/importar backup
- [x] Conectores REST, webhook e MCP (registro) + conector MYRKAVELL
- [x] Bridge local com proxy de streaming, CORS e token opcional
- [x] Modos de conexão Auto/Bridge/Direto + bridge gratuito via Codespaces
- [x] Empacotamento portátil para Windows e workflows de CI/Release

## Fase 2 — Profundidade (em andamento)

### Entregue na v0.2.0

- [x] Cliente MCP nativo via Streamable HTTP (respostas JSON e SSE)
- [x] RAG com embeddings locais (Ollama ou API compatível com OpenAI), busca
      híbrida e fallback lexical
- [x] Rotinas agendadas com cron local, notificações e execução manual
- [x] Editor de prompt de sistema com variáveis e pré-visualização
- [x] Observabilidade local: requisições, tokens, latência e custo estimado
- [x] Orquestração de provedores com fallback ordenado

### Próximos passos

#### Agente e conhecimento

- [ ] Suporte a MCP **stdio** via bridge (com allowlist de comandos)
- [ ] Indexação de arquivos e pastas locais pelo bridge
- [ ] Ferramenta de execução de código em sandbox
- [ ] Multiagentes: planejador, pesquisador e revisor
- [ ] Modo "auto" com orçamento de etapas e custo por mensagem

#### Automação

- [ ] Webhooks de entrada no bridge
- [ ] Gatilhos por evento (novo arquivo, nova memória, resposta do conector)
- [ ] Execução de rotinas com o app fechado (serviço no bridge)
- [ ] Integrações prontas: GitHub, Notion, Google Drive, Discord, Telegram, Slack
- [ ] Envio de e-mail via SMTP configurado pelo usuário

#### Produto

- [ ] Pasta de trabalho com árvore de arquivos e diff
- [ ] Imagens: geração e edição via provedores compatíveis
- [ ] Voz em tempo real (ida e volta sem clique)
- [ ] Sincronização opcional criptografada entre dispositivos
- [ ] Apps desktop (Tauri) e mobile (Capacitor)

#### Plataforma

- [ ] SDK de plugins (manifest + permissões)
- [ ] Marketplace de ferramentas e temas
- [ ] Workspaces de time com permissões
- [ ] Auto-update do pacote portátil

## Fase 3 — Escala

- [x] Orquestração de múltiplos provedores com fallback
- [ ] Fine-tuning assistido e datasets locais
- [ ] Modo offline com modelos pequenos via WebGPU
- [ ] API pública do N2 para outros apps
- [ ] Documentação multilíngue

## Como contribuir com o roadmap

Abra uma issue descrevendo o caso de uso, o impacto e uma proposta de
implementação. Itens pequenos e verificáveis entram mais rápido.
