/** All date maths is done on UTC calendar days so a transaction date never shifts. */

export const DAY_MS = 86_400_000;

export function toDateOnly(input: Date | string): Date {
  if (typeof input === 'string') return parseISODate(input.slice(0, 10));
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${value}`);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function startOfWeek(date: Date, weekStartsOn = 1): Date {
  const day = date.getUTCDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(toDateOnly(date), -diff);
}

export function endOfWeek(date: Date, weekStartsOn = 1): Date {
  return addDays(startOfWeek(date, weekStartsOn), 6);
}

export function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

/** Inclusive range for a `YYYY-MM` month key (defaults to the current month). */
export function monthRange(monthKey?: string): { start: Date; end: Date; key: string } {
  const now = new Date();
  const key = monthKey && /^\d{4}-\d{2}$/.test(monthKey)
    ? monthKey
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [y, m] = key.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  return { start, end: endOfMonth(start), key };
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function quarterRange(date: Date): { start: Date; end: Date } {
  const q = Math.floor(date.getUTCMonth() / 3);
  const start = new Date(Date.UTC(date.getUTCFullYear(), q * 3, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), q * 3 + 3, 0));
  return { start, end };
}

export function daysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let d = toDateOnly(start); d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
