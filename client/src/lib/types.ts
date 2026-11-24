export type Role = 'USER' | 'ADMIN';
export type TransactionType = 'INCOME' | 'EXPENSE';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK';
export type BudgetPeriod = 'WEEKLY' | 'MONTHLY';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM';

export interface Settings {
  id?: string;
  currency: string;
  locale: string;
  theme: ThemePreference;
  notifyBudgetAlerts: boolean;
  notifyBillReminders: boolean;
  notifySavings: boolean;
  notifyMonthlySummary: boolean;
  weekStartsOn: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  hasPassword: boolean;
  settings?: Settings;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  isSystem: boolean;
  userId: string | null;
  transactionCount?: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  notes: string | null;
  paymentMethod: PaymentMethod;
  date: string;
  categoryId: string | null;
  category: Category | null;
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  name: string;
  period: BudgetPeriod;
  amount: number;
  categoryId: string | null;
  category: Category | null;
  startDate: string;
  endDate: string;
  periodLabel?: string;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'safe' | 'warning' | 'exceeded';
  daysLeft: number;
  createdAt?: string;
}

export interface GoalContribution {
  id: string;
  amount: number;
  note: string | null;
  date: string;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  description: string | null;
  targetAmount: number;
  savedAmount: number;
  remainingAmount: number;
  progress: number;
  targetDate: string;
  daysLeft: number;
  color: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  contributions: GoalContribution[];
  createdAt: string;
}

export interface RecurringTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  paymentMethod: PaymentMethod;
  frequency: Frequency;
  interval: number;
  startDate: string;
  nextRunDate: string;
  endDate: string | null;
  isActive: boolean;
  reminderDays: number;
  lastRunAt: string | null;
  category: Category | null;
  daysUntilNext: number;
}

export interface Notification {
  id: string;
  type: 'BUDGET_ALERT' | 'BILL_REMINDER' | 'SAVINGS' | 'MONTHLY_SUMMARY' | 'SYSTEM';
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardData {
  period: { month: string; start: string; end: string; label: string };
  totals: {
    balance: number;
    income: number;
    expenses: number;
    savings: number;
    allTimeIncome: number;
    allTimeExpenses: number;
    savingsRate: number;
  };
  counts: { transactions: number; incomeCount: number; expenseCount: number };
  recentTransactions: Transaction[];
  charts: {
    weeklyExpense: { date: string; label: string; value: number }[];
    monthlyExpense: { month: string; label: string; value: number }[];
    incomeVsExpense: { month: string; label: string; income: number; expense: number }[];
    categoryPie: { categoryId: string | null; name: string; color: string; icon: string; value: number; percentage: number }[];
  };
  budgets: {
    items: {
      id: string;
      name: string;
      period: BudgetPeriod;
      amount: number;
      spent: number;
      remaining: number;
      percentage: number;
      status: 'safe' | 'warning' | 'exceeded';
      color: string;
      category: string | null;
      endDate: string;
    }[];
    totalBudgeted: number;
    totalSpent: number;
    overallPercentage: number;
    count: number;
  };
  goals: {
    count: number;
    savedTotal: number;
    targetTotal: number;
    items: { id: string; name: string; saved: number; target: number; progress: number; targetDate: string; color: string }[];
  };
  recurring: {
    activeCount: number;
    upcoming: {
      id: string;
      description: string;
      amount: number;
      type: TransactionType;
      frequency: Frequency;
      nextRunDate: string;
      category: string | null;
      color: string;
    }[];
  };
  notifications: { unread: number };
  generatedAt: string;
}

export interface Analytics {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  range: { start: string; end: string; previousStart: string; previousEnd: string; days: number; label: string };
  currency: string;
  summary: {
    income: number;
    expense: number;
    net: number;
    savingsRate: number;
    transactions: number;
    avgPerDay: number;
    avgTransaction: number;
    topCategory: string | null;
    largestExpense: number;
  };
  comparison: {
    previous: { income: number; expense: number; net: number };
    incomeChange: number;
    expenseChange: number;
    netChange: number;
  };
  series: { key: string; label: string; income: number; expense: number }[];
  categoryBreakdown: { name: string; color: string; icon: string; value: number; count: number; percentage: number }[];
  paymentMethods: { method: PaymentMethod; count: number; total: number; percentage: number }[];
  weekdaySpend: { day: number; label: string; value: number }[];
  topExpenses: Transaction[];
  transactions: Transaction[];
}

export interface AiInsight {
  id: string;
  type: 'SPENDING_ANALYSIS' | 'MONTHLY_SUMMARY' | 'BUDGET_ADVICE' | 'CHAT';
  prompt: string | null;
  content: string;
  model: string;
  source: 'ai' | 'rules';
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
