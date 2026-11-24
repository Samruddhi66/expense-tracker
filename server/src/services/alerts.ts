import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { addDays, addMonths, addYears, isoDate, monthRange, toDateOnly } from '../lib/dates.js';
import { money } from '../lib/http.js';
import { sendMail, budgetAlertEmail } from '../lib/mailer.js';
import { budgetProgressFor, budgetsOverlapping } from './budgets.js';

async function createNotificationOnce(
  userId: string,
  type: 'BUDGET_ALERT' | 'BILL_REMINDER' | 'SAVINGS' | 'MONTHLY_SUMMARY' | 'SYSTEM',
  title: string,
  message: string,
  data: Prisma.InputJsonValue
) {
  const existing = await prisma.notification.findFirst({
    where: { userId, type, data: { equals: data } },
  });
  if (existing) return null;
  return prisma.notification.create({ data: { userId, type, title, message, data } });
}

/** Creates notifications when a budget crosses 80% or 100% in its current window. */
export async function evaluateBudgetAlerts(userId: string): Promise<void> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings && !settings.notifyBudgetAlerts) return;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const budgets = await budgetsOverlapping(userId, monthStart, monthEnd);
  if (budgets.length === 0) return;

  const progress = await budgetProgressFor(budgets, userId);
  for (const item of progress) {
    const { budget, percentage, spent, amount } = item;
    const name = budget.name ?? budget.category?.name ?? 'Overall';
    for (const threshold of [80, 100] as const) {
      if (percentage < threshold) continue;
      const data = { budgetId: budget.id, threshold, periodStart: isoDate(budget.startDate) };
      const notification = await createNotificationOnce(
        userId,
        'BUDGET_ALERT',
        threshold >= 100 ? `Budget exceeded: ${name}` : `Budget almost used: ${name}`,
        threshold >= 100
          ? `You have used your full ${amount.toFixed(2)} budget for ${name} (${spent.toFixed(2)} spent).`
          : `You have used ${percentage}% of your ${amount.toFixed(2)} budget for ${name}.`,
        data
      );
      if (notification && env.emailConfigured) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });
        if (user && settings?.notifyBudgetAlerts !== false) {
          sendMail({ ...budgetAlertEmail(user.name, notification.title, notification.message), to: user.email }).catch(
            () => undefined
          );
        }
      }
    }
  }
}

/** Reminders for recurring transactions that are about to run. */
export async function evaluateBillReminders(userId?: string): Promise<void> {
  const today = toDateOnly(new Date());
  const users = userId ? [{ id: userId }] : await prisma.user.findMany({ select: { id: true } });

  for (const user of users) {
    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    if (settings && !settings.notifyBillReminders) continue;

    const upcoming = await prisma.recurringTransaction.findMany({
      where: { userId: user.id, isActive: true, nextRunDate: { gte: today } },
    });
    for (const item of upcoming) {
      const daysAway = Math.ceil((item.nextRunDate.getTime() - today.getTime()) / 86_400_000);
      if (daysAway > item.reminderDays) continue;
      await createNotificationOnce(
        user.id,
        'BILL_REMINDER',
        `Upcoming ${item.type === 'EXPENSE' ? 'payment' : 'income'}: ${item.description}`,
        `${item.description} (${money(item.amount).toFixed(2)}) is scheduled for ${isoDate(item.nextRunDate)}${
          daysAway === 0 ? ' — today' : ''
        }.`,
        { recurringId: item.id, dueDate: isoDate(item.nextRunDate) }
      );
    }
  }
}

function advance(date: Date, frequency: string, interval: number): Date {
  if (frequency === 'DAILY') return addDays(date, interval);
  if (frequency === 'WEEKLY') return addDays(date, 7 * interval);
  if (frequency === 'YEARLY') return addYears(date, interval);
  return addMonths(date, interval);
}

export type RecurringRunResult = { created: number; advanced: number };

/** Materialises every due occurrence of recurring transactions as real transactions. */
export async function processRecurring(userId?: string): Promise<RecurringRunResult> {
  const today = toDateOnly(new Date());
  const items = await prisma.recurringTransaction.findMany({
    where: { isActive: true, nextRunDate: { lte: today }, ...(userId ? { userId } : {}) },
  });

  let created = 0;
  for (const item of items) {
    let next = toDateOnly(item.nextRunDate);
    let occurrences = 0;
    while (next <= today && (!item.endDate || next <= item.endDate) && occurrences < 400) {
      await prisma.transaction.create({
        data: {
          userId: item.userId,
          categoryId: item.categoryId,
          type: item.type,
          amount: item.amount,
          description: item.description,
          paymentMethod: item.paymentMethod,
          date: next,
          recurringId: item.id,
        },
      });
      created += 1;
      occurrences += 1;
      next = toDateOnly(advance(next, item.frequency, item.interval));
    }

    const finished = Boolean(item.endDate && next > item.endDate);
    await prisma.recurringTransaction.update({
      where: { id: item.id },
      data: {
        nextRunDate: next,
        lastRunAt: new Date(),
        isActive: finished ? false : item.isActive,
      },
    });
    if (occurrences > 0) await evaluateBudgetAlerts(item.userId);
  }
  return { created, advanced: items.length };
}

/** Monthly summary notification for the previous month (one per month). */
export async function evaluateMonthlySummaries(): Promise<void> {
  const now = new Date();
  const prev = monthRange(
    `${new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).getUTCFullYear()}-${String(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).getUTCMonth() + 1
    ).padStart(2, '0')}`
  );
  const label = prev.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, settings: true } });
  for (const user of users) {
    if (user.settings && !user.settings.notifyMonthlySummary) continue;
    const [income, expense] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId: user.id, type: 'INCOME', date: { gte: prev.start, lte: prev.end } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId: user.id, type: 'EXPENSE', date: { gte: prev.start, lte: prev.end } },
        _sum: { amount: true },
      }),
    ]);
    const totalIncome = money(income._sum.amount);
    const totalExpense = money(expense._sum.amount);
    if (totalIncome === 0 && totalExpense === 0) continue;
    await createNotificationOnce(
      user.id,
      'MONTHLY_SUMMARY',
      `Your ${label} summary is ready`,
      `Income ${totalIncome.toFixed(2)}, expenses ${totalExpense.toFixed(2)}, saved ${(
        totalIncome - totalExpense
      ).toFixed(2)}.`,
      { month: prev.key }
    );
  }
}

export async function runScheduledJobs(): Promise<void> {
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ['recurring processing', () => processRecurring()],
    ['bill reminders', () => evaluateBillReminders()],
    ['monthly summaries', () => (toDateOnly(new Date()).getUTCDate() === 1 ? evaluateMonthlySummaries() : Promise.resolve())],
  ];
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (error) {
      console.error(`[scheduler] ${name} failed`, error);
    }
  }
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) await evaluateBudgetAlerts(user.id);
  } catch (error) {
    console.error('[scheduler] budget alerts failed', error);
  }
}
