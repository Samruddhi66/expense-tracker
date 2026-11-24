import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Filter, Pencil, Plus,
  Search, SlidersHorizontal, Tags, Trash2, X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCurrency } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDebounced } from '../hooks/useDebounced';
import { Badge, Card, EmptyState, LoadingBlock, PageHeader } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { ConfirmDialog } from '../components/ui/Modal';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionModal } from '../components/TransactionModal';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import type { Category, PaymentMethod, Transaction, TransactionType } from '../lib/types';
import { formatCurrency, formatDate, paymentLabel } from '../lib/format';
import { cn } from '../lib/utils';

type Filters = {
  search: string;
  type: '' | TransactionType;
  categoryId: string;
  paymentMethod: '' | PaymentMethod;
  from: string;
  to: string;
  sort: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
};

const defaultFilters: Filters = {
  search: '', type: '', categoryId: '', paymentMethod: '', from: '', to: '', sort: 'date_desc',
};

export default function Transactions() {
  const { currency, locale } = useCurrency();
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    transactions: Transaction[];
    pagination: { page: number; pages: number; total: number; limit: number };
    summary: { income: number; expense: number; net: number; count: number };
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const debouncedSearch = useDebounced(filters.search, 350);
  const money = (value: number) => formatCurrency(value, currency, locale);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (filters.type) params.set('type', filters.type);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    params.set('sort', filters.sort);
    params.set('page', String(page));
    params.set('limit', '15');
    try {
      const result = await api<typeof data>(`/transactions?${params.toString()}`);
      setData(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filters.type, filters.categoryId, filters.paymentMethod, filters.from, filters.to, filters.sort, page, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ categories: Category[] }>('/categories')
      .then((result) => setCategories(result.categories))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.type, filters.categoryId, filters.paymentMethod, filters.from, filters.to, filters.sort]);

  const activeFilters = [
    filters.type && `Type: ${filters.type === 'INCOME' ? 'Income' : 'Expense'}`,
    filters.categoryId && `Category: ${categories.find((c) => c.id === filters.categoryId)?.name ?? '—'}`,
    filters.paymentMethod && `Method: ${paymentLabel(filters.paymentMethod)}`,
    filters.from && `From ${filters.from}`,
    filters.to && `To ${filters.to}`,
  ].filter(Boolean) as string[];

  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/transactions/${deleting.id}`, { method: 'DELETE' });
      toast.success('Transaction deleted');
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete transaction');
    }
  };

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Every rupee in and out, searchable and filtered from your database."
        actions={
          <>
            <Button variant="secondary" onClick={() => setCategoryModal(true)}>
              <Tags className="h-4 w-4" /> Categories
            </Button>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Income (filtered)', value: data?.summary.income ?? 0, icon: ArrowDownLeft, tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Expenses (filtered)', value: data?.summary.expense ?? 0, icon: ArrowUpRight, tone: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-50 dark:bg-brand-500/10' },
          { label: 'Net (filtered)', value: data?.summary.net ?? 0, icon: SlidersHorizontal, tone: 'text-ink-900 dark:text-white', bg: 'bg-ink-100 dark:bg-white/5' },
        ].map(({ label, value, icon: Icon, tone, bg }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', bg, tone)}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
              <p className={cn('font-display text-lg font-extrabold', tone)}>{money(value)}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-100 p-4 dark:border-white/5 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search description, notes or category…"
              icon={<Search className="h-4 w-4" />}
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              aria-label="Search transactions"
              rightSlot={
                filters.search ? (
                  <button
                    type="button"
                    onClick={() => setFilters({ ...filters, search: '' })}
                    className="rounded-lg p-2 text-ink-400 hover:text-ink-700 dark:hover:text-white"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : undefined
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value as Filters['type'] })}
              aria-label="Filter by type"
              className="min-w-[130px]"
            >
              <option value="">All types</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
            </Select>
            <Button variant="secondary" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-4 w-4" /> Filters
              {activeFilters.length > 0 && (
                <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{activeFilters.length}</span>
              )}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="grid gap-3 border-b border-ink-100 bg-ink-50/60 p-4 dark:border-white/5 dark:bg-white/[0.02] sm:grid-cols-2 lg:grid-cols-5">
            <Select
              label="Category"
              value={filters.categoryId}
              onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
            <Select
              label="Payment method"
              value={filters.paymentMethod}
              onChange={(event) => setFilters({ ...filters, paymentMethod: event.target.value as Filters['paymentMethod'] })}
            >
              <option value="">All methods</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="BANK">Bank</option>
            </Select>
            <Input label="From" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
            <Input label="To" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
            <Select
              label="Sort by"
              value={filters.sort}
              onChange={(event) => setFilters({ ...filters, sort: event.target.value as Filters['sort'] })}
            >
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="amount_desc">Highest amount</option>
              <option value="amount_asc">Lowest amount</option>
            </Select>
            <div className="sm:col-span-2 lg:col-span-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters(defaultFilters)}
              >
                <X className="h-3.5 w-3.5" /> Clear all filters
              </Button>
            </div>
          </div>
        )}

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {activeFilters.map((label) => (
              <span key={label} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10.5px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                {label}
              </span>
            ))}
          </div>
        )}

        {loading ? (
          <LoadingBlock label="Loading transactions…" />
        ) : !data || data.transactions.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={activeFilters.length || filters.search ? 'No matching transactions' : 'No transactions yet'}
            description={
              activeFilters.length || filters.search
                ? 'Try adjusting your search or filters.'
                : 'Add your first income or expense to start building your financial history.'
            }
            action={
              <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
                <Plus className="h-4 w-4" /> Add transaction
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-ink-100 dark:border-white/5">
                  <tr>
                    <th className="table-head">Transaction</th>
                    <th className="table-head">Category</th>
                    <th className="table-head">Method</th>
                    <th className="table-head">Date</th>
                    <th className="table-head text-right">Amount</th>
                    <th className="table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50 dark:divide-white/[0.04]">
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="transition hover:bg-ink-50/60 dark:hover:bg-white/[0.02]">
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                            style={{ backgroundColor: `${tx.category?.color ?? '#7C3AED'}18`, color: tx.category?.color ?? '#7C3AED' }}
                          >
                            <CategoryIcon name={tx.category?.icon} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900 dark:text-white">{tx.description}</p>
                            {tx.notes && <p className="truncate text-[11px] text-ink-400">{tx.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <span className="text-[12.5px]">{tx.category?.name ?? 'Uncategorised'}</span>
                        {tx.recurringId && <Badge tone="info" className="ml-2">Recurring</Badge>}
                      </td>
                      <td className="table-cell text-[12.5px]">{paymentLabel(tx.paymentMethod)}</td>
                      <td className="table-cell text-[12.5px] text-ink-500 dark:text-ink-400">{formatDate(tx.date)}</td>
                      <td className={cn('table-cell text-right font-bold', tx.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white')}>
                        {tx.type === 'INCOME' ? '+' : '−'}{money(tx.amount)}
                      </td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditing(tx); setModalOpen(true); }}
                            className="rounded-lg p-2 text-ink-400 transition hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-500/10 dark:hover:text-brand-200"
                            aria-label={`Edit ${tx.description}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(tx)}
                            className="rounded-lg p-2 text-ink-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                            aria-label={`Delete ${tx.description}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-ink-50 dark:divide-white/[0.04] md:hidden">
              {data.transactions.map((tx) => (
                <div key={tx.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${tx.category?.color ?? '#7C3AED'}18`, color: tx.category?.color ?? '#7C3AED' }}
                    >
                      <CategoryIcon name={tx.category?.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[13px] font-semibold text-ink-900 dark:text-white">{tx.description}</p>
                        <span className={cn('shrink-0 text-[13px] font-bold', tx.type === 'INCOME' ? 'text-emerald-600' : 'text-ink-900 dark:text-white')}>
                          {tx.type === 'INCOME' ? '+' : '−'}{money(tx.amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        {tx.category?.name ?? 'Uncategorised'} · {paymentLabel(tx.paymentMethod)} · {formatDate(tx.date)}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => { setEditing(tx); setModalOpen(true); }} className="btn-secondary btn-sm px-2.5 py-1 text-[11px]">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button type="button" onClick={() => setDeleting(tx)} className="btn-ghost px-2.5 py-1 text-[11px] text-rose-600 dark:text-rose-300">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 dark:border-white/5 sm:flex-row">
              <p className="text-[11.5px] text-ink-400">
                Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–
                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="px-2 text-[11.5px] font-semibold text-ink-500 dark:text-ink-400">
                  {data.pagination.page} / {data.pagination.pages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.pagination.page >= data.pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <TransactionModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        transaction={editing}
        onSaved={() => void load()}
      />
      <CategoryManagerModal open={categoryModal} onClose={() => { setCategoryModal(false); void load(); }} />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete transaction?"
        message={`“${deleting?.description}” (${deleting ? money(deleting.amount) : ''}) will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
