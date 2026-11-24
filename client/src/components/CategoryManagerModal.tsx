import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal, ConfirmDialog } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Input';
import { Badge } from './ui/Misc';
import { CategoryIcon } from './CategoryIcon';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import type { Category, TransactionType } from '../lib/types';
import { cn } from '../lib/utils';

const ICONS = [
  'Tag', 'UtensilsCrossed', 'ShoppingBasket', 'Car', 'Home', 'Zap', 'ShoppingBag',
  'HeartPulse', 'Clapperboard', 'GraduationCap', 'Plane', 'Repeat', 'Wallet',
  'Laptop', 'Briefcase', 'TrendingUp', 'Gift', 'PlusCircle', 'Coffee', 'CreditCard',
  'Smartphone', 'BookOpen', 'Dumbbell', 'Baby', 'Banknote',
];

const COLORS = ['#7C3AED', '#A855F7', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#6366F1', '#64748B'];

const empty = { name: '', type: 'EXPENSE' as TransactionType, icon: 'Tag', color: '#7C3AED' };

export function CategoryManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ categories: Category[] }>('/categories');
      setCategories(data.categories);
    } catch {
      toast.error('Could not load categories');
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      void load();
      setForm(empty);
      setEditingId(null);
      setErrors({});
    }
  }, [open, load]);

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setForm({ name: category.name, type: category.type, icon: category.icon, color: category.color });
    setErrors({});
  };

  const reset = () => {
    setEditingId(null);
    setForm(empty);
    setErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setErrors({ name: 'Enter a category name' });
      return;
    }
    setLoading(true);
    try {
      if (editingId) {
        await api(`/categories/${editingId}`, { method: 'PATCH', body: form });
        toast.success('Category updated');
      } else {
        await api('/categories', { method: 'POST', body: form });
        toast.success('Category created');
      }
      reset();
      await load();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.details ?? {});
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/categories/${deleting.id}`, { method: 'DELETE' });
      toast.success('Category deleted');
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete category');
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Manage categories"
        description="Default categories are shared; your own categories are private to your account."
        size="lg"
      >
        <div className="grid gap-6 md:grid-cols-[1fr_1.15fr]">
          <form onSubmit={submit} className="space-y-3.5">
            <h3 className="font-display text-[13px] font-bold text-ink-900 dark:text-white">
              {editingId ? 'Edit category' : 'New category'}
            </h3>
            <Input
              label="Name"
              placeholder="e.g. Pet care"
              value={form.name}
              error={errors.name}
              maxLength={60}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
            <Select
              label="Type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as TransactionType })}
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </Select>

            <div>
              <span className="label">Colour</span>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setForm({ ...form, color })}
                    className={cn(
                      'h-7 w-7 rounded-full transition',
                      form.color === color ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-ink-900' : 'hover:scale-110'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Colour ${color}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="label">Icon</span>
              <div className="grid grid-cols-9 gap-1.5">
                {ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setForm({ ...form, icon })}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg transition',
                      form.icon === icon
                        ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200'
                        : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-white/5'
                    )}
                    aria-label={icon}
                    title={icon}
                  >
                    <CategoryIcon name={icon} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" loading={loading} className="flex-1">
                {editingId ? 'Save changes' : <><Plus className="h-4 w-4" /> Add category</>}
              </Button>
              {editingId && (
                <Button type="button" variant="secondary" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div>
            <h3 className="mb-2 font-display text-[13px] font-bold text-ink-900 dark:text-white">
              Your categories ({categories.length})
            </h3>
            <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center gap-2.5 rounded-xl border border-ink-100 px-2.5 py-2 dark:border-white/5"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${category.color}1f`, color: category.color }}
                  >
                    <CategoryIcon name={category.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{category.name}</p>
                    <p className="text-[10.5px] text-ink-400">
                      {category.type === 'INCOME' ? 'Income' : 'Expense'}
                      {category.transactionCount ? ` · ${category.transactionCount} used` : ''}
                    </p>
                  </div>
                  {category.isSystem ? (
                    <Badge tone="neutral">Default</Badge>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(category)}
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-700 dark:hover:bg-white/5"
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(category)}
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete category?"
        message={`“${deleting?.name}” will be removed. Existing transactions stay, but become uncategorised.`}
        confirmLabel="Delete category"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}
