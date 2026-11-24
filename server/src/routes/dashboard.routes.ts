import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, money } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { transactionDto } from '../lib/serializers.js';
import {
  addDays,
  addMonths,
  daysInRange,
  endOfMonth,
  formatMonthLabel,
  isoDate,
  monthRange,
  startOfMonth,
  toDateOnly,
} from '../lib/dates.js';
import { budgetProgressFor, budgetsOverlapping } from '../services/budgets.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    const { start, end, key } = monthRange(month);
    const now = toDateOnly(new Date());
    const today = now > end ? end : now < start ? start : now;

    const chartStart = startOfMonth(addMonths(start, -5));
    const weekStart = addDays(today, -6);

    const [monthTransactions, chartTransactions, recent, unread, goalRows, upcomingRecurring, activeRecurring] =
      await Promise.all([
        prisma.transaction.findMany({
          where: { userId, date: { gte: start, lte: end } },
          select: { type: true, amount: true, categoryId: true, date: true },
        }),
        prisma.transaction.findMany({
          where: {
            userId,
            date: { gte: chartStart < weekStart ? chartStart : weekStart, lte: end },
          },
          select: { type: true, amount: true, date: true },
        }),
        prisma.transaction.findMany({
          where: { userId },
          include: { category: true },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 8,
        }),
        prisma.notification.count({ where: { userId, isRead: false } }),
        prisma.savingsGoal.findMany({
          where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
          include: { contributions: { select: { amount: true } } },
          orderBy: { targetDate: 'asc' },
        }),
        prisma.recurringTransaction.findMany({
          where: { userId, isActive: true, nextRunDate: { gte: now } },
          include: { category: true },
          orderBy: { nextRunDate: 'asc' },
          take: 5,
        }),
        prisma.recurringTransaction.count({ where: { userId, isActive: true } }),
      ]);

    const [allTimeIncome, allTimeExpense, monthByCategory] = await Promise.all([
      prisma.transaction.aggregate({ where: { userId, type: 'INCOME' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { userId, type: 'EXPENSE' }, _sum: { amount: true } }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { userId, type: 'EXPENSE', date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
    ]);

    const monthIncome = money(
      monthTransactions.filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0)
    );
    const monthExpense = money(
      monthTransactions.filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0)
    );

    const totalIncomeAll = money(allTimeIncome._sum.amount);
    const totalExpenseAll = money(allTimeExpense._sum.amount);

    // Weekly expense chart – last 7 days
    const last7 = daysInRange(weekStart, today);
    const weeklyExpense = last7.map((day) => {
      const value = chartTransactions
        .filter((t) => t.type === 'EXPENSE' && isoDate(t.date) === isoDate(day))
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return { date: isoDate(day), label: day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), value: money(value) };
    });

    // Monthly expense + income-vs-expense – last 6 months
    const months = Array.from({ length: 6 }, (_, index) => startOfMonth(addMonths(start, index - 5)));
    const monthlyExpense = months.map((monthStart) => {
      const mEnd = endOfMonth(monthStart);
      const value = chartTransactions
        .filter((t) => t.type === 'EXPENSE' && t.date >= monthStart && t.date <= mEnd)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return { month: isoDate(monthStart).slice(0, 7), label: formatMonthLabel(monthStart), value: money(value) };
    });
    const incomeVsExpense = months.map((monthStart) => {
      const mEnd = endOfMonth(monthStart);
      const rows = chartTransactions.filter((t) => t.date >= monthStart && t.date <= mEnd);
      return {
        month: isoDate(monthStart).slice(0, 7),
        label: formatMonthLabel(monthStart),
        income: money(rows.filter((t) => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0)),
        expense: money(rows.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0)),
      };
    });

    const categoryIds = monthByCategory.map((row) => row.categoryId).filter((id): id is string => Boolean(id));
    const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } } });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const categoryPie = monthByCategory
      .map((row) => {
        const category = row.categoryId ? categoryMap.get(row.categoryId) : undefined;
        const value = money(row._sum.amount);
        return {
          categoryId: row.categoryId,
          name: category?.name ?? 'Uncategorised',
          color: category?.color ?? '#94A3B8',
          icon: category?.icon ?? 'Tag',
          value,
          percentage: monthExpense > 0 ? Math.round((value / monthExpense) * 1000) / 10 : 0,
        };
      })
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value);

    const budgets = await budgetsOverlapping(userId, start, end);
    const progress = await budgetProgressFor(budgets, userId);
    // If an overall budget exists it is the headline; otherwise sum category budgets.
    const overallBudget = progress.find((b) => !b.budget.categoryId);
    const totalBudgeted = overallBudget
      ? overallBudget.amount
      : money(progress.reduce((s, b) => s + b.amount, 0));
    const totalSpent = overallBudget
      ? overallBudget.spent
      : money(progress.reduce((s, b) => s + b.spent, 0));
    const overallExpense = monthExpense;

    const goalsSaved = money(
      goalRows.reduce((sum, goal) => sum + goal.contributions.reduce((s, c) => s + Number(c.amount), 0), 0)
    );
    const goalsTarget = money(goalRows.reduce((sum, goal) => sum + Number(goal.targetAmount), 0));

    const expenseCount = monthTransactions.filter((t) => t.type === 'EXPENSE').length;
    const incomeCount = monthTransactions.filter((t) => t.type === 'INCOME').length;

    res.json({
      period: { month: key, start: isoDate(start), end: isoDate(end), label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) },
      totals: {
        balance: money(totalIncomeAll - totalExpenseAll),
        income: monthIncome,
        expenses: monthExpense,
        savings: money(monthIncome - monthExpense),
        allTimeIncome: totalIncomeAll,
        allTimeExpenses: totalExpenseAll,
        savingsRate: monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 1000) / 10 : 0,
      },
      counts: { transactions: monthTransactions.length, incomeCount, expenseCount },
      recentTransactions: recent.map(transactionDto),
      charts: { weeklyExpense, monthlyExpense, incomeVsExpense, categoryPie },
      budgets: {
        items: progress.map((p) => ({
          id: p.budget.id,
          name: p.budget.name ?? p.budget.category?.name ?? 'Overall budget',
          period: p.budget.period,
          amount: p.amount,
          spent: p.spent,
          remaining: p.remaining,
          percentage: p.percentage,
          status: p.status,
          color: p.budget.category?.color ?? '#7C3AED',
          category: p.budget.category?.name ?? null,
          endDate: p.budget.endDate,
        })),
        totalBudgeted,
        totalSpent,
        overallPercentage: totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 1000) / 10 : 0,
        count: progress.length,
      },
      goals: {
        count: goalRows.length,
        savedTotal: goalsSaved,
        targetTotal: goalsTarget,
        items: goalRows.slice(0, 3).map((goal) => {
          const saved = money(goal.contributions.reduce((s, c) => s + Number(c.amount), 0));
          const target = money(goal.targetAmount);
          return {
            id: goal.id,
            name: goal.name,
            saved,
            target,
            progress: target > 0 ? Math.min(100, Math.round((saved / target) * 1000) / 10) : 0,
            targetDate: goal.targetDate,
            color: goal.color,
          };
        }),
      },
      recurring: {
        activeCount: activeRecurring,
        upcoming: upcomingRecurring.map((item) => ({
          id: item.id,
          description: item.description,
          amount: money(item.amount),
          type: item.type,
          frequency: item.frequency,
          nextRunDate: item.nextRunDate,
          category: item.category?.name ?? null,
          color: item.category?.color ?? '#7C3AED',
        })),
      },
      notifications: { unread },
      generatedAt: new Date().toISOString(),
    });
  })
);

export default router;
