import { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, IndianRupee, Tag } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Select, Textarea } from './ui/Input';
import { CategoryIcon } from './CategoryIcon';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../context/AuthContext';
import { todayISO, paymentLabel } from '../lib/format';
import type { Category, PaymentMethod, Transaction, TransactionType } from '../lib/types';
import { cn } from '../lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  transaction?: Transaction | null;
  defaultType?: TransactionType;
};

const emptyForm = {
  type: 'EXPENSE' as TransactionType,
  amount: '',
  description: '',
  categoryId: '',
  paymentMethod: 'UPI' as PaymentMethod,
  date: todayISO(),
  notes: '',
};

export function TransactionModal({ open, onClose, onSaved, transaction, defaultType }: Props) {
  const toast = useToast();
  const { currency } = useCurrency();
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<{ categories: Category[] }>('/categories')
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));

    if (transaction) {
      setForm({
        type: transaction.type,
        amount: String(transaction.amount),
        description: transaction.description,
        categoryId: transaction.categoryId ?? '',
        paymentMethod: transaction.paymentMethod,
        date: transaction.date.slice(0, 10),
        notes: transaction.notes ?? '',
      });
    } else {
      setForm({ ...emptyForm, type: defaultType ?? 'EXPENSE', date: todayISO() });
    }
    setErrors({});
  }, [open, transaction, defaultType]);

  const visibleCategories = categories.filter((category) => category.type === form.type);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount)) next.amount = 'Enter an amount';
    else if (amount <= 0) next.amount = 'Amount must be greater than zero';
    if (!form.description.trim()) next.description = 'Add a short description';
    if (!form.date) next.date = 'Choose a date';
    if (!form.categoryId) next.categoryId = 'Choose a category';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const body = {
        type: form.type,
        amount,
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        paymentMethod: form.paymentMethod,
        date: form.date,
        notes: form.notes.trim() || null,
      };
      if (transaction) {
        await api(`/transactions/${transaction.id}`, { method: 'PATCH', body });
        toast.success('Transaction updated');
      } else {
        await api('/transactions', { method: 'POST', body });
        toast.success(`${form.type === 'INCOME' ? 'Income' : 'Expense'} added`);
      }
      onSaved?.();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details ?? {});
        toast.error(error.message);
      } else {
        toast.error('Could not save the transaction');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      description={transaction ? 'Update the details below.' : 'Record money coming in or going out.'}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="transaction-form" loading={loading}>
            {transaction ? 'Save changes' : 'Add transaction'}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-100/70 p-1.5 dark:bg-white/[0.04]">
          {(['EXPENSE', 'INCOME'] as TransactionType[]).map((type) => {
            const active = form.type === type;
            const Icon = type === 'INCOME' ? ArrowDownCircle : ArrowUpCircle;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setForm({ ...form, type, categoryId: '' })}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition',
                  active
                    ? type === 'INCOME'
                      ? 'bg-white text-emerald-600 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-300'
                      : 'bg-white text-brand-700 shadow-sm dark:bg-brand-500/25 dark:text-brand-200'
                    : 'text-ink-500 hover:text-ink-700 dark:text-ink-400'
                )}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4" />
                {type === 'INCOME' ? 'Income' : 'Expense'}
              </button>
            );
          })}
        </div>

        <Input
          label={`Amount (${currency})`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0.00"
          icon={<IndianRupee className="h-4 w-4" />}
          value={form.amount}
          error={errors.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          autoFocus
          required
        />

        <Input
          label="Description"
          placeholder={form.type === 'INCOME' ? 'e.g. Monthly salary' : 'e.g. Groceries at the market'}
          value={form.description}
          error={errors.description}
          maxLength={200}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Select
              label="Category"
              value={form.categoryId}
              error={errors.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              required
            >
              <option value="">Select a category</option>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isSystem ? ' · default' : ''}
                </option>
              ))}
            </Select>
            {form.categoryId && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-400">
                <CategoryIcon
                  name={visibleCategories.find((c) => c.id === form.categoryId)?.icon}
                  className="h-3.5 w-3.5"
                />
                {visibleCategories.find((c) => c.id === form.categoryId)?.name}
              </div>
            )}
          </div>
          <Input
            label="Date"
            type="date"
            max={todayISO()}
            icon={<CalendarDays className="h-4 w-4" />}
            value={form.date}
            error={errors.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            required
          />
        </div>

        <div>
          <span className="label">Payment method</span>
          <div className="grid grid-cols-4 gap-2">
            {(['CASH', 'UPI', 'CARD', 'BANK'] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setForm({ ...form, paymentMethod: method })}
                className={cn(
                  'rounded-xl border py-2 text-[12px] font-semibold transition',
                  form.paymentMethod === method
                    ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'border-ink-200 text-ink-500 hover:border-brand-200 hover:text-brand-700 dark:border-ink-700 dark:text-ink-400'
                )}
                aria-pressed={form.paymentMethod === method}
              >
                {paymentLabel(method)}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label="Notes (optional)"
          placeholder="Anything worth remembering about this transaction"
          value={form.notes}
          maxLength={1000}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />

        <div className="flex items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-[11px] text-ink-500 dark:bg-white/[0.03] dark:text-ink-400">
          <Tag className="h-3.5 w-3.5" />
          Categories with “default” come with your account. Add your own in Settings.
        </div>
      </form>
    </Modal>
  );
}
