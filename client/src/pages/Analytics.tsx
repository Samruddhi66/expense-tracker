import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight, ArrowUpRight, CalendarRange, Download, FileText, PiggyBank, ReceiptText,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useCurrency } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, Card, EmptyState, LoadingBlock, PageHeader, Progress } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CategoryIcon } from '../components/CategoryIcon';
import { SpendingTrendChart } from '../components/charts/Charts';
import type { Analytics as AnalyticsData } from '../lib/types';
import { formatCurrency, formatDate, paymentLabel, todayISO } from '../lib/format';
import { cn } from '../lib/utils';

const periods = [
  { key: 'daily', label: 'Daily', hint: 'Last 30 days' },
  { key: 'weekly', label: 'Weekly', hint: 'Last 12 weeks' },
  { key: 'monthly', label: 'Monthly', hint: 'Last 12 months' },
  { key: 'yearly', label: 'Yearly', hint: 'Last 5 years' },
] as const;

export default function Analytics() {
  const { currency, locale } = useCurrency();
  const toast = useToast();
  const [period, setPeriod] = useState<(typeof periods)[number]['key']>('monthly');
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const money = (value: number) => formatCurrency(value, currency, locale);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<AnalyticsData>(`/analytics?period=${period}&date=${date}`);
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, [period, date, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportReport = async (format: 'csv' | 'pdf') => {
    setExporting(format);
    try {
      await downloadFile(
        `/analytics/export?period=${period}&date=${date}&format=${format}`,
        `expense-report-${period}-${date}.${format}`
      );
      toast.success(`${format.toUpperCase()} report downloaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const comparison = (value: number, inverse = false) => {
    const good = inverse ? value <= 0 : value >= 0;
    return (
      <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
        {value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(value)}%
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Daily, weekly, monthly and yearly reports — then export them as PDF or CSV."
        actions={
          <>
            <Button variant="secondary" onClick={() => void exportReport('csv')} loading={exporting === 'csv'}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="secondary" onClick={() => void exportReport('pdf')} loading={exporting === 'pdf'}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <Card className="mb-5 flex flex-col gap-3 p-3.5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {periods.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key)}
              className={cn(
                'rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition',
                period === item.key
                  ? 'bg-brand-700 text-white shadow-sm dark:bg-brand-600'
                  : 'text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-white/5'
              )}
              aria-pressed={period === item.key}
            >
              {item.label}
              <span className={cn('ml-1.5 hidden text-[10px] font-medium sm:inline', period === item.key ? 'text-brand-100' : 'text-ink-400')}>
                {item.hint}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Input
            label="Report until"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(event) => setDate(event.target.value)}
            className="min-w-[170px]"
          />
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Building your report…" />
      ) : data ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-500 dark:text-ink-400">
            <CalendarRange className="h-3.5 w-3.5" />
            <span className="font-semibold text-ink-700 dark:text-ink-200">{data.range.label}</span>
            <span>· {data.summary.transactions} transactions</span>
            <span>· compared with {data.range.previousStart} → {data.range.previousEnd}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Income</p>
              <p className="mt-1 font-display text-xl font-extrabold text-ink-900 dark:text-white">{money(data.summary.income)}</p>
              {comparison(data.comparison.incomeChange)}
            </Card>
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Expenses</p>
              <p className="mt-1 font-display text-xl font-extrabold text-ink-900 dark:text-white">{money(data.summary.expense)}</p>
              {comparison(data.comparison.expenseChange, true)}
            </Card>
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Net saved</p>
              <p className={cn('mt-1 font-display text-xl font-extrabold', data.summary.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                {money(data.summary.net)}
              </p>
              {comparison(data.comparison.netChange)}
            </Card>
            <Card className="p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Savings rate</p>
              <p className="mt-1 font-display text-xl font-extrabold text-ink-900 dark:text-white">{data.summary.savingsRate}%</p>
              <p className="text-[11px] text-ink-400">Avg spend {money(data.summary.avgPerDay)}/day</p>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Income vs expenses</h2>
                <p className="text-[11.5px] text-ink-400">Trend for the selected report window</p>
              </div>
              <Badge tone="brand">{period}</Badge>
            </div>
            {data.summary.transactions === 0 ? (
              <EmptyState
                icon={<ReceiptText className="h-6 w-6" />}
                title="No data in this window"
                description="Add transactions or choose a different date range to see your trend."
                className="py-10"
              />
            ) : (
              <SpendingTrendChart data={data.series} currency={currency} locale={locale} height={300} />
            )}
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Category breakdown</h2>
                  <p className="text-[11.5px] text-ink-400">{data.summary.topCategory ? `Top: ${data.summary.topCategory}` : 'No expenses in this window'}</p>
                </div>
              </div>
              {data.categoryBreakdown.length ? (
                <div className="space-y-3.5">
                  {data.categoryBreakdown.slice(0, 8).map((category) => (
                    <div key={category.name}>
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-md"
                          style={{ backgroundColor: `${category.color}1f`, color: category.color }}
                        >
                          <CategoryIcon name={category.icon} className="h-3 w-3" />
                        </span>
                        <span className="flex-1 truncate text-[12.5px] font-semibold text-ink-700 dark:text-ink-200">{category.name}</span>
                        <span className="text-[10.5px] text-ink-400">{category.count} txns</span>
                        <span className="w-[80px] text-right text-[12px] font-bold text-ink-900 dark:text-white">{money(category.value)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-white/[0.08]">
                        <div className="h-full rounded-full" style={{ width: `${category.percentage}%`, backgroundColor: category.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-[12px] text-ink-400">No expense categories in this period.</p>
              )}
            </Card>

            <div className="space-y-5">
              <Card className="p-5">
                <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Payment methods</h2>
                <p className="mb-4 text-[11.5px] text-ink-400">How money moved in this window</p>
                <div className="grid grid-cols-2 gap-3">
                  {data.paymentMethods.map((method) => (
                    <div key={method.method} className="rounded-xl border border-ink-100 p-3 dark:border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{paymentLabel(method.method)}</span>
                        <span className="text-[10px] text-ink-400">{method.count}</span>
                      </div>
                      <p className="mt-1 text-[15px] font-extrabold text-ink-900 dark:text-white">{money(method.total)}</p>
                      <Progress value={method.percentage} className="mt-2 h-1.5" />
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Spending by weekday</h2>
                <div className="mt-4 flex h-[120px] items-end gap-2">
                  {data.weekdaySpend.map((day) => {
                    const max = Math.max(...data.weekdaySpend.map((d) => d.value), 1);
                    return (
                      <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
                        <div className="flex w-full flex-1 items-end">
                          <div
                            className={cn('w-full rounded-t-md transition-all', day.value === max ? 'bg-brand-600' : 'bg-brand-200 dark:bg-brand-500/30')}
                            style={{ height: `${Math.max(4, (day.value / max) * 100)}%` }}
                            title={money(day.value)}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-ink-400">{day.label}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-display text-[15px] font-bold text-ink-900 dark:text-white">Largest expenses</h2>
                <p className="text-[11.5px] text-ink-400">Biggest single transactions in this window</p>
              </div>
              <PiggyBank className="h-5 w-5 text-ink-300" />
            </div>
            {data.topExpenses.length ? (
              <div className="divide-y divide-ink-50 dark:divide-white/[0.04]">
                {data.topExpenses.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 py-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${tx.category?.color ?? '#7C3AED'}18`, color: tx.category?.color ?? '#7C3AED' }}
                    >
                      <CategoryIcon name={tx.category?.icon} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{tx.description}</p>
                      <p className="text-[10.5px] text-ink-400">{tx.category?.name ?? 'Uncategorised'} · {formatDate(tx.date)}</p>
                    </div>
                    <span className="text-[12.5px] font-bold text-ink-900 dark:text-white">{money(tx.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[12px] text-ink-400">No expenses in this period.</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
