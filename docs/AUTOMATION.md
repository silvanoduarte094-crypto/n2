# Rotinas agendadas

Rotinas transformam uma instrução em uma mensagem nova no chat, executada no
horário definido por uma expressão **cron de 5 campos**, no fuso local do
dispositivo.

## Criar uma rotina

1. Abra **Configurações → Rotinas → Nova rotina**.
2. Dê um nome (ex.: `Resumo matinal`).
3. Escreva a instrução. Ela vira uma mensagem de usuário em uma conversa
   `Rotina: <nome>`.
4. Informe o cron ou use um dos exemplos.
5. Escolha se a rotina fica ativa e se deve notificar ao terminar.

O rodapé mostra a descrição legível e a próxima execução antes de salvar.

## Formato do cron

```
minuto  hora  dia-do-mês  mês  dia-da-semana
  0-59  0-23     1-31     1-12     0-6 (0 = domingo)
```

Aceita `*`, listas (`1,3,5`), faixas (`1-5`) e passos (`*/15`, `0-30/10`).
Quando dia-do-mês e dia-da-semana são restritos ao mesmo tempo, vale a regra do
cron clássico: **qualquer um dos dois** pode casar.

| Cron | Quando roda |
| --- | --- |
| `*/30 * * * *` | A cada 30 minutos |
| `0 * * * *` | A cada hora, no minuto 0 |
| `0 9 * * *` | Todo dia às 9h |
| `0 8 * * 1-5` | Segunda a sexta às 8h |
| `30 18 1 * *` | Dia 1 de cada mês às 18h30 |

## Como a execução funciona

- O agendador roda no aplicativo enquanto ele estiver aberto (verifica a cada
  30 segundos).
- A rotina usa o **provedor ativo**, as ferramentas, a memória e a cadeia de
  fallback configurada.
- Ao concluir, `lastRunAt` é atualizado e o horário seguinte é recalculado.
- Se o app estava fechado no horário, a rotina atrasada roda **uma vez** na
  próxima abertura; intervalos perdidos não são repetidos em lote.
- Se uma execução falhar (por exemplo, sem API key), o N2 tenta de novo no
  máximo a cada 5 minutos, sem criar uma tempestade de mensagens.
- Uma rotina por vez: se já houver resposta em andamento, a execução espera a
  próxima verificação.

## Notificações

A opção **Notificar ao concluir** usa a API de notificações do navegador. Na
primeira vez, o N2 oferece o botão **Permitir notificações** na aba Rotinas. Sem
permissão, a rotina executa normalmente e o resultado fica no chat.

## Limitações

- Não há daemon em segundo plano: para execução com o app fechado seria preciso
  um serviço no bridge, ainda não incluído.
- Webhooks de entrada e gatilhos por evento (novo arquivo, nova memória, resposta
  de conector) estão no roadmap.
- Rotinas não têm permissões separadas; elas herdam o acesso do agente ativo.
  Revise a instrução antes de ativar uma rotina que usa conectores.

## Testes

O parser e o cálculo de próxima execução têm testes próprios:

```bash
npm run test:cron
```
