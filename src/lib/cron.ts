import type { Routine } from '../types';

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
];

function parseField(raw: string, index: number): Set<number> {
  const [min, max] = RANGES[index];
  const values = new Set<number>();
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) throw new Error(`Campo ${index + 1} do cron está vazio.`);
    const [rangePart, stepPart] = token.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Passo inválido no cron: "${token}".`);
    }
    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      start = Number(a);
      end = Number(b);
    } else {
      start = Number(rangePart);
      end = stepPart === undefined ? start : max;
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`Valor inválido no cron: "${token}".`);
    }
    if (start < min || end > max || start > end) {
      throw new Error(`Valor fora do intervalo ${min}-${max} no cron: "${token}".`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

export function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error('Use 5 campos: minuto hora dia mês dia-da-semana.');
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return {
    minute: parseField(minute, 0),
    hour: parseField(hour, 1),
    dayOfMonth: parseField(dayOfMonth, 2),
    month: parseField(month, 3),
    dayOfWeek: new Set([...parseField(dayOfWeek, 4)].map((value) => (value === 7 ? 0 : value))),
    domRestricted: dayOfMonth !== '*',
    dowRestricted: dayOfWeek !== '*',
  };
}

function dayMatches(date: Date, cron: CronFields): boolean {
  if (cron.domRestricted && cron.dowRestricted) {
    // Vixie cron: when both day fields are restricted, either one may match.
    return cron.dayOfMonth.has(date.getDate()) || cron.dayOfWeek.has(date.getDay());
  }
  if (cron.domRestricted) return cron.dayOfMonth.has(date.getDate());
  if (cron.dowRestricted) return cron.dayOfWeek.has(date.getDay());
  return true;
}

/** Next local-time occurrence strictly after `from`. Throws for invalid cron. */
export function nextCronTime(expression: string, from: Date = new Date()): number {
  const cron = parseCron(expression);
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = 366 * 24 * 60;
  for (let step = 0; step < limit; step += 1) {
    if (!cron.month.has(cursor.getMonth() + 1)) {
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      cursor.setMonth(cursor.getMonth() + 1);
      continue;
    }
    if (!dayMatches(cursor, cron)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!cron.hour.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!cron.minute.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1);
      continue;
    }
    return cursor.getTime();
  }
  throw new Error('O cron não tem próxima execução em até um ano.');
}

export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

export function nextRoutineRun(routine: Routine, now = Date.now()): number | null {
  if (!routine.enabled) return null;
  try {
    const base = new Date(Math.max(routine.lastRunAt || 0, routine.createdAt, now - 366 * 86_400_000));
    return nextCronTime(routine.cron, base);
  } catch {
    return null;
  }
}

export function isRoutineDue(routine: Routine, now = Date.now()): boolean {
  if (!routine.enabled) return false;
  const next = nextRoutineRun(routine, now);
  return next !== null && next <= now;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Short human description for the common cron shapes used by routines. */
export function describeCron(expression: string): string {
  try {
    const [minute, hour, dom, month, dow] = expression.trim().split(/\s+/);
    if (minute === '*' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      return 'a cada minuto';
    }
    if (/^\*\/\d+$/.test(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      return `a cada ${minute.split('/')[1]} min`;
    }
    if (/^\d+$/.test(minute) && hour === '*' && dom === '*' && month === '*' && dow === '*') {
      return `a cada hora, no minuto ${minute}`;
    }
    if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
      return `todo dia às ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    if (
      /^\d+$/.test(minute) &&
      /^\d+$/.test(hour) &&
      dom === '*' &&
      month === '*' &&
      /^\d$/.test(dow)
    ) {
      return `toda ${WEEKDAYS[Number(dow) % 7]} às ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    }
    if (/^\*\/\d+$/.test(minute) && /^\d+$/.test(hour) && dom === '*' && month === '*' && dow === '*') {
      return `a cada ${minute.split('/')[1]} min na hora ${hour}`;
    }
    return expression;
  } catch {
    return expression;
  }
}
