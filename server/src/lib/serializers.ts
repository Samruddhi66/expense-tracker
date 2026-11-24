import type {
  Budget,
  Category,
  GoalContribution,
  SavingsGoal,
  Transaction,
  User,
  UserSettings,
} from '@prisma/client';
import { money } from './http.js';

export function publicUser(user: User, settings?: UserSettings | null) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    hasPassword: Boolean(user.passwordHash),
    settings: settings
      ? {
          currency: settings.currency,
          locale: settings.locale,
          theme: settings.theme,
          notifyBudgetAlerts: settings.notifyBudgetAlerts,
          notifyBillReminders: settings.notifyBillReminders,
          notifySavings: settings.notifySavings,
          notifyMonthlySummary: settings.notifyMonthlySummary,
          weekStartsOn: settings.weekStartsOn,
        }
      : undefined,
  };
}

export function categoryDto(category: Category) {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    icon: category.icon,
    color: category.color,
    isSystem: category.isSystem,
    userId: category.userId,
    createdAt: category.createdAt,
  };
}

type TransactionWithCategory = Transaction & { category?: Category | null };

export function transactionDto(tx: TransactionWithCategory) {
  return {
    id: tx.id,
    type: tx.type,
    amount: money(tx.amount),
    description: tx.description,
    notes: tx.notes,
    paymentMethod: tx.paymentMethod,
    date: tx.date,
    categoryId: tx.categoryId,
    category: tx.category ? categoryDto(tx.category) : null,
    recurringId: tx.recurringId,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

export function budgetDto(budget: Budget & { category?: Category | null }) {
  return {
    id: budget.id,
    name: budget.name ?? budget.category?.name ?? 'Overall budget',
    period: budget.period,
    amount: money(budget.amount),
    categoryId: budget.categoryId,
    category: budget.category ? categoryDto(budget.category) : null,
    startDate: budget.startDate,
    endDate: budget.endDate,
    createdAt: budget.createdAt,
  };
}

type GoalWithContributions = SavingsGoal & { contributions?: GoalContribution[] };

export function goalDto(goal: GoalWithContributions) {
  const saved = money((goal.contributions ?? []).reduce((sum, c) => sum + Number(c.amount), 0));
  const target = money(goal.targetAmount);
  const progress = target > 0 ? Math.min(100, Math.round((saved / target) * 1000) / 10) : 0;
  const today = new Date();
  const daysLeft = Math.ceil((goal.targetDate.getTime() - today.getTime()) / 86_400_000);
  return {
    id: goal.id,
    name: goal.name,
    description: goal.description,
    targetAmount: target,
    savedAmount: saved,
    remainingAmount: Math.max(0, money(target - saved)),
    progress,
    targetDate: goal.targetDate,
    daysLeft,
    color: goal.color,
    status: goal.status,
    createdAt: goal.createdAt,
    contributions: (goal.contributions ?? [])
      .slice()
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map((c) => ({
        id: c.id,
        amount: money(c.amount),
        note: c.note,
        date: c.date,
        createdAt: c.createdAt,
      })),
  };
}
