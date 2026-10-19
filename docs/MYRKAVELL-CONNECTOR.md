# Conector MYRKAVELL ↔ N2

Contrato de integração entre o N2 e o MYRKAVELL (e, por analogia, outros sistemas).
O objetivo é que o agente do N2 consulte e envie dados ao MYRKAVELL com segurança,
sem conhecimento prévio do código interno de cada lado.

## Como o N2 chama o conector

O agente usa a ferramenta `connector_call`:

```json
{
  "connector": "MYRKAVELL",
  "path": "status",
  "method": "GET",
  "body": { "opcional": true }
}
```

O N2 resolve `connector` pelo nome cadastrado em **Configurações → Conectores**,
monta a URL (`baseUrl` + `path`) e envia o token configurado no cabeçalho
`Authorization`.

Regras de comportamento:

- O agente só chama o conector quando o usuário pede ou a intenção é explícita.
- Um conector marcado como **inativo** não é oferecido ao agente.
- A resposta é devolvida como texto/JSON e inserida no contexto da conversa.
- Erros de rede/HTTP não derrubam o chat; viram resultado de ferramenta.

## Cadastro no N2

| Campo | Exemplo | Obrigatório |
| --- | --- | --- |
| Nome | `MYRKAVELL` | Sim |
| Tipo | `rest` (também aceita `webhook` e `mcp`) | Sim |
| URL base | `https://api.myrkavell.example/v1` | Sim |
| Método padrão | `GET` / `POST` | Sim |
| Authorization | `Bearer eyJ…` | Recomendado |
| Descrição | `Projeto MYRKAVELL: tarefas, memórias e status.` | Recomendado |
| Ativo | ligado | Sim |

O token fica somente no IndexedDB e é enviado ao MYRKAVELL pelo bridge; ele não é
registrado em logs.

## Contrato REST sugerido

Todos os endpoints abaixo são **sugestões** — o N2 aceita qualquer REST cujo
resultado seja texto ou JSON. Versione a API no caminho (`/v1`).

### `GET /v1/status`

Retorna o estado do projeto.

```json
{
  "project": "MYRKAVELL",
  "status": "online",
  "version": "0.4.0",
  "agents": 3,
  "memory_items": 128,
  "last_sync": "2026-10-19T20:00:00Z"
}
```

### `GET /v1/tasks?status=todo&limit=20`

Lista tarefas.

```json
{
  "tasks": [
    { "id": "T-001", "title": "Definir contrato do conector", "status": "done", "priority": "high" },
    { "id": "T-002", "title": "Publicar build", "status": "todo", "priority": "medium" }
  ]
}
```

### `POST /v1/tasks`

Cria uma tarefa.

```json
{
  "title": "Integrar N2 ao MYRKAVELL",
  "description": "Validar auth, CORS e fluxo de memória.",
  "priority": "high",
  "metadata": { "source": "n2", "session": "abc123" }
}
```

Resposta esperada: `201 Created` com a tarefa criada (incluindo `id`).

### `GET /v1/memory/search?q=termo&limit=10`

Busca memórias.

```json
{
  "results": [
    { "id": "M-7", "text": "Decisão: usar SSE no bridge.", "tags": ["arquitetura"], "score": 0.87 }
  ]
}
```

### `POST /v1/memory`

Grava uma memória.

```json
{ "text": "O N2 usa IndexedDB para persistência.", "tags": ["n2"], "source": "n2" }
```

### `POST /v1/events`

Recebe eventos enviados pelo N2 (webhook de saída).

```json
{ "type": "task.created", "payload": { "id": "T-003" }, "at": "2026-10-19T20:00:00Z" }
```

## Autenticação e escopos

Sugestão de escopos para tokens do MYRKAVELL:

| Escopo | Permite |
| --- | --- |
| `read:status` | `GET /status` |
| `read:tasks` | `GET /tasks` |
| `write:tasks` | `POST /tasks` |
| `read:memory` | `GET /memory/search` |
| `write:memory` | `POST /memory` |

Boas práticas:

- Tokens com prazo de validade e rotação.
- Um token por instalação do N2.
- Nunca aceitar o token em query string.
- Responder `401` para token inválido e `403` para escopo insuficiente.

## Erros

Use o envelope:

```json
{ "error": { "code": "invalid_scope", "message": "Token sem permissão write:tasks." } }
```

| Código HTTP | Significado para o N2 |
| --- | --- |
| `400` | Payload inválido; o agente deve corrigir e tentar de novo |
| `401` | Token inválido; o usuário precisa revisar o conector |
| `403` | Escopo insuficiente |
| `404` | Recurso/rota inexistente |
| `429` | Limite de taxa; respeitar `Retry-After` |
| `5xx` | Falha temporária do MYRKAVELL |

## Idempotência e limites

- Para `POST`, aceite o cabeçalho `Idempotency-Key` e devolva a mesma resposta em
  repetições.
- Limite o tamanho de payload (o N2 corta em 12 MB no bridge).
- Pagine listas grandes com `limit`/`cursor` e devolva `next_cursor`.

## CORS

Se o MYRKAVELL for chamado pelo bridge local do N2, **não** é necessário CORS:
o bridge faz a requisição servidor a servidor. Se você for chamar o MYRKAVELL
direto do navegador, habilite CORS apenas para as origens confiáveis.

## MCP (roadmap)

O N2 já aceita cadastrar um conector do tipo `mcp`, mas o cliente MCP nativo
ainda não está implementado. Quando estiver, o MYRKAVELL poderá expor ferramentas
como:

| Ferramenta MCP | Equivalente REST |
| --- | --- |
| `myrkavell_status` | `GET /v1/status` |
| `myrkavell_tasks_list` | `GET /v1/tasks` |
| `myrkavell_task_create` | `POST /v1/tasks` |
| `myrkavell_memory_search` | `GET /v1/memory/search` |

Enquanto isso, use REST — o resultado é o mesmo para o agente.

## Teste rápido local

O repositório inclui um mock do contrato:

```bash
npm run mock:myrkavell   # http://127.0.0.1:8788/v1
```

Endpoints: `/v1/status`, `/v1/tasks`, `/v1/echo`.

Depois, no app: cadastre a URL `http://127.0.0.1:8788/v1` e peça ao agente
_"Consulte o status no MYRKAVELL"_.

## Checklist de integração

- [ ] Definir URL base e versão
- [ ] Emitir token com escopos mínimos
- [ ] Implementar `/status`
- [ ] Implementar `/tasks` (listar e criar)
- [ ] Implementar `/memory/search` e `/memory` (opcional)
- [ ] Padronizar erros e limites
- [ ] Testar com `npm run mock:myrkavell`
- [ ] Cadastrar conector no N2 e validar no chat
