import { useCallback, useEffect, useState } from 'react';
import {
  Activity, Ban, CheckCircle2, Database, Pencil, Plus, RefreshCw, Search, Server,
  ShieldCheck, Trash2, Users, Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, useCurrency } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDebounced } from '../hooks/useDebounced';
import { Avatar, Badge, Card, EmptyState, LoadingBlock, PageHeader, Progress } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { CategoryIcon } from '../components/CategoryIcon';
import type { Category, TransactionType } from '../lib/types';
import { formatCurrency, formatDate, relativeTime } from '../lib/format';
import { cn } from '../lib/utils';

type Stats = {
  totals: {
    users: number; activeUsers: number; newUsers7d: number; admins: number; transactions: number;
    volume: number; income: number; expense: number; categories: number; goals: number; aiInsights: number;
  };
  signupSeries: { date: string; label: string; users: number }[];
  activitySeries: { date: string; label: string; transactions: number }[];
  topCategories: { name: string; color: string; value: number }[];
  recentUsers: { id: string; name: string; email: string; role: 'USER' | 'ADMIN'; createdAt: string; emailVerified: boolean }[];
};

type AdminUser = {
  id: string; name: string; email: string; role: 'USER' | 'ADMIN'; isActive: boolean;
  emailVerified: boolean; createdAt: string; lastLoginAt: string | null; avatarUrl: string | null;
  currency: string; counts: { transactions: number; budgets: number; goals: number };
};

type System = {
  status: string;
  uptimeSeconds: number;
  database: { status: string; latencyMs: number; provider: string; orm: string };
  runtime: { node: string; platform: string; environment: string; memoryUsedMb: number; heapUsedMb: number };
  integrations: { email: string; google: string; ai: string };
  time: string;
};

const tabs = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'categories', label: 'Categories', icon: Wallet },
  { key: 'system', label: 'System', icon: Server },
] as const;

