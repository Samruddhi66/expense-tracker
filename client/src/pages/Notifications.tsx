import { useCallback, useEffect, useState } from 'react';
import {
  Bell, BellRing, CalendarClock, CheckCheck, ChevronLeft, ChevronRight, PiggyBank, Trash2, Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Badge, Card, EmptyState, LoadingBlock, PageHeader } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import type { Notification } from '../lib/types';
import { relativeTime } from '../lib/format';
import { cn } from '../lib/utils';

const filters = [
  { key: '', label: 'All' },
  { key: 'BUDGET_ALERT', label: 'Budgets' },
  { key: 'BILL_REMINDER', label: 'Bills' },
  { key: 'SAVINGS', label: 'Savings' },
  { key: 'MONTHLY_SUMMARY', label: 'Summaries' },
] as const;

const iconFor = (type: Notification['type']) => {
  switch (type) {
    case 'BUDGET_ALERT': return { icon: Wallet, classes: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' };
    case 'BILL_REMINDER': return { icon: CalendarClock, classes: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300' };
    case 'SAVINGS': return { icon: PiggyBank, classes: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' };
    case 'MONTHLY_SUMMARY': return { icon: BellRing, classes: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300' };
    default: return { icon: Bell, classes: 'bg-ink-100 text-ink-600 dark:bg-white/5 dark:text-ink-300' };
  }
};

export default function Notifications() {
  const toast = useToast();
  const [type, setType] = useState<string>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    notifications: Notification[];
    unread: number;
    pagination: { page: number; pages: number; total: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (type) params.set('type', type);
      const result = await api<typeof data>(`/notifications?${params.toString()}`);
      setData(result);
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch {
      toast.error('Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [page, type, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (notification: Notification) => {
    if (notification.isRead) return;
    try {
      await api(`/notifications/${notification.id}/read`, { method: 'PATCH' });
      setData((current) =>
        current
          ? {
              ...current,
              unread: Math.max(0, current.unread - 1),
              notifications: current.notifications.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
            }
          : current
      );
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch {
      toast.error('Could not mark as read');
    }
  };

  const markAll = async () => {
    try {
      const result = await api<{ message: string }>('/notifications/read-all', { method: 'POST' });
      toast.success(result.message);
      await load();
    } catch {
      toast.error('Could not update notifications');
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/notifications/${id}`, { method: 'DELETE' });
      setData((current) =>
        current
          ? { ...current, notifications: current.notifications.filter((n) => n.id !== id), pagination: { ...current.pagination, total: current.pagination.total - 1 } }
          : current
      );
      window.dispatchEvent(new Event('notifications:refresh'));
    } catch {
      toast.error('Could not delete notification');
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Budget alerts, bill reminders, savings milestones and monthly summaries."
        actions={
          <Button variant="secondary" onClick={() => void markAll()} disabled={!data?.unread}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => { setType(filter.key); setPage(1); }}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[12px] font-bold transition',
              type === filter.key
                ? 'bg-brand-700 text-white dark:bg-brand-600'
                : 'border border-ink-200 bg-white text-ink-500 hover:border-brand-200 hover:text-brand-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-400'
            )}
            aria-pressed={type === filter.key}
          >
            {filter.label}
          </button>
        ))}
        {data && data.unread > 0 && (
          <Badge tone="danger" className="ml-1">{data.unread} unread</Badge>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingBlock label="Loading notifications…" />
        ) : !data || data.notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="You are all caught up"
            description="Alerts about budgets, bills and savings goals will appear here."
          />
        ) : (
          <>
            <div className="divide-y divide-ink-50 dark:divide-white/[0.04]">
              {data.notifications.map((notification) => {
                const { icon: Icon, classes } = iconFor(notification.type);
                return (
                  <div
                    key={notification.id}
                    className={cn(
                      'group flex items-start gap-3 px-4 py-4 transition sm:px-5',
                      !notification.isRead && 'bg-brand-50/40 dark:bg-brand-500/[0.06]'
                    )}
                  >
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', classes)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <button type="button" onClick={() => void markRead(notification)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-[13px] text-ink-900 dark:text-white', notification.isRead ? 'font-semibold' : 'font-bold')}>
                          {notification.title}
                        </p>
                        {!notification.isRead && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                      </div>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">{notification.message}</p>
                      <p className="mt-1 text-[10.5px] text-ink-400">{relativeTime(notification.createdAt)}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(notification.id)}
                      className="rounded-lg p-1.5 text-ink-300 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Delete notification"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {data.pagination.pages > 1 && (
              <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 dark:border-white/5">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-[11.5px] text-ink-400">Page {data.pagination.page} of {data.pagination.pages}</span>
                <Button variant="secondary" size="sm" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
