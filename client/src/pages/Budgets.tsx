import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Pencil, PiggyBank, Plus, Trash2, Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCurrency } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Badge, Card, EmptyState, LoadingBlock, PageHeader, Progress,
} from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { CategoryIcon } from '../components/CategoryIcon';
import type { Budget, BudgetPeriod, Category } from '../lib/types';
import { currentMonthKey, formatCurrency, formatDate, monthLabel, shiftMonth } from '../lib/format';

type BudgetsResponse = {
  period: { month: string; start: string; end: string };
  budgets: Budget[];
  summary: { totalBudgeted: number; totalSpent: number; count: number };
};

export default function Budgets() {
  const { currency, locale } = useCurrency();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<BudgetsResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);
  const [form, setForm] = useState({ period: 'MONTHLY' as BudgetPeriod, amount: '', categoryId: '', name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const money = (value: number) => formatCurrency(value, currency, locale);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<BudgetsResponse>(`/budgets?month=${month}`);
      setData(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load budgets');
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ categories: Category[] }>('/categories?type=EXPENSE')
      .then((result) => setCategories(result.categories))
      .catch(() => undefined);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ period: 'MONTHLY', amount: '', categoryId: '', name: '' });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (budget: Budget) => {
    setEditing(budget);
    setForm({
      period: budget.period,
      amount: String(budget.amount),
      categoryId: budget.categoryId ?? '',
      name: budget.name ?? '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.amount || Number(form.amount) <= 0) next.amount = 'Enter a budget amount';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (editing) {
        await api(`/budgets/${editing.id}`, {
          method: 'PATCH',
          body: { amount: Number(form.amount), name: form.name.trim() || null },
        });
        toast.success('Budget updated');
      } else {
        await api('/budgets', {
          method: 'POST',
          body: {
            period: form.period,
            amount: Number(form.amount),
            categoryId: form.categoryId || null,
            name: form.name.trim() || null,
            referenceDate: `${month}-01`,
          },
        });
        toast.success('Budget created');
      }
      setModalOpen(false);
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details ?? {});
        toast.error(error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/budgets/${deleting.id}`, { method: 'DELETE' });
      toast.success('Budget deleted');
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete budget');
    }
  };

  // The overall budget is the headline; if there is none, category budgets are summed.
  const overallBudget = data?.budgets.find((b) => !b.categoryId);
  const totalBudgeted = overallBudget
    ? overallBudget.amount
    : data?.budgets.reduce((sum, b) => sum + b.amount, 0) ?? 0;
  const totalSpent = overallBudget
    ? overallBudget.spent
    : data?.budgets.reduce((sum, b) => sum + b.spent, 0) ?? 0;
  const totalRemaining = Math.max(0, totalBudgeted - totalSpent);
  const overallPercent = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 1000) / 10 : 0;
  const exceeded = data?.budgets.filter((b) => b.status === 'exceeded') ?? [];

  return (
    <div>
      <PageHeader
        title="Budgets"
        subtitle="Give every category a limit and know exactly how much room is left."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 dark:border-ink-700 dark:bg-ink-900">
              <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 dark:hover:bg-white/5" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[124px] px-1 text-center text-[12.5px] font-bold text-ink-800 dark:text-ink-100">{monthLabel(month)}</span>
              <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 dark:hover:bg-white/5" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New budget
            </Button>
          </>
        }
      />

      {loading ? (
        <LoadingBlock label="Loading budgets…" />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">Total budgeted</p>
                  <p className="mt-1 font-display text-2xl font-extrabold text-ink-900 dark:text-white">
                    {money(totalBudgeted)}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-500 dark:text-ink-400">
                    {money(totalSpent)} spent ·{" "}
                    <span className={overallPercent >= 100 ? 'font-bold text-rose-600 dark:text-rose-400' : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
                      {money(totalRemaining)} remaining
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-extrabold text-brand-700 dark:text-brand-300">{overallPercent}%</p>
                  <p className="text-[10.5px] uppercase tracking-wider text-ink-400">used</p>
                </div>
              </div>
              <Progress
                value={overallPercent}
                tone={overallPercent >= 100 ? 'danger' : overallPercent >= 80 ? 'warning' : 'brand'}
                className="mt-4 h-2.5"
              />
              <p className="mt-3 text-[11.5px] text-ink-400">
                {data.summary.count} budget{data.summary.count === 1 ? '' : 's'} for {monthLabel(month)}. Spending is calculated from your expenses only.
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">
                <PiggyBank className="h-3.5 w-3.5" /> Budget health
              </div>
              <div className="mt-3 space-y-2.5">
                {[
                  { label: 'On track', count: data.budgets.filter((b) => b.status === 'safe').length, tone: 'success' as const },
                  { label: 'Close to limit', count: data.budgets.filter((b) => b.status === 'warning').length, tone: 'warning' as const },
                  { label: 'Exceeded', count: data.budgets.filter((b) => b.status === 'exceeded').length, tone: 'danger' as const },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-[12.5px] text-ink-600 dark:text-ink-300">{row.label}</span>
                    <Badge tone={row.tone}>{row.count}</Badge>
                  </div>
                ))}
              </div>
              {exceeded.length > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-[11.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Over budget: {exceeded.map((b) => b.name).join(', ')}
                </div>
              )}
            </Card>
          </div>

          {data.budgets.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Wallet className="h-6 w-6" />}
                title="No budgets for this month"
                description="Create an overall monthly limit or set limits per category to keep spending intentional."
                action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Create your first budget</Button>}
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.budgets.map((budget) => (
                <Card key={budget.id} className="card-hover p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${budget.category?.color ?? '#7C3AED'}18`, color: budget.category?.color ?? '#7C3AED' }}
                      >
                        {budget.category ? <CategoryIcon name={budget.category.icon} className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-bold text-ink-900 dark:text-white">{budget.name}</p>
                        <p className="text-[10.5px] text-ink-400">
                          {budget.period === 'MONTHLY' ? 'Monthly' : 'Weekly'} · {budget.periodLabel}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => openEdit(budget)} className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10" aria-label="Edit budget">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDeleting(budget)} className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete budget">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10.5px] uppercase tracking-wider text-ink-400">Spent</p>
                      <p className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{money(budget.spent)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10.5px] uppercase tracking-wider text-ink-400">Of</p>
                      <p className="text-[13px] font-bold text-ink-600 dark:text-ink-300">{money(budget.amount)}</p>
                    </div>
                  </div>

                  <Progress
                    value={budget.percentage}
                    tone={budget.status === 'exceeded' ? 'danger' : budget.status === 'warning' ? 'warning' : 'brand'}
                    className="mt-2.5"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <Badge tone={budget.status === 'exceeded' ? 'danger' : budget.status === 'warning' ? 'warning' : 'success'}>
                      {budget.status === 'exceeded' ? 'Exceeded' : budget.status === 'warning' ? 'Almost there' : 'On track'}
                    </Badge>
                    <span className="text-[11px] font-semibold text-ink-500 dark:text-ink-400">
                      {budget.status === 'exceeded'
                        ? `${money(Math.abs(budget.remaining))} over`
                        : `${money(budget.remaining)} left`}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[10.5px] text-ink-400">
                    {budget.percentage}% used · ends {formatDate(budget.endDate)}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit budget' : 'Create a budget'}
        description={editing ? 'Update the limit. The period stays the same.' : `Set a limit for ${monthLabel(month)}.`}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="budget-form" loading={saving}>{editing ? 'Save changes' : 'Create budget'}</Button>
          </>
        }
      >
        <form id="budget-form" onSubmit={submit} className="space-y-4" noValidate>
          {!editing && (
            <Select
              label="Period"
              value={form.period}
              onChange={(event) => setForm({ ...form, period: event.target.value as BudgetPeriod })}
            >
              <option value="MONTHLY">Monthly budget</option>
              <option value="WEEKLY">Weekly budget</option>
            </Select>
          )}
          {!editing && (
            <Select
              label="Applies to"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              hint="Leave as overall to cap all expenses."
            >
              <option value="">Overall (all expenses)</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          )}
          <Input
            label={`Amount (${currency})`}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            error={errors.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            required
          />
          <Input
            label="Label (optional)"
            placeholder="e.g. Dining out cap"
            value={form.name}
            maxLength={120}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete budget?"
        message={`“${deleting?.name}” will stop tracking. Your transactions stay untouched.`}
        confirmLabel="Delete budget"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
