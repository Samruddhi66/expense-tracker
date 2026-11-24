import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bell, ChevronLeft, ChevronRight,
  PiggyBank, Plus, Sparkles, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, useCurrency } from '../context/AuthContext';
import { Card, EmptyState, LoadingBlock, PageHeader, Progress } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionModal } from '../components/TransactionModal';
import { CategoryDonut, IncomeExpenseChart, WeeklyExpenseChart } from '../components/charts/Charts';
import type { DashboardData, Transaction } from '../lib/types';
import {
  currentMonthKey, formatCurrency, formatDate, monthLabel, paymentLabel, shiftMonth,
} from '../lib/format';
import { cn } from '../lib/utils';

function StatCard({
  label, value, icon, tone, hint, delta, delay, invert,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'brand' | 'emerald' | 'rose' | 'amber';
  hint?: string;
  delta?: number | null;
  delay?: string;
  invert?: boolean;
}) {
  const positive = typeof delta === 'number' ? (invert ? delta <= 0 : delta >= 0) : false;
  const tones = {
    brand: 'from-brand-600 to-fuchsia-500',
    emerald: 'from-emerald-500 to-teal-400',
    rose: 'from-rose-500 to-orange-400',
    amber: 'from-amber-500 to-yellow-400',
  } as const;

  return (
    <Card className={cn('card-hover animate-fade-up p-5', delay)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-400 dark:text-ink-500">{label}</p>
          <p className="mt-2 font-display text-[23px] font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-[25px]">
            {value}
          </p>
        </div>
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm', tones[tone])}>
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px]">
        {typeof delta === 'number' ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold',
              positive
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
            )}
          >
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        ) : null}
        {hint && <span className="text-ink-400">{hint}</span>}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { currency, locale } = useCurrency();
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<DashboardData>(`/dashboard?month=${month}`);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your dashboard');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (value: number, compact = false) => formatCurrency(value, currency, locale, compact);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const cashflow = data?.charts.incomeVsExpense ?? [];
  const last = cashflow[cashflow.length - 1];
  const previous = cashflow[cashflow.length - 2];
  const incomeDelta = previous && previous.income > 0 && last ? Math.round(((last.income - previous.income) / previous.income) * 1000) / 10 : null;
  const expenseDelta = previous && previous.expense > 0 && last ? Math.round(((last.expense - previous.expense) / previous.expense) * 1000) / 10 : null;

  const isEmpty = data && data.counts.transactions === 0 && data.recentTransactions.length === 0;

  return (
    <div>
      <PageHeader
        eyebrow={data?.period.label ?? monthLabel(month)}
        title={`${greeting}, ${user?.name.split(' ')[0] ?? 'there'}`}
        subtitle="Here is how your money is moving. Every number comes straight from your transactions."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 dark:border-ink-700 dark:bg-ink-900">
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, -1))}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-white/5"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[124px] px-1 text-center text-[12.5px] font-bold text-ink-800 dark:text-ink-100">
                {monthLabel(month)}
              </span>
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, 1))}
                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-ink-100 dark:hover:bg-white/5"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </>
        }
      />

      {loading && !data ? (
        <LoadingBlock label="Crunching your numbers…" />
      ) : error ? (
        <Card className="p-6">
          <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={() => void load()}>Try again</Button>
        </Card>
      ) : data ? (
        <div className="space-y-5">
          {isEmpty && (
            <Card className="animate-fade-up overflow-hidden border-brand-100 bg-gradient-to-br from-brand-50 via-white to-fuchsia-50 p-6 dark:border-brand-500/20 dark:from-brand-950/60 dark:via-ink-900 dark:to-fuchsia-950/30">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-700 shadow-sm dark:bg-brand-500/20 dark:text-brand-200">
                    <Sparkles className="h-3 w-3" /> Let&apos;s get started
                  </p>
                  <h2 className="mt-3 font-display text-xl font-extrabold text-ink-900 dark:text-white">
                    Your dashboard is ready for its first transaction
                  </h2>
                  <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-600 dark:text-ink-300">
                    Add your income and a few expenses, set a monthly budget, and your charts, savings rate and AI insights will come alive.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
                    <Plus className="h-4 w-4" /> Add transaction
                  </Button>
                  <Button variant="secondary" onClick={() => { window.location.href = '/budgets'; }}>
                    Set a budget
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total balance"
              value={money(data.totals.balance)}
              icon={<Wallet className="h-5 w-5" />}
              tone="brand"
              hint="All-time income minus expenses"
              delay="animate-delay-1"
            />
            <StatCard
              label={`Income · ${data.period.label.split(' ')[0]}`}
              value={money(data.totals.income)}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="emerald"
              delta={incomeDelta}
              hint="vs last month"
              delay="animate-delay-2"
            />
            <StatCard
              label={`Expenses · ${data.period.label.split(' ')[0]}`}
              value={money(data.totals.expenses)}
              icon={<TrendingDown className="h-5 w-5" />}
              tone="rose"
              delta={expenseDelta}
              invert
              hint="vs last month"
              delay="animate-delay-3"
            />
            <StatCard
              label="Savings this month"
              value={money(data.totals.savings)}
              icon={<PiggyBank className="h-5 w-5" />}
              tone="amber"
              hint={`${data.totals.savingsRate}% savings rate`}
              delay="animate-delay-4"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-12">
            <Card className="animate-fade-up p-5 xl:col-span-7">
              <div className="mb-1 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Weekly spending</h2>
                  <p className="text-[11.5px] text-ink-400">Last seven days of expenses</p>
                </div>
                <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                  {money(data.charts.weeklyExpense.reduce((sum, d) => sum + d.value, 0), true)}
                </span>
              </div>
              <WeeklyExpenseChart data={data.charts.weeklyExpense} currency={currency} locale={locale} />
            </Card>

            <Card className="animate-fade-up p-5 xl:col-span-5">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Where it went</h2>
                  <p className="text-[11.5px] text-ink-400">Category split for {data.period.label}</p>
                </div>
                <Link to="/analytics" className="text-[11px] font-bold text-brand-700 hover:text-brand-800 dark:text-brand-300">
                  Details
                </Link>
              </div>
              {data.charts.categoryPie.length ? (
                <>
                  <CategoryDonut data={data.charts.categoryPie} currency={currency} locale={locale} height={210} />
                  <div className="mt-2 space-y-2">
                    {data.charts.categoryPie.slice(0, 4).map((category) => (
                      <div key={category.name} className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${category.color}1f`, color: category.color }}
                        >
                          <CategoryIcon name={category.icon} className="h-3.5 w-3.5" />
                        </span>
                        <span className="flex-1 truncate text-[12.5px] font-semibold text-ink-700 dark:text-ink-200">
                          {category.name}
                        </span>
                        <span className="text-[11px] text-ink-400">{category.percentage}%</span>
                        <span className="w-[74px] text-right text-[12.5px] font-bold text-ink-900 dark:text-white">
                          {money(category.value, true)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<PiggyBank className="h-6 w-6" />}
                  title="No expenses this month"
                  description="Add an expense to see your category breakdown."
                  className="py-8"
                />
              )}
            </Card>

            <Card className="animate-fade-up p-5 xl:col-span-7">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Cash flow</h2>
                  <p className="text-[11.5px] text-ink-400">Income vs expenses, last six months</p>
                </div>
                <span className="hidden items-center gap-3 text-[11px] font-semibold text-ink-500 sm:flex">
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Income</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-brand-500" /> Expenses</span>
                </span>
              </div>
              <IncomeExpenseChart data={data.charts.incomeVsExpense} currency={currency} locale={locale} />
            </Card>

            <Card className="animate-fade-up p-5 xl:col-span-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Budget overview</h2>
                  <p className="text-[11.5px] text-ink-400">
                    {data.budgets.count ? `${money(data.budgets.totalSpent, true)} of ${money(data.budgets.totalBudgeted, true)} used` : 'No budgets for this month'}
                  </p>
                </div>
                <Link to="/budgets" className="text-[11px] font-bold text-brand-700 hover:text-brand-800 dark:text-brand-300">
                  Manage
                </Link>
              </div>

              {data.budgets.items.length ? (
                <div className="space-y-4">
                  {data.budgets.items.slice(0, 4).map((budget) => (
                    <div key={budget.id}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-ink-700 dark:text-ink-200">{budget.name}</span>
                        <span className="shrink-0 text-[11px] font-bold text-ink-500 dark:text-ink-400">
                          {money(budget.spent, true)} / {money(budget.amount, true)}
                        </span>
                      </div>
                      <Progress
                        value={budget.percentage}
                        tone={budget.status === 'exceeded' ? 'danger' : budget.status === 'warning' ? 'warning' : 'brand'}
                      />
                      <div className="mt-1 flex items-center justify-between text-[10.5px]">
                        <span className={budget.status === 'exceeded' ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-ink-400'}>
                          {budget.status === 'exceeded'
                            ? `${money(Math.abs(budget.remaining), true)} over budget`
                            : `${money(budget.remaining, true)} left`}
                        </span>
                        <span className="text-ink-400">{budget.percentage}%</span>
                      </div>
                    </div>
                  ))}
                  {data.budgets.items.length > 4 && (
                    <Link to="/budgets" className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-700 dark:text-brand-300">
                      View all {data.budgets.items.length} budgets <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<Bell className="h-6 w-6" />}
                  title="No budgets yet"
                  description="Set a monthly limit and get alerts before you overspend."
                  className="py-6"
                  action={<Link to="/budgets" className="btn-primary btn-sm px-3 py-2">Create budget</Link>}
                />
              )}
            </Card>

            <Card className="animate-fade-up overflow-hidden xl:col-span-8">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-white/5">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Recent transactions</h2>
                  <p className="text-[11.5px] text-ink-400">Your latest activity across all months</p>
                </div>
                <Link to="/transactions" className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 dark:text-brand-300">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              {data.recentTransactions.length ? (
                <div className="divide-y divide-ink-50 dark:divide-white/[0.04]">
                  {data.recentTransactions.slice(0, 6).map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => { setEditing(tx); setModalOpen(true); }}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-ink-50/60 dark:hover:bg-white/[0.02]"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `${tx.category?.color ?? '#7C3AED'}18`,
                          color: tx.category?.color ?? '#7C3AED',
                        }}
                      >
                        <CategoryIcon name={tx.category?.icon} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-ink-800 dark:text-ink-100">{tx.description}</p>
                        <p className="truncate text-[11px] text-ink-400">
                          {tx.category?.name ?? 'Uncategorised'} · {paymentLabel(tx.paymentMethod)} · {formatDate(tx.date)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-[13px] font-bold',
                          tx.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white'
                        )}
                      >
                        {tx.type === 'INCOME' ? '+' : '−'}{money(tx.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Wallet className="h-6 w-6" />}
                  title="No transactions yet"
                  description="Your recent income and expenses will appear here."
                  action={<Button size="sm" onClick={() => { setEditing(null); setModalOpen(true); }}>Add your first</Button>}
                />
              )}
            </Card>

            <div className="space-y-5 xl:col-span-4">
              <Link
                to="/assistant"
                className="block animate-fade-up overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-700 to-fuchsia-700 p-5 text-white shadow-float transition hover:shadow-glow"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-100">AI assistant</p>
                </div>
                <p className="mt-3 font-display text-[16px] font-bold leading-snug">
                  “Where did my money go this month?”
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-brand-100/80">
                  Ask in plain English. The assistant only reads your own transactions and budgets.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-white">
                  Ask a question <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>

              <Card className="animate-fade-up p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Savings goals</h2>
                    <p className="text-[11.5px] text-ink-400">
                      {data.goals.count ? `${money(data.goals.savedTotal, true)} of ${money(data.goals.targetTotal, true)}` : 'No goals yet'}
                    </p>
                  </div>
                  <Link to="/goals" className="text-[11px] font-bold text-brand-700 dark:text-brand-300">Manage</Link>
                </div>
                {data.goals.items.length ? (
                  <div className="space-y-3.5">
                    {data.goals.items.map((goal) => (
                      <div key={goal.id}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="truncate text-[12.5px] font-semibold text-ink-700 dark:text-ink-200">{goal.name}</span>
                          <span className="text-[11px] font-bold text-ink-500 dark:text-ink-400">{goal.progress}%</span>
                        </div>
                        <Progress value={goal.progress} barClassName="" />
                        <p className="mt-1 text-[10.5px] text-ink-400">
                          {money(goal.saved, true)} saved · target {formatDate(goal.targetDate)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-ink-50 px-3 py-3 text-[12px] text-ink-500 dark:bg-white/[0.03] dark:text-ink-400">
                    Create a goal to start saving with purpose.
                  </p>
                )}
              </Card>

              <Card className="animate-fade-up p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Upcoming bills</h2>
                    <p className="text-[11.5px] text-ink-400">{data.recurring.activeCount} active recurring transactions</p>
                  </div>
                  <Link to="/recurring" className="text-[11px] font-bold text-brand-700 dark:text-brand-300">Manage</Link>
                </div>
                {data.recurring.upcoming.length ? (
                  <div className="space-y-2.5">
                    {data.recurring.upcoming.map((item) => (
                      <div key={item.id} className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${item.color}18`, color: item.color }}>
                          <ArrowRight className="h-3.5 w-3.5 rotate-45" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{item.description}</p>
                          <p className="text-[10.5px] text-ink-400">{formatDate(item.nextRunDate)} · {item.frequency.toLowerCase()}</p>
                        </div>
                        <span className={cn('text-[12px] font-bold', item.type === 'INCOME' ? 'text-emerald-600' : 'text-ink-800 dark:text-ink-100')}>
                          {money(item.amount, true)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-ink-50 px-3 py-3 text-[12px] text-ink-500 dark:bg-white/[0.03] dark:text-ink-400">
                    No scheduled bills or income yet.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </div>
      ) : null}

      <TransactionModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        transaction={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
