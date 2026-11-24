import { prisma } from '../lib/prisma.js';
import { money } from '../lib/http.js';
import { transactionDto } from '../lib/serializers.js';
import {
  addDays,
  addMonths,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfYear,
  isoDate,
  toDateOnly,
} from '../lib/dates.js';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

type Row = {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amount: unknown;
  date: Date;
  description: string;
  notes: string | null;
  paymentMethod: string;
  categoryId: string | null;
  createdAt: Date;
  category: { id: string; name: string; color: string; icon: string } | null;
};

function rangeFor(period: ReportPeriod, end: Date) {
  if (period === 'daily') return addDays(end, -29);
  if (period === 'weekly') return addDays(startOfWeek(end), -77);
  if (period === 'monthly') return startOfMonth(addMonths(end, -11));
  return startOfYear(new Date(Date.UTC(end.getUTCFullYear() - 4, 0, 1)));
}

function bucketKey(period: ReportPeriod, date: Date) {
  if (period === 'daily') return isoDate(date);
  if (period === 'weekly') return isoDate(startOfWeek(date));
  if (period === 'monthly') return isoDate(date).slice(0, 7);
  return String(date.getUTCFullYear());
}

function bucketsFor(period: ReportPeriod, start: Date, end: Date) {
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  if (period === 'daily') {
    for (let day = start; day <= end; day = addDays(day, 1)) {
      buckets.push({
        key: isoDate(day),
        label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        start: day,
        end: day,
      });
    }
  } else if (period === 'weekly') {
    for (let week = start; week <= end; week = addDays(week, 7)) {
      buckets.push({
        key: isoDate(week),
        label: `${week.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`,
        start: week,
        end: addDays(week, 6),
      });
    }
  } else if (period === 'monthly') {
    for (let month = start; month <= end; month = addMonths(month, 1)) {
      const monthStart = startOfMonth(month);
      buckets.push({
        key: isoDate(monthStart).slice(0, 7),
        label: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        start: monthStart,
        end: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)),
      });
    }
  } else {
    const firstYear = start.getUTCFullYear();
    const lastYear = end.getUTCFullYear();
    for (let year = firstYear; year <= lastYear; year += 1) {
      buckets.push({
        key: String(year),
        label: String(year),
        start: new Date(Date.UTC(year, 0, 1)),
        end: endOfYear(new Date(Date.UTC(year, 0, 1))),
      });
    }
  }
  return buckets;
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function buildAnalytics(userId: string, period: ReportPeriod, dateInput?: string) {
  const end = dateInput ? toDateOnly(dateInput) : toDateOnly(new Date());
  const start = rangeFor(period, end);
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -(spanDays - 1));

  const [rows, previousTotals, currencySetting] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: start, lte: end } },
      include: { category: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: { gte: previousStart, lte: previousEnd } },
      _sum: { amount: true },
    }),
    prisma.userSettings.findUnique({ where: { userId }, select: { currency: true } }),
  ]);

  const typedRows = rows as unknown as Row[];
  const income = money(typedRows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + Number(r.amount), 0));
  const expense = money(typedRows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + Number(r.amount), 0));
  const previousIncome = money(previousTotals.find((t) => t.type === 'INCOME')?._sum.amount);
  const previousExpense = money(previousTotals.find((t) => t.type === 'EXPENSE')?._sum.amount);

  const buckets = bucketsFor(period, start, end);
  const series = buckets.map((bucket) => {
    const bucketRows = typedRows.filter((r) => bucketKey(period, r.date) === bucket.key);
    return {
      key: bucket.key,
      label: bucket.label,
      income: money(bucketRows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + Number(r.amount), 0)),
      expense: money(bucketRows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + Number(r.amount), 0)),
    };
  });

  const categoryMap = new Map<string, { name: string; color: string; icon: string; value: number; count: number }>();
  for (const row of typedRows.filter((r) => r.type === 'EXPENSE')) {
    const key = row.category?.name ?? 'Uncategorised';
    const entry = categoryMap.get(key) ?? {
      name: key,
      color: row.category?.color ?? '#94A3B8',
      icon: row.category?.icon ?? 'Tag',
      value: 0,
      count: 0,
    };
    entry.value += Number(row.amount);
    entry.count += 1;
    categoryMap.set(key, entry);
  }
  const categoryBreakdown = [...categoryMap.values()]
    .map((c) => ({ ...c, value: money(c.value), percentage: expense > 0 ? Math.round((c.value / expense) * 1000) / 10 : 0 }))
    .sort((a, b) => b.value - a.value);

  const paymentMethods = (['CASH', 'UPI', 'CARD', 'BANK'] as const).map((method) => {
    const methodRows = typedRows.filter((r) => r.paymentMethod === method);
    const total = money(methodRows.reduce((s, r) => s + Number(r.amount), 0));
    return {
      method,
      count: methodRows.length,
      total,
      percentage: expense + income > 0 ? Math.round((total / (expense + income)) * 1000) / 10 : 0,
    };
  });

  const weekdaySpend = Array.from({ length: 7 }, (_, index) => ({ day: index, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index]!, value: 0 }));
  for (const row of typedRows.filter((r) => r.type === 'EXPENSE')) {
    weekdaySpend[row.date.getUTCDay()]!.value += Number(row.amount);
  }
  weekdaySpend.forEach((d) => (d.value = money(d.value)));

  const topExpenses = typedRows
    .filter((r) => r.type === 'EXPENSE')
    .slice()
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5)
    .map((row) => transactionDto(row as never));

  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const label =
    period === 'daily'
      ? `${isoDate(start)} → ${isoDate(end)}`
      : period === 'weekly'
        ? `${isoDate(start)} → ${isoDate(end)}`
        : period === 'monthly'
          ? `${start.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })} → ${end.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`
          : `${start.getUTCFullYear()} → ${end.getUTCFullYear()}`;

  return {
    period,
    range: { start: isoDate(start), end: isoDate(end), previousStart: isoDate(previousStart), previousEnd: isoDate(previousEnd), days: dayCount, label },
    currency: currencySetting?.currency ?? 'INR',
    summary: {
      income,
      expense,
      net: money(income - expense),
      savingsRate: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0,
      transactions: typedRows.length,
      avgPerDay: money(expense / dayCount),
      avgTransaction: typedRows.length ? money(expense / Math.max(1, typedRows.filter((r) => r.type === 'EXPENSE').length)) : 0,
      topCategory: categoryBreakdown[0]?.name ?? null,
      largestExpense: topExpenses[0]?.amount ?? 0,
    },
    comparison: {
      previous: { income: previousIncome, expense: previousExpense, net: money(previousIncome - previousExpense) },
      incomeChange: pctChange(income, previousIncome),
      expenseChange: pctChange(expense, previousExpense),
      netChange: pctChange(income - expense, previousIncome - previousExpense),
    },
    series,
    categoryBreakdown,
    paymentMethods,
    weekdaySpend,
    topExpenses,
    transactions: typedRows.slice(0, 500).map((row) => transactionDto(row as never)),
  };
}

export type AnalyticsResult = Awaited<ReturnType<typeof buildAnalytics>>;
