import { useCallback, useEffect, useState } from 'react';
import {
  BellRing, CalendarClock, Pencil, Play, Plus, RefreshCw, Repeat, Trash2,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCurrency } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Card, EmptyState, LoadingBlock, PageHeader } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { CategoryIcon } from '../components/CategoryIcon';
import type { Category, Frequency, PaymentMethod, RecurringTransaction, TransactionType } from '../lib/types';
import { formatCurrency, formatDate, paymentLabel, todayISO } from '../lib/format';
import { cn } from '../lib/utils';

type Response = {
  recurring: RecurringTransaction[];
  summary: { active: number; monthlyExpense: number };
};

const frequencyLabel = (item: RecurringTransaction) => {
  const every = item.interval > 1 ? `every ${item.interval} ` : 'every ';
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[item.frequency];
  return `${every}${unit}`;
};

const emptyForm = {
  type: 'EXPENSE' as TransactionType,
  amount: '',
  description: '',
  categoryId: '',
  paymentMethod: 'UPI' as PaymentMethod,
  frequency: 'MONTHLY' as Frequency,
  interval: '1',
  startDate: todayISO(),
  endDate: '',
  reminderDays: '3',
  isActive: true,
};

export default function Recurring() {
  const { currency, locale } = useCurrency();
  const toast = useToast();
  const [data, setData] = useState<Response | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [deleting, setDeleting] = useState<RecurringTransaction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const money = (value: number) => formatCurrency(value, currency, locale);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<Response>('/recurring');
      setData(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load recurring transactions');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    api<{ categories: Category[] }>('/categories').then((r) => setCategories(r.categories)).catch(() => undefined);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (item: RecurringTransaction) => {
    setEditing(item);
    setForm({
      type: item.type,
      amount: String(item.amount),
      description: item.description,
      categoryId: item.category?.id ?? '',
      paymentMethod: item.paymentMethod,
      frequency: item.frequency,
      interval: String(item.interval),
      startDate: item.startDate.slice(0, 10),
      endDate: item.endDate ? item.endDate.slice(0, 10) : '',
      reminderDays: String(item.reminderDays),
      isActive: item.isActive,
    });
    setErrors({});
    setModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.amount || Number(form.amount) <= 0) next.amount = 'Enter an amount';
    if (!form.description.trim()) next.description = 'Add a description';
    if (!form.startDate) next.startDate = 'Choose a start date';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const body = {
        type: form.type,
        amount: Number(form.amount),
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        paymentMethod: form.paymentMethod,
        frequency: form.frequency,
        interval: Number(form.interval),
        startDate: form.startDate,
        endDate: form.endDate || null,
        reminderDays: Number(form.reminderDays),
        isActive: form.isActive,
      };
      if (editing) {
        await api(`/recurring/${editing.id}`, { method: 'PATCH', body });
        toast.success('Recurring transaction updated');
      } else {
        await api('/recurring', { method: 'POST', body });
        toast.success('Recurring transaction created');
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

  const toggleActive = async (item: RecurringTransaction) => {
    try {
      await api(`/recurring/${item.id}`, { method: 'PATCH', body: { isActive: !item.isActive } });
      toast.success(item.isActive ? 'Paused' : 'Resumed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update');
    }
  };

  const runNow = async (item: RecurringTransaction) => {
    try {
      const result = await api<{ message: string }>(`/recurring/${item.id}/run`, { method: 'POST' });
      toast.success(result.message);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not run now');
    }
  };

  const processDue = async () => {
    setProcessing(true);
    try {
      const result = await api<{ message: string }>('/recurring/process', { method: 'POST' });
      toast.success(result.message);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not process');
    } finally {
      setProcessing(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/recurring/${deleting.id}`, { method: 'DELETE' });
      toast.success('Recurring transaction deleted');
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
    }
  };

  return (
    <div>
      <PageHeader
        title="Recurring transactions"
        subtitle="Rent, subscriptions and salary — scheduled automatically with reminders before they hit."
        actions={
          <>
            <Button variant="secondary" onClick={() => void processDue()} loading={processing}>
              <RefreshCw className="h-4 w-4" /> Process due
            </Button>
            <Button onClick={openCreate}><Plus className="h-4 w-4" /> New schedule</Button>
          </>
        }
      />

      {loading ? (
        <LoadingBlock label="Loading schedules…" />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                <Repeat className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Active schedules</p>
                <p className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{data.summary.active}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Estimated monthly outflow</p>
                <p className="font-display text-lg font-extrabold text-ink-900 dark:text-white">{money(data.summary.monthlyExpense)}</p>
              </div>
            </Card>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3.5 text-[12px] text-brand-900 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-100">
            <span className="inline-flex items-center gap-1.5 font-semibold"><BellRing className="h-3.5 w-3.5" /> Automatic reminders</span>
            <span className="ml-1 text-brand-800/80 dark:text-brand-200/80">
              — the scheduler creates due transactions and notifies you before bills arrive. You can also run them manually.
            </span>
          </div>

          {data.recurring.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Repeat className="h-6 w-6" />}
                title="No recurring transactions"
                description="Add rent, subscriptions or your salary so they are recorded automatically."
                action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Create a schedule</Button>}
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.recurring.map((item) => (
                <Card key={item.id} className={cn('p-5 transition', !item.isActive && 'opacity-70')}>
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${item.category?.color ?? '#7C3AED'}18`, color: item.category?.color ?? '#7C3AED' }}
                    >
                      <CategoryIcon name={item.category?.icon ?? 'Repeat'} className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[13.5px] font-bold text-ink-900 dark:text-white">{item.description}</p>
                        <p className={cn('shrink-0 text-[13.5px] font-bold', item.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white')}>
                          {item.type === 'INCOME' ? '+' : '−'}{money(item.amount)}
                        </p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {item.category?.name ?? 'Uncategorised'} · {paymentLabel(item.paymentMethod)} · {frequencyLabel(item)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone={item.isActive ? 'brand' : 'neutral'}>{item.isActive ? 'Active' : 'Paused'}</Badge>
                        <Badge tone={item.daysUntilNext <= 0 ? 'warning' : 'info'}>
                          {item.daysUntilNext <= 0 ? 'Due now' : `In ${item.daysUntilNext} day${item.daysUntilNext === 1 ? '' : 's'}`}
                        </Badge>
                        <span className="text-[10.5px] text-ink-400">Next: {formatDate(item.nextRunDate)}</span>
                      </div>
                      {item.endDate && <p className="mt-1 text-[10.5px] text-ink-400">Ends {formatDate(item.endDate)}</p>}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void runNow(item)} disabled={!item.isActive}>
                      <Play className="h-3 w-3" /> Run now
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void toggleActive(item)}>
                      {item.isActive ? 'Pause' : 'Resume'}
                    </Button>
                    <div className="ml-auto flex gap-1">
                      <button type="button" onClick={() => openEdit(item)} className="rounded-lg p-2 text-ink-400 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10" aria-label="Edit schedule">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDeleting(item)} className="rounded-lg p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete schedule">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit recurring transaction' : 'New recurring transaction'}
        description="The scheduler records these automatically on their next run date."
        size="lg"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="recurring-form" loading={saving}>{editing ? 'Save changes' : 'Create schedule'}</Button>
          </>
        }
      >
        <form id="recurring-form" onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-100/70 p-1.5 dark:bg-white/[0.04]">
            {(['EXPENSE', 'INCOME'] as TransactionType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, type, categoryId: '' })}
                className={cn(
                  'rounded-xl py-2 text-[13px] font-bold transition',
                  form.type === type
                    ? 'bg-white shadow-sm dark:bg-ink-800'
                    : 'text-ink-500 dark:text-ink-400',
                  form.type === type && (type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-300' : 'text-brand-700 dark:text-brand-200')
                )}
                aria-pressed={form.type === type}
              >
                {type === 'INCOME' ? 'Income' : 'Expense'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Amount (${currency})`}
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              error={errors.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              required
            />
            <Input
              label="Description"
              placeholder="e.g. Netflix subscription"
              value={form.description}
              error={errors.description}
              maxLength={200}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              required
            />
            <Select
              label="Category"
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            >
              <option value="">No category</option>
              {categories.filter((c) => c.type === form.type).map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
            <Select
              label="Payment method"
              value={form.paymentMethod}
              onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank</option>
            </Select>
            <Select
              label="Frequency"
              value={form.frequency}
              onChange={(event) => setForm({ ...form, frequency: event.target.value as Frequency })}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </Select>
            <Input
              label="Repeat every"
              type="number"
              min="1"
              max="24"
              value={form.interval}
              error={errors.interval}
              onChange={(event) => setForm({ ...form, interval: event.target.value })}
            />
            <Input
              label="Start date"
              type="date"
              value={form.startDate}
              error={errors.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              required
            />
            <Input
              label="End date (optional)"
              type="date"
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
            <Input
              label="Remind me (days before)"
              type="number"
              min="0"
              max="30"
              value={form.reminderDays}
              onChange={(event) => setForm({ ...form, reminderDays: event.target.value })}
            />
            <label className="flex items-end gap-2 pb-2.5 text-[12.5px] font-semibold text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              />
              Active schedule
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete recurring transaction?"
        message={`“${deleting?.description}” will stop being recorded. Past transactions stay.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
