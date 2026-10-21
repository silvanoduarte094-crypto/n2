# N2 v0.2.0 · Núcleo de Inteligência

Versão de **profundidade**: o N2 passa a falar MCP nativamente, busca memórias
com embeddings locais, executa rotinas agendadas, mede custo/tokens/latência e
continua respondendo quando o provedor principal falha. Segue local-first, sem
telemetria e sob licença MIT.

## Download

- **`n2-windows-x64.zip`** — app portátil para Windows x64 com Node incluso.
  Extraia, execute `start.bat` e o navegador abre em `http://127.0.0.1:7331`.
- **`n2-source.zip`** — código-fonte completo.
- **`n2-windows-x64.zip.sha256`** — checksum do pacote.

## Novidades

### MCP nativo

- Cliente **Streamable HTTP** com handshake `initialize`, sessão
  `Mcp-Session-Id`, `tools/list` paginado e `tools/call`.
- Respostas em JSON ou **SSE**.
- Ferramentas descobertas viram `mcp_<conector>_<ferramenta>` no agente, além de
  `mcp_list_tools` e `mcp_call`.
- Botão **Testar MCP** no cadastro do conector.
- Falha de um servidor MCP não derruba o chat.

Guia: `docs/MCP.md`.

### RAG local

- Embeddings via **Ollama** (`nomic-embed-text`) ou API compatível com OpenAI.
- Vetores guardados no IndexedDB; reindexação manual na aba **Dados**.
- Busca **híbrida** (lexical + cosseno) com fallback lexical automático.
- Memórias sem relação com a pergunta deixam de ser injetadas no prompt.

### Rotinas agendadas

- Cron local de 5 campos com prévia da próxima execução.
- Execução manual, pausa, notificações e conversa `Rotina: <nome>`.
- Uma execução atrasada roda uma vez na próxima abertura, sem repetir o intervalo
  perdido em lote.

Guia: `docs/AUTOMATION.md`.

### Observabilidade

- Aba **Uso** com requisições, tokens, latência média e custo estimado.
- Gráfico dos últimos 7 dias e histórico por provedor/modelo.
- Preços por 1M de tokens configuráveis em cada provedor.
- Histórico local (máx. 5.000 registros), exportado no backup.

### Fallback entre provedores

- Lista ordenada de provedores de reserva em **Configurações → Agente**.
- A troca acontece somente se o provedor falhar **antes** de emitir texto ou
  ferramenta; a sessão e a mensagem passam a mostrar o modelo que respondeu.

### Prompt com variáveis

- `{{user}}`, `{{date}}`, `{{time}}`, `{{timezone}}`, `{{provider}}`,
  `{{model}}`, `{{tools}}` e `{{memories}}`.
- Inserção por chips e prévia com o contexto atual.

### Outros

- Banco IndexedDB **v2** com store `usage` e migração automática.
- Backup agora inclui o histórico de uso.
- Mock local de LLM ganhou endpoints de embeddings para testar RAG.
- CI cobre transporte, cron, MCP e memória/RAG.
- Versão 0.2.0 no app, bridge, service worker e pacote.

## Atualizando da v0.1.1

1. Extraia o novo zip em uma pasta separada (ou substitua os arquivos do app).
2. Abra normalmente. O banco é migrado de v1 para v2 sem apagar conversas.
3. Configurações existentes são preservadas; os novos campos começam desligados
   (RAG e fallback) ou vazios (rotinas).

## Requisitos

- Windows x64 (o pacote inclui o runtime) — ou qualquer navegador para a versão web.
- Node 24+ apenas para rodar a partir do código-fonte.
- Para RAG local: Ollama com um modelo de embeddings (ex.:
  `ollama pull nomic-embed-text`).

## Limitações conhecidas

- MCP **stdio** ainda não é executado pelo bridge; use um adaptador HTTP.
- Rotinas rodam apenas com o app aberto (não há daemon no bridge).
- Webhooks de entrada e gatilhos por evento continuam no roadmap.
- O custo é uma estimativa local baseada nos preços que você informar.

## Notas

- Projeto original sob licença MIT; não redistribui código ou modelos
  proprietários de terceiros.
- As chaves de API ficam somente no IndexedDB do navegador do usuário.
- Verifique o SHA256 em `n2-windows-x64.zip.sha256`.
- Nenhuma telemetria, analytics ou conta.

## Links

- Site/app web: <https://silvanoduarte094-crypto.github.io/n2/>
- Repositório: <https://github.com/silvanoduarte094-crypto/n2>
- MCP: `docs/MCP.md`
- Rotinas: `docs/AUTOMATION.md`
- Web e CORS: `docs/WEB.md`
- Arquitetura: `docs/ARCHITECTURE.md`
- Segurança: `SECURITY.md`
- Roadmap: `docs/ROADMAP.md`
