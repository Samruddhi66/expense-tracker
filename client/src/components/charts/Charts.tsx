import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import { formatCurrency } from '../../lib/format';

type PayloadItem = { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> };

function ChartTooltip({
  active,
  payload,
  label,
  currency = 'INR',
  locale = 'en-IN',
  hideLabel,
}: {
  active?: boolean;
  payload?: PayloadItem[];
  label?: string | number;
  currency?: string;
  locale?: string;
  hideLabel?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-ink-100 bg-white/95 px-3 py-2 shadow-float backdrop-blur dark:border-white/10 dark:bg-ink-900/95">
      {!hideLabel && label !== undefined && (
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-400">{label}</p>
      )}
      {payload.map((item, index) => (
        <p key={index} className="flex items-center gap-2 text-[12px] font-semibold text-ink-800 dark:text-ink-100">
          <span className="h-2 w-2 rounded-full" style={{ background: item.color ?? '#7C3AED' }} />
          <span className="capitalize text-ink-500 dark:text-ink-400">{item.name}</span>
          {formatCurrency(Number(item.value ?? 0), currency, locale)}
        </p>
      ))}
    </div>
  );
}

const axisProps = (dark: boolean) => ({
  tick: { fill: dark ? '#8b83a3' : '#7e6d9e', fontSize: 11, fontWeight: 500 },
  axisLine: false,
  tickLine: false,
});

export function WeeklyExpenseChart({
  data,
  currency,
  locale,
}: {
  data: { label: string; value: number; date?: string }[];
  currency: string;
  locale: string;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="weeklyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b4ef2" stopOpacity={0.34} />
            <stop offset="100%" stopColor="#8b4ef2" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke={dark ? 'rgba(255,255,255,0.07)' : '#ece8f6'} />
        <XAxis dataKey="label" {...axisProps(dark)} dy={6} />
        <YAxis {...axisProps(dark)} width={58} tickFormatter={(value: number) => formatCurrency(value, currency, locale, true)} />
        <Tooltip content={<ChartTooltip currency={currency} locale={locale} />} cursor={{ stroke: '#8b4ef2', strokeWidth: 1, strokeDasharray: '4 4' }} />
        <Area type="monotone" dataKey="value" name="Spent" stroke="#7c2fe0" strokeWidth={2.6} fill="url(#weeklyFill)" activeDot={{ r: 5, strokeWidth: 3, stroke: dark ? '#120c22' : '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseChart({
  data,
  currency,
  locale,
  height = 260,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  locale: string;
  height?: number;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 6, left: -18, bottom: 0 }} barGap={5}>
        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke={dark ? 'rgba(255,255,255,0.07)' : '#ece8f6'} />
        <XAxis dataKey="label" {...axisProps(dark)} dy={6} />
        <YAxis {...axisProps(dark)} width={58} tickFormatter={(value: number) => formatCurrency(value, currency, locale, true)} />
        <Tooltip content={<ChartTooltip currency={currency} locale={locale} />} cursor={{ fill: dark ? 'rgba(255,255,255,0.03)' : 'rgba(124,47,224,0.04)' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: dark ? '#c3b8d8' : '#655584', paddingTop: 8 }} />
        <Bar dataKey="income" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={26} />
        <Bar dataKey="expense" name="Expenses" fill="#8b4ef2" radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({
  data,
  currency,
  locale,
  height = 240,
}: {
  data: { name: string; value: number; color: string }[];
  currency: string;
  locale: string;
  height?: number;
}) {
  const { resolved } = useTheme();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2.5}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip currency={currency} locale={locale} hideLabel />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Total spent</p>
        <p className="mt-0.5 font-display text-lg font-extrabold text-ink-900 dark:text-white">
          {formatCurrency(total, currency, locale, true)}
        </p>
      </div>
      <span className="sr-only">
        {resolved === 'dark' ? 'dark chart' : 'light chart'}
      </span>
    </div>
  );
}

export function SpendingTrendChart({
  data,
  currency,
  locale,
  height = 280,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  locale: string;
  height?: number;
}) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke={dark ? 'rgba(255,255,255,0.07)' : '#ece8f6'} />
        <XAxis dataKey="label" {...axisProps(dark)} dy={6} />
        <YAxis {...axisProps(dark)} width={58} tickFormatter={(value: number) => formatCurrency(value, currency, locale, true)} />
        <Tooltip content={<ChartTooltip currency={currency} locale={locale} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10, color: dark ? '#c3b8d8' : '#655584' }} />
        <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="expense" name="Expenses" stroke="#8b4ef2" strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
