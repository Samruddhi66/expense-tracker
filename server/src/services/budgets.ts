import type { Budget, Category } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { money } from '../lib/http.js';
import {
  endOfMonth,
  endOfWeek,
  isoDate,
  startOfMonth,
  startOfWeek,
  toDateOnly,
} from '../lib/dates.js';

export type BudgetPeriodKey = 'WEEKLY' | 'MONTHLY';

/** Resolve the inclusive period window for a budget anchored on a date. */
export function periodWindow(period: BudgetPeriodKey, reference: Date, weekStartsOn = 1) {
  if (period === 'WEEKLY') {
    return { startDate: startOfWeek(reference, weekStartsOn), endDate: endOfWeek(reference, weekStartsOn) };
  }
  return { startDate: startOfMonth(reference), endDate: endOfMonth(reference) };
}

export type BudgetWithCategory = Budget & { category: Category | null };

export type BudgetProgress = {
  budget: BudgetWithCategory;
  spent: number;
  amount: number;
  remaining: number;
  percentage: number;
  status: 'safe' | 'warning' | 'exceeded';
  daysLeft: number;
};

/** Precise progress for each budget (expenses only, inside its own window). */
export async function budgetProgressFor(
  budgets: BudgetWithCategory[],
  userId: string
): Promise<BudgetProgress[]> {
  const today = toDateOnly(new Date());
  return Promise.all(
    budgets.map(async (budget) => {
      const agg = await prisma.transaction.aggregate({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: budget.startDate, lte: budget.endDate },
          ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
        },
        _sum: { amount: true },
      });
      const spent = money(agg._sum.amount);
      const amount = money(budget.amount);
      const percentage = amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0;
      return {
        budget,
        spent,
        amount,
        remaining: money(amount - spent),
        percentage,
        status: percentage >= 100 ? 'exceeded' : percentage >= 80 ? 'warning' : 'safe',
        daysLeft: Math.max(0, Math.ceil((budget.endDate.getTime() - today.getTime()) / 86_400_000)),
      } as BudgetProgress;
    })
  );
}

export function singleBudgetProgress(budget: BudgetWithCategory, userId: string) {
  return budgetProgressFor([budget], userId).then((rows) => rows[0]!);
}

/** Budgets of one user whose window overlaps [start,end] (usually the current month). */
export function budgetsOverlapping(userId: string, start: Date, end: Date) {
  return prisma.budget.findMany({
    where: { userId, startDate: { lte: end }, endDate: { gte: start } },
    include: { category: true },
    orderBy: [{ period: 'asc' }, { createdAt: 'asc' }],
  });
}

export function periodLabel(budget: Budget): string {
  if (budget.period === 'WEEKLY') {
    return `${isoDate(budget.startDate)} → ${isoDate(budget.endDate)}`;
  }
  return budget.startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
