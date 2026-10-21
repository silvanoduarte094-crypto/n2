# N2 na web (GitHub Pages)

A versão web do N2 é a mesma aplicação do pacote Windows, servida como site
estático em `https://silvanoduarte094-crypto.github.io/n2/`.

Como não existe servidor nessa página, o N2 oferece **três modos de conexão**
(**Configurações → Geral → Conexão**):

| Modo | O que faz |
| --- | --- |
| **Automático** (padrão) | Usa o bridge quando ele existe; sem bridge, chama o provedor direto do navegador. |
| **Bridge** | Todo o tráfego passa pelo bridge (`/api/proxy` local ou a *Proxy URL* configurada). |
| **Direto** | As requisições saem do navegador (`fetch` com CORS), sem bridge. |

## O que funciona direto no navegador

Testado com os cabeçalhos CORS reais de cada API (set/2026):

| Provedor | Direto no navegador? | Observação |
| --- | --- | --- |
| OpenAI | ✅ | `Access-Control-Allow-Origin: *`. |
| Anthropic | ✅ | Exige o cabeçalho `anthropic-dangerous-direct-browser-access` — o N2 já envia. |
| Google Gemini | ✅ | CORS liberado no `generativelanguage.googleapis.com`. |
| Ollama (local) | ✅ | Rode com `OLLAMA_ORIGINS=*` (ou a origem do app) para aceitar a chamada. |
| GitHub Models | ❌ | A API **não envia CORS**; precisa de bridge. |
| APIs próprias | varia | Se o provedor liberar CORS, funciona direto. |

> **Chaves:** no modo direto, a chave vai do seu navegador direto ao provedor.
> Ela continua salva apenas no IndexedDB deste dispositivo — nada passa pelo N2.

## MCP e embeddings na web

Servidores **MCP** normalmente são locais e não enviam CORS. Na versão web pura,
o servidor precisa liberar a origem do Pages e expor `mcp-session-id`; caso
contrário, use o app completo com bridge. O bridge já repassa os cabeçalhos de
sessão MCP.

Para **RAG**, o endpoint de embeddings também precisa de CORS. Ollama exige
`OLLAMA_ORIGINS`; OpenAI-compatíveis normalmente liberam. Sem embeddings, a
busca lexical continua funcionando.

## Bridge grátis no Codespaces (recomendado para GitHub Models)

1. Clique em **Configurações → Geral → “Abrir bridge gratuito no Codespaces”**
   (ou acesse `https://codespaces.new/silvanoduarte094-crypto/n2`).
2. Aguarde o container subir. O terminal mostra:

   ```
   ======================================================
     N2 bridge ativo no Codespaces

     Proxy URL : https://SEU-CODESPACE-7331.app.github.dev
     Token     : xxxxxxxxxxxxxxxxxxxxxxxx
   ======================================================
   ```

3. Na versão web, abra **Configurações → Geral** e cole:
   - **Proxy / bridge**: a URL mostrada (a porta 7331 já vem pública).
   - **Token do proxy**: o token gerado (o bridge remoto exige `N2_PROXY_TOKEN`).
4. Pronto: GitHub Models e qualquer provedor passam a funcionar pela web.

O bridge também serve a interface completa em `https://SEU-CODESPACE-7331.app.github.dev`
— útil como uma segunda cópia acessível de qualquer navegador.

Para encerrar o gasto de horas do Codespaces, pare o container no
[github.com/codespaces](https://github.com/codespaces). O token fica salvo em
`.codespace-token` (fora do controle de versão).

## Proxy próprio (opcional)

Qualquer servidor que rode `server/dist/server.cjs` serve como bridge remoto:

```bash
N2_HOST=0.0.0.0 N2_PORT=7331 N2_PROXY_TOKEN=um-segredo-forte npm start
```

No app: **Proxy / bridge** = `https://seu-servidor` e **Token do proxy** = o segredo.

## Diagnóstico

- **“O navegador não conseguiu chamar X diretamente (CORS ou rede)”** — o provedor
  não libera CORS. Ative o bridge (local/Codespaces) ou use outro provedor.
- **“GitHub Models não permite chamadas diretas…”** — esperado; use o bridge.
- **Ollama em página https** — o Chrome permite chamar `http://127.0.0.1` de páginas
  seguras (loopback é considerado confiável). Se falhar, configure `OLLAMA_ORIGINS`.
- **Modo Automático** — se o bridge cair, as requisições são repetidas direto do
  navegador automaticamente (quando o provedor permite).
