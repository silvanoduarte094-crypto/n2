# Segurança

## Modelo de ameaças

O N2 roda no computador do usuário, guarda dados no navegador e conversa com
provedores de IA escolhidos por ele. Os riscos considerados são:

1. Vazamento de chaves de API.
2. Execução de instruções maliciosas vindas de conteúdo externo (prompt
   injection).
3. Requisições a destinos internos indevidos (SSRF) pelo bridge.
4. Exposição do bridge local na rede.
5. Perda de dados locais.

## O que o N2 faz

- **Chaves nunca no bundle.** Cada usuário cola a própria chave; ela fica no
  IndexedDB e só vai ao provedor via bridge.
- **Sem telemetria.** Nenhum evento, métrica ou identificador é enviado.
- **Bridge em `127.0.0.1`.** Por padrão, só a própria máquina acessa.
- **Ferramentas explícitas.** O agente só usa as ferramentas declaradas e os
  conectores MCP ativos, no máximo 8 etapas por mensagem.
- **Conteúdo é dado, não comando.** Respostas do modelo e resultados de
  ferramentas são renderizados como Markdown sanitizado (DOMPurify), nunca como
  HTML executável.
- **Links externos** recebem `rel="noopener noreferrer"` e abrem em nova aba.
- **Backup manual.** Exportar/importar é uma ação explícita do usuário.

## MCP, rotinas e embeddings

- **Servidores MCP são confiáveis por definição.** Ao cadastrar um servidor, você
  permite que o agente liste e chame as ferramentas que ele expõe. Adicione apenas
  servidores que você controla ou confia, e revise as permissões do token usado.
- **Rotinas herdam o acesso do agente.** Uma rotina pode chamar conectores e
  ferramentas sem confirmação interativa; revise a instrução e o agendamento
  antes de ativá-la.
- **Embeddings enviam o texto da memória** para o endpoint configurado (Ollama
  local ou API compatível com OpenAI). Com Ollama em `127.0.0.1`, o texto não sai
  da máquina.
- **Uso fica local.** Tokens, latência e custo são gravados apenas no IndexedDB e
  entram no backup se você exportar.

## Recomendações ao usuário

- Trate o bridge local como parte do seu computador: não exponha `N2_HOST=0.0.0.0`
  sem `N2_PROXY_TOKEN`.
- Use tokens de API com escopo mínimo e rotação periódica.
- Não cole segredos em conversas que você não quer persistidos no IndexedDB.
- Revise permissões de conectores (REST/webhook) antes de ativá-los.
- Faça backup (Configurações → Dados → Exportar) antes de limpar o navegador.

## Recomendações para bridges remotos

Se você publicar o bridge em um servidor:

1. Defina `N2_PROXY_TOKEN` com um valor longo e aleatório.
2. Coloque HTTPS na frente (reverse proxy).
3. Restrinja a origem CORS ao seu domínio, se possível.
4. Monitore uso e limite taxa.
5. Nunca registre corpos de requisição com dados sensíveis.

## SSRF e ferramentas

O bridge bloqueia endpoints de metadata conhecidos (`169.254.169.254`,
`metadata.google.internal`, `metadata.azure.com` e variantes) e valida o esquema
das URLs. Ainda assim, um modelo pode tentar acessar outros endereços internos;
por isso, em ambientes sensíveis, mantenha o bridge na máquina local ou use uma
lista de permissões de domínios.

## Prompt injection

Conteúdo de páginas e arquivos pode conter instruções maliciosas. O N2:

- separa prompt de sistema de conteúdo de ferramenta;
- exibe resultados de ferramentas em blocos separados;
- pede confirmação implícita do usuário ao chamar conectores somente quando o
  pedido é explícito.

Mitigações recomendadas:

- Desligue o modo agente ao processar conteúdo não confiável.
- Revise os cartões de ferramenta antes de agir sobre resultados.
- Prefira conectores com escopo de leitura.

## Divulgação responsável

Encontrou uma vulnerabilidade? Abra uma issue com o rótulo `security` **sem**
incluir dados sensíveis e sem explorar o problema publicamente. Se o caso exigir
privacidade, descreva a vulnerabilidade e peça um canal privado.

## Dados e privacidade

- Conversas, memórias, conectores e configurações ficam no IndexedDB.
- Excluir dados pelo navegador remove tudo permanentemente.
- Exportações são arquivos JSON no seu computador — guarde-os com cuidado.