const ICONS = ['Tag', 'UtensilsCrossed', 'ShoppingBasket', 'Car', 'Home', 'Zap', 'ShoppingBag', 'HeartPulse', 'Clapperboard', 'GraduationCap', 'Plane', 'Repeat', 'Wallet', 'Laptop', 'Briefcase', 'TrendingUp', 'Gift', 'PlusCircle'];
const COLORS = ['#7C3AED', '#A855F7', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#64748B'];

export default function Admin() {
  const { user } = useAuth();
  const { currency, locale } = useCurrency();
  const toast = useToast();
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const debouncedSearch = useDebounced(search);
  const [usersLoading, setUsersLoading] = useState(false);
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [pendingAction, setPendingAction] = useState<{ user: AdminUser; action: 'suspend' | 'activate' | 'promote' | 'demote' } | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryModal, setCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'EXPENSE' as TransactionType, icon: 'Tag', color: '#7C3AED' });
  const [catErrors, setCatErrors] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState(false);

  const money = (value: number) => formatCurrency(value, currency, locale);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, systemData] = await Promise.all([
        api<Stats>('/admin/stats'),
        api<System>('/admin/system'),
      ]);
      setStats(statsData);
      setSystem(systemData);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({ page: String(userPage), limit: '12' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (role) params.set('role', role);
      const data = await api<{ users: AdminUser[]; pagination: { pages: number } }>(`/admin/users?${params.toString()}`);
      setUsers(data.users);
      setUserPages(data.pagination.pages);
    } catch {
      toast.error('Could not load users');
    } finally {
      setUsersLoading(false);
    }
  }, [userPage, debouncedSearch, role, toast]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api<{ categories: Category[] }>('/admin/categories');
      setCategories(data.categories);
    } catch {
      toast.error('Could not load categories');
    }
  }, [toast]);

  useEffect(() => {
    if (tab === 'overview' || tab === 'system') void loadOverview();
    if (tab === 'users') void loadUsers();
    if (tab === 'categories') void loadCategories();
  }, [tab, loadOverview, loadUsers, loadCategories]);

  useEffect(() => {
    setUserPage(1);
  }, [debouncedSearch, role]);

  const applyUserAction = async () => {
    if (!pendingAction) return;
    const { user: target, action } = pendingAction;
    const body =
      action === 'suspend' ? { isActive: false }
        : action === 'activate' ? { isActive: true }
          : action === 'promote' ? { role: 'ADMIN' as const }
            : { role: 'USER' as const };
    try {
      await api(`/admin/users/${target.id}`, { method: 'PATCH', body });
      toast.success('User updated');
      setPendingAction(null);
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update user');
    }
  };

  const deleteUser = async () => {
    if (!confirmUser) return;
    try {
      await api(`/admin/users/${confirmUser.id}`, { method: 'DELETE' });
      toast.success('User deleted with all their data');
      setConfirmUser(null);
      await loadUsers();
      await loadOverview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete user');
    }
  };

  const openCategory = (category?: Category) => {
    setEditingCategory(category ?? null);
    setCatForm(
      category
        ? { name: category.name, type: category.type, icon: category.icon, color: category.color }
        : { name: '', type: 'EXPENSE', icon: 'Tag', color: '#7C3AED' }
    );
    setCatErrors({});
    setCategoryModal(true);
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (catForm.name.trim().length < 2) {
      setCatErrors({ name: 'Enter a category name' });
      return;
    }
    setSavingCategory(true);
    try {
      if (editingCategory) {
        await api(`/admin/categories/${editingCategory.id}`, { method: 'PATCH', body: catForm });
      } else {
        await api('/admin/categories', { method: 'POST', body: catForm });
      }
      toast.success(editingCategory ? 'Category updated' : 'Default category created');
      setCategoryModal(false);
      await loadCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save category');
    } finally {
      setSavingCategory(false);
    }
  };

  const removeCategory = async () => {
    if (!deleteCategory) return;
    try {
      await api(`/admin/categories/${deleteCategory.id}`, { method: 'DELETE' });
      toast.success('Default category removed');
      setDeleteCategory(null);
      await loadCategories();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete category');
    }
  };

  const uptime = system
    ? `${Math.floor(system.uptimeSeconds / 3600)}h ${Math.floor((system.uptimeSeconds % 3600) / 60)}m`
    : '—';
  const maxSignups = Math.max(...(stats?.signupSeries.map((d) => d.users) ?? [1]), 1);

  return (
    <div>
      <PageHeader
        eyebrow="Administrator"
        title="Admin dashboard"
        subtitle="Platform health, user management, shared categories and system monitoring."
        actions={<Button variant="secondary" onClick={() => void loadOverview()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <div className="mb-5 flex flex-wrap gap-1.5 rounded-2xl border border-ink-100 bg-white p-1.5 dark:border-white/5 dark:bg-ink-900">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition',
              tab === key ? 'bg-brand-700 text-white dark:bg-brand-600' : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/5'
            )}
            aria-pressed={tab === key}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (loading || !stats ? (
        <LoadingBlock label="Loading platform metrics…" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total users', value: String(stats.totals.users), hint: `${stats.totals.newUsers7d} new this week`, icon: Users, tone: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' },
              { label: 'Active users (30d)', value: String(stats.totals.activeUsers), hint: `${stats.totals.admins} administrator${stats.totals.admins === 1 ? '' : 's'}`, icon: Activity, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
              { label: 'Transactions', value: String(stats.totals.transactions), hint: `${money(stats.totals.volume)} total volume`, icon: Wallet, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300' },
              { label: 'Savings goals', value: String(stats.totals.goals), hint: `${stats.totals.aiInsights} AI insights`, icon: ShieldCheck, tone: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
            ].map(({ label, value, hint, icon: Icon, tone }) => (
              <Card key={label} className="flex items-start justify-between p-5">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
                  <p className="mt-1 font-display text-2xl font-extrabold text-ink-900 dark:text-white">{value}</p>
                  <p className="mt-1 text-[11px] text-ink-400">{hint}</p>
                </div>
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tone)}>
                  <Icon className="h-4 w-4" />
                </span>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">New signups</h2>
              <p className="mb-4 text-[11.5px] text-ink-400">Last 14 days</p>
              <div className="flex h-[160px] items-end gap-1.5">
                {stats.signupSeries.map((day) => (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-brand-500/80 transition hover:bg-brand-600"
                        style={{ height: `${Math.max(3, (day.users / maxSignups) * 100)}%` }}
                        title={`${day.users} users on ${day.label}`}
                      />
                    </div>
                    <span className="text-[9px] text-ink-400">{day.label.split(' ')[1]}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Platform activity</h2>
              <p className="mb-4 text-[11.5px] text-ink-400">Transactions recorded per day</p>
              <div className="space-y-2">
                {stats.activitySeries.slice(-7).map((day) => {
                  const max = Math.max(...stats.activitySeries.map((d) => d.transactions), 1);
                  return (
                    <div key={day.date} className="flex items-center gap-2">
                      <span className="w-12 text-[10px] text-ink-400">{day.label}</span>
                      <Progress value={(day.transactions / max) * 100} className="h-2 flex-1" />
                      <span className="w-6 text-right text-[10.5px] font-semibold text-ink-500">{day.transactions}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 font-display text-[14px] font-bold text-ink-900 dark:text-white">Top spending categories (platform-wide)</h2>
              {stats.topCategories.length ? (
                <div className="space-y-3">
                  {stats.topCategories.map((category) => {
                    const max = Math.max(...stats.topCategories.map((c) => c.value), 1);
                    return (
                      <div key={category.name}>
                        <div className="mb-1 flex justify-between text-[11.5px]">
                          <span className="font-semibold text-ink-700 dark:text-ink-200">{category.name}</span>
                          <span className="text-ink-400">{money(category.value)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${(category.value / max) * 100}%`, backgroundColor: category.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-4 text-center text-[12px] text-ink-400">No expenses recorded yet.</p>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 font-display text-[14px] font-bold text-ink-900 dark:text-white">Newest accounts</h2>
              <div className="divide-y divide-ink-50 dark:divide-white/[0.04]">
                {stats.recentUsers.map((recent) => (
                  <div key={recent.id} className="flex items-center gap-2.5 py-2.5">
                    <Avatar name={recent.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-ink-800 dark:text-ink-100">{recent.name}</p>
                      <p className="truncate text-[10.5px] text-ink-400">{recent.email}</p>
                    </div>
                    <div className="text-right">
                      <Badge tone={recent.role === 'ADMIN' ? 'brand' : 'neutral'}>{recent.role}</Badge>
                      <p className="mt-0.5 text-[9.5px] text-ink-400">{relativeTime(recent.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ))}

      {tab === 'users' && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-ink-100 p-4 dark:border-white/5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Input
                placeholder="Search by name or email…"
                icon={<Search className="h-4 w-4" />}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={role} onChange={(event) => setRole(event.target.value)} className="sm:max-w-[160px]">
              <option value="">All roles</option>
              <option value="USER">Users</option>
              <option value="ADMIN">Admins</option>
            </Select>
          </div>

          {usersLoading ? (
            <LoadingBlock label="Loading users…" />
          ) : users.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="No users found" description="Try a different search term." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-ink-100 dark:border-white/5">
                  <tr>
                    <th className="table-head">User</th>
                    <th className="table-head">Role</th>
                    <th className="table-head">Status</th>
                    <th className="table-head">Data</th>
                    <th className="table-head">Joined</th>
                    <th className="table-head text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50 dark:divide-white/[0.04]">
                  {users.map((adminUser) => (
                    <tr key={adminUser.id} className="hover:bg-ink-50/50 dark:hover:bg-white/[0.02]">
                      <td className="table-cell">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={adminUser.name} src={adminUser.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900 dark:text-white">
                              {adminUser.name} {adminUser.id === user?.id && <span className="text-[10px] text-brand-600">(you)</span>}
                            </p>
                            <p className="truncate text-[10.5px] text-ink-400">{adminUser.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-cell">
                        <Badge tone={adminUser.role === 'ADMIN' ? 'brand' : 'neutral'}>{adminUser.role}</Badge>
                      </td>
                      <td className="table-cell">
                        <Badge tone={adminUser.isActive ? 'success' : 'danger'}>{adminUser.isActive ? 'Active' : 'Suspended'}</Badge>
                        {!adminUser.emailVerified && <Badge tone="warning" className="ml-1">Unverified</Badge>}
                      </td>
                      <td className="table-cell text-[11.5px] text-ink-500 dark:text-ink-400">
                        {adminUser.counts.transactions} txns · {adminUser.counts.goals} goals
                      </td>
                      <td className="table-cell text-[11.5px] text-ink-500 dark:text-ink-400">
                        {formatDate(adminUser.createdAt)}
                        <span className="block text-[10px] text-ink-400">
                          {adminUser.lastLoginAt ? `seen ${relativeTime(adminUser.lastLoginAt)}` : 'never signed in'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={adminUser.id === user?.id}
                            onClick={() => setPendingAction({ user: adminUser, action: adminUser.role === 'ADMIN' ? 'demote' : 'promote' })}
                            className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30 dark:hover:bg-brand-500/10"
                            title={adminUser.role === 'ADMIN' ? 'Demote to user' : 'Promote to admin'}
                            aria-label="Change role"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={adminUser.id === user?.id}
                            onClick={() => setPendingAction({ user: adminUser, action: adminUser.isActive ? 'suspend' : 'activate' })}
                            className="rounded-lg p-1.5 text-ink-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-30 dark:hover:bg-amber-500/10"
                            title={adminUser.isActive ? 'Suspend user' : 'Activate user'}
                            aria-label="Toggle active"
                          >
                            {adminUser.isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            disabled={adminUser.id === user?.id}
                            onClick={() => setConfirmUser(adminUser)}
                            className="rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-500/10"
                            title="Delete user"
                            aria-label="Delete user"
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
          )}

          <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 dark:border-white/5">
            <p className="text-[11.5px] text-ink-400">Page {userPage} of {userPages}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={userPage <= 1} onClick={() => setUserPage((p) => p - 1)}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={userPage >= userPages} onClick={() => setUserPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </Card>
      )}

      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openCategory()}><Plus className="h-4 w-4" /> New default category</Button>
          </div>
          <Card className="overflow-hidden">
            <div className="grid divide-y divide-ink-50 dark:divide-white/[0.04] sm:grid-cols-2 sm:divide-y-0">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center gap-2.5 border-ink-50 px-4 py-3 dark:border-white/[0.04] sm:border-b">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${category.color}1f`, color: category.color }}
                  >
                    <CategoryIcon name={category.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{category.name}</p>
                    <p className="text-[10.5px] text-ink-400">
                      {category.type === 'INCOME' ? 'Income' : 'Expense'} · {category.transactionCount ?? 0} uses
                    </p>
                  </div>
                  <button type="button" onClick={() => openCategory(category)} className="rounded-lg p-1.5 text-ink-400 hover:text-brand-700" aria-label="Edit category">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDeleteCategory(category)} className="rounded-lg p-1.5 text-ink-400 hover:text-rose-600" aria-label="Delete category">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'system' && (loading || !system ? (
        <LoadingBlock label="Checking system health…" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[14px] font-bold text-ink-900 dark:text-white">
              <Database className="h-4 w-4 text-brand-600" /> Database
            </h2>
            <dl className="space-y-3 text-[12.5px]">
              {[
                ['Status', system.database.status],
                ['Latency', `${system.database.latencyMs} ms`],
                ['Provider', system.database.provider],
                ['ORM', system.database.orm],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-ink-400">{label}</dt>
                  <dd className="font-semibold text-ink-800 dark:text-ink-100">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> All systems operational
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[14px] font-bold text-ink-900 dark:text-white">
              <Server className="h-4 w-4 text-brand-600" /> Runtime
            </h2>
            <dl className="space-y-3 text-[12.5px]">
              {[
                ['Uptime', uptime],
                ['Node.js', system.runtime.node],
                ['Platform', system.runtime.platform],
                ['Environment', system.runtime.environment],
                ['Memory (RSS)', `${system.runtime.memoryUsedMb} MB`],
                ['Heap used', `${system.runtime.heapUsedMb} MB`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-ink-400">{label}</dt>
                  <dd className="font-semibold text-ink-800 dark:text-ink-100">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-3 font-display text-[14px] font-bold text-ink-900 dark:text-white">Integrations</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(system.integrations).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-ink-100 p-3.5 dark:border-white/5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{key}</p>
                  <p className="mt-1 text-[12.5px] font-semibold capitalize text-ink-800 dark:text-ink-100">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ))}

      <Modal
        open={categoryModal}
        onClose={() => setCategoryModal(false)}
        title={editingCategory ? 'Edit default category' : 'New default category'}
        description="Default categories are available to every user."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoryModal(false)}>Cancel</Button>
            <Button type="submit" form="admin-category-form" loading={savingCategory}>Save category</Button>
          </>
        }
      >
        <form id="admin-category-form" onSubmit={saveCategory} className="space-y-3.5">
          <Input
            label="Name"
            value={catForm.name}
            error={catErrors.name}
            onChange={(event) => setCatForm({ ...catForm, name: event.target.value })}
            required
          />
          <Select label="Type" value={catForm.type} onChange={(event) => setCatForm({ ...catForm, type: event.target.value as TransactionType })}>
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
                  onClick={() => setCatForm({ ...catForm, color })}
                  className={cn('h-7 w-7 rounded-full transition', catForm.color === color ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-ink-900' : 'hover:scale-110')}
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
                  onClick={() => setCatForm({ ...catForm, icon })}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-lg', catForm.icon === icon ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200' : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-white/5')}
                  aria-label={icon}
                >
                  <CategoryIcon name={icon} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction?.action === 'suspend' ? 'Suspend this user?'
            : pendingAction?.action === 'activate' ? 'Activate this user?'
              : pendingAction?.action === 'promote' ? 'Make this user an administrator?'
                : 'Remove administrator access?'
        }
        message={
          pendingAction?.action === 'suspend'
            ? `${pendingAction.user.email} will be signed out and unable to sign in.`
            : pendingAction?.action === 'promote'
              ? `${pendingAction.user.email} will get full admin access.`
              : `Update the account for ${pendingAction?.user.email}.`
        }
        confirmLabel="Confirm"
        destructive={pendingAction?.action === 'suspend' || pendingAction?.action === 'demote'}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void applyUserAction()}
      />

      <ConfirmDialog
        open={Boolean(confirmUser)}
        title="Delete user?"
        message={`${confirmUser?.email} and all their transactions, budgets, goals and insights will be permanently removed.`}
        confirmLabel="Delete user"
        destructive
        onCancel={() => setConfirmUser(null)}
        onConfirm={() => void deleteUser()}
      />

      <ConfirmDialog
        open={Boolean(deleteCategory)}
        title="Delete default category?"
        message={`“${deleteCategory?.name}” will be removed for all users. Their transactions stay but become uncategorised.`}
        confirmLabel="Delete category"
        destructive
        onCancel={() => setDeleteCategory(null)}
        onConfirm={() => void removeCategory()}
      />
    </div>
  );
}
