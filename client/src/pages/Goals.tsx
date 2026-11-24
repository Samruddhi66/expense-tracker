import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays, CheckCircle2, Coins, Pencil, Plus, Target, Trash2, TrendingUp,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCurrency } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Card, EmptyState, LoadingBlock, PageHeader, Progress } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import type { SavingsGoal } from '../lib/types';
import { formatCurrency, formatDate } from '../lib/format';

type GoalsResponse = {
  goals: SavingsGoal[];
  summary: { count: number; active: number; completed: number; savedTotal: number; targetTotal: number };
};

const COLORS = ['#7C3AED', '#A855F7', '#EC4899', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6'];

function Ring({ progress, color }: { progress: number; color: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, progress) / 100) * circumference;
  return (
    <svg viewBox="0 0 84 84" className="h-20 w-20 -rotate-90" aria-hidden="true">
      <circle cx="42" cy="42" r={radius} fill="none" strokeWidth="8" className="stroke-ink-100 dark:stroke-white/10" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 700ms ease' }}
      />
    </svg>
  );
}

export default function Goals() {
  const { currency, locale } = useCurrency();
  const toast = useToast();
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [deleting, setDeleting] = useState<SavingsGoal | null>(null);
  const [contributeTo, setContributeTo] = useState<SavingsGoal | null>(null);
  const [form, setForm] = useState({ name: '', description: '', targetAmount: '', targetDate: '', color: COLORS[0]! });
  const [contribution, setContribution] = useState({ amount: '', note: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const money = (value: number) => formatCurrency(value, currency, locale);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<GoalsResponse>('/goals');
      setData(result);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load savings goals');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    setForm({ name: '', description: '', targetAmount: '', targetDate: date.toISOString().slice(0, 10), color: COLORS[Math.floor(Math.random() * COLORS.length)]! });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal);
    setForm({
      name: goal.name,
      description: goal.description ?? '',
      targetAmount: String(goal.targetAmount),
      targetDate: goal.targetDate.slice(0, 10),
      color: goal.color,
    });
    setErrors({});
    setModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Give your goal a name';
    if (!form.targetAmount || Number(form.targetAmount) <= 0) next.targetAmount = 'Enter a target amount';
    if (!form.targetDate) next.targetDate = 'Choose a target date';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        targetAmount: Number(form.targetAmount),
        targetDate: form.targetDate,
        color: form.color,
      };
      if (editing) {
        await api(`/goals/${editing.id}`, { method: 'PATCH', body });
        toast.success('Goal updated');
      } else {
        await api('/goals', { method: 'POST', body });
        toast.success('Savings goal created');
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

  const saveContribution = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contributeTo) return;
    if (!contribution.amount || Number(contribution.amount) <= 0) {
      setErrors({ amount: 'Enter an amount to add' });
      return;
    }
    setSaving(true);
    try {
      await api(`/goals/${contributeTo.id}/contributions`, {
        method: 'POST',
        body: { amount: Number(contribution.amount), note: contribution.note.trim() || null },
      });
      toast.success('Contribution added');
      setContributeTo(null);
      setContribution({ amount: '', note: '' });
      setErrors({});
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add contribution');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await api(`/goals/${deleting.id}`, { method: 'DELETE' });
      toast.success('Goal deleted');
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete goal');
    }
  };

  const removeContribution = async (goalId: string, contributionId: string) => {
    try {
      await api(`/goals/${goalId}/contributions/${contributionId}`, { method: 'DELETE' });
      toast.success('Contribution removed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove contribution');
    }
  };

  return (
    <div>
      <PageHeader
        title="Savings goals"
        subtitle="Turn intentions into progress. Track contributions and dates in one place."
        actions={<Button onClick={openCreate}><Plus className="h-4 w-4" /> New goal</Button>}
      />

      {loading ? (
        <LoadingBlock label="Loading goals…" />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total saved', value: money(data.summary.savedTotal), icon: Coins, tone: 'text-brand-700 dark:text-brand-300', bg: 'bg-brand-50 dark:bg-brand-500/10' },
              { label: 'Target amount', value: money(data.summary.targetTotal), icon: Target, tone: 'text-ink-900 dark:text-white', bg: 'bg-ink-100 dark:bg-white/5' },
              { label: 'Active goals', value: String(data.summary.active), icon: TrendingUp, tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
              { label: 'Completed', value: String(data.summary.completed), icon: CheckCircle2, tone: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
            ].map(({ label, value, icon: Icon, tone, bg }) => (
              <Card key={label} className="flex items-center gap-3 p-4">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
                  <p className={`truncate font-display text-lg font-extrabold ${tone}`}>{value}</p>
                </div>
              </Card>
            ))}
          </div>

          {data.goals.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Target className="h-6 w-6" />}
                title="No savings goals yet"
                description="Plan a trip, build an emergency fund or save for something you love. Add your first goal to get going."
                action={<Button onClick={openCreate}><Plus className="h-4 w-4" /> Create a goal</Button>}
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.goals.map((goal) => (
                <Card key={goal.id} className="card-hover p-5">
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      <Ring progress={goal.progress} color={goal.color} />
                      <span className="absolute inset-0 flex items-center justify-center font-display text-[15px] font-extrabold text-ink-900 dark:text-white">
                        {Math.round(goal.progress)}%
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1">
                        <p className="truncate font-display text-[14px] font-bold text-ink-900 dark:text-white">{goal.name}</p>
                        <Badge tone={goal.status === 'COMPLETED' ? 'success' : goal.status === 'ARCHIVED' ? 'neutral' : 'brand'}>
                          {goal.status === 'COMPLETED' ? 'Done' : goal.status === 'ARCHIVED' ? 'Archived' : 'Active'}
                        </Badge>
                      </div>
                      {goal.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-500 dark:text-ink-400">{goal.description}</p>}
                      <p className="mt-2 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
                        {money(goal.savedAmount)} <span className="font-normal text-ink-400">of {money(goal.targetAmount)}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-400">
                        <CalendarDays className="h-3 w-3" />
                        {goal.daysLeft >= 0 ? `${goal.daysLeft} days left` : 'Target date passed'} · {formatDate(goal.targetDate)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button size="sm" className="flex-1" onClick={() => { setContributeTo(goal); setContribution({ amount: '', note: '' }); setErrors({}); }}>
                      <Plus className="h-3.5 w-3.5" /> Add money
                    </Button>
                    <button type="button" onClick={() => openEdit(goal)} className="rounded-lg border border-ink-200 p-2 text-ink-500 hover:border-brand-200 hover:text-brand-700 dark:border-ink-700 dark:hover:text-brand-200" aria-label="Edit goal">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setDeleting(goal)} className="rounded-lg border border-ink-200 p-2 text-ink-500 hover:border-rose-200 hover:text-rose-600 dark:border-ink-700" aria-label="Delete goal">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {goal.contributions.length > 0 && (
                    <div className="mt-3 border-t border-ink-100 pt-2.5 dark:border-white/5">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === goal.id ? null : goal.id)}
                        className="flex w-full items-center justify-between text-[11px] font-semibold text-ink-500 hover:text-brand-700 dark:text-ink-400 dark:hover:text-brand-200"
                      >
                        {goal.contributions.length} contribution{goal.contributions.length === 1 ? '' : 's'}
                        <span>{expanded === goal.id ? 'Hide' : 'Show'}</span>
                      </button>
                      {expanded === goal.id && (
                        <div className="mt-2 space-y-1.5">
                          {goal.contributions.slice(0, 6).map((c) => (
                            <div key={c.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                              <span className="truncate text-ink-500 dark:text-ink-400">
                                {formatDate(c.date)}{c.note ? ` · ${c.note}` : ''}
                              </span>
                              <span className="flex items-center gap-1.5 font-semibold text-ink-800 dark:text-ink-100">
                                {money(c.amount)}
                                <button type="button" onClick={() => void removeContribution(goal.id, c.id)} className="text-ink-300 hover:text-rose-500" aria-label="Remove contribution">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit savings goal' : 'Create a savings goal'}
        description="Set the target and date. Add contributions any time."
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="goal-form" loading={saving}>{editing ? 'Save changes' : 'Create goal'}</Button>
          </>
        }
      >
        <form id="goal-form" onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Goal name"
            placeholder="e.g. Japan trip"
            value={form.name}
            error={errors.name}
            maxLength={100}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <Textarea
            label="Why this goal? (optional)"
            placeholder="A short note to keep you motivated"
            value={form.description}
            maxLength={500}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Target amount (${currency})`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.targetAmount}
              error={errors.targetAmount}
              onChange={(event) => setForm({ ...form, targetAmount: event.target.value })}
              required
            />
            <Input
              label="Target date"
              type="date"
              value={form.targetDate}
              error={errors.targetDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
              required
            />
          </div>
          <div>
            <span className="label">Colour</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm({ ...form, color })}
                  className={`h-7 w-7 rounded-full transition ${form.color === color ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-ink-900' : 'hover:scale-110'}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Colour ${color}`}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(contributeTo)}
        onClose={() => setContributeTo(null)}
        title={`Add to ${contributeTo?.name ?? 'goal'}`}
        description={contributeTo ? `${money(contributeTo.savedAmount)} saved of ${money(contributeTo.targetAmount)}.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setContributeTo(null)}>Cancel</Button>
            <Button type="submit" form="contribution-form" loading={saving}>Add contribution</Button>
          </>
        }
      >
        <form id="contribution-form" onSubmit={saveContribution} className="space-y-4" noValidate>
          <Input
            label={`Amount (${currency})`}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={contribution.amount}
            error={errors.amount}
            onChange={(event) => setContribution({ ...contribution, amount: event.target.value })}
            autoFocus
            required
          />
          <Input
            label="Note (optional)"
            placeholder="e.g. Monthly transfer"
            value={contribution.note}
            maxLength={300}
            onChange={(event) => setContribution({ ...contribution, note: event.target.value })}
          />
          {contributeTo && (
            <Progress
              value={Math.min(100, ((contributeTo.savedAmount + Number(contribution.amount || 0)) / contributeTo.targetAmount) * 100)}
              tone="brand"
            />
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete savings goal?"
        message={`“${deleting?.name}” and its contribution history will be permanently removed.`}
        confirmLabel="Delete goal"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
