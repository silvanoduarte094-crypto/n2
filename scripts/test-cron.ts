import assert from 'node:assert/strict';
import { describeCron, isRoutineDue, nextCronTime, parseCron } from '../src/lib/cron';
import type { Routine } from '../src/types';

const checks: string[] = [];
function ok(name: string) {
  checks.push(name);
}

const every15 = parseCron('*/15 * * * *');
assert.deepEqual([...every15.minute].sort((a, b) => a - b), [0, 15, 30, 45]);
ok('cron: */15 expande os minutos');

const weekdays = parseCron('30 8 * * 1-5');
assert.deepEqual([...weekdays.dayOfWeek].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
ok('cron: faixa de dias úteis');

const tomorrow9 = nextCronTime('0 9 * * *', new Date(2026, 9, 21, 10, 0, 0));
const expected = new Date(2026, 9, 22, 9, 0, 0).getTime();
assert.equal(tomorrow9, expected);
ok('cron: próxima execução diária às 9h');

const monday = nextCronTime('30 8 * * 1-5', new Date(2026, 9, 23, 10, 0, 0));
assert.equal(monday, new Date(2026, 9, 26, 8, 30, 0).getTime());
ok('cron: fim de semana é pulado');

assert.match(describeCron('0 9 * * *'), /09:00/);
assert.match(describeCron('*/30 * * * *'), /30 min/);
ok('cron: descrição legível');

assert.throws(() => parseCron('0 25 * * *'), /intervalo/);
assert.throws(() => parseCron('0 9 * *'), /5 campos/);
ok('cron: entradas inválidas são rejeitadas');

const hourly: Routine = {
  id: 'r1',
  name: 'De hora em hora',
  prompt: 'Resumo',
  cron: '0 * * * *',
  enabled: true,
  notify: false,
  createdAt: Date.now() - 7_200_000,
  lastRunAt: Date.now() - 7_200_000,
};
assert.equal(isRoutineDue(hourly, Date.now()), true);
ok('rotina: atrasada é considerada devida');

const paused = { ...hourly, enabled: false };
assert.equal(isRoutineDue(paused, Date.now()), false);
ok('rotina: pausada não executa');

const future = { ...hourly, lastRunAt: Date.now(), createdAt: Date.now() };
assert.equal(isRoutineDue(future, Date.now()), false);
ok('rotina: recém-executada aguarda o próximo horário');

console.log(`✓ cron/rotinas: ${checks.length} verificações passaram`);
