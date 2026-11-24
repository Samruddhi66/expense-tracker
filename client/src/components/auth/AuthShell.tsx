import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, ShieldCheck, Sparkles, Wallet } from 'lucide-react';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#faf9fe] dark:bg-[#0d0819]">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#2a0b57] via-[#4c1d95] to-[#7c2fe0] p-10 text-white lg:flex xl:w-[48%] xl:p-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '26px 26px' }} />

        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <Wallet className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-display text-lg font-extrabold">Expense Tracker</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-200">Track · Spend · Save</span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-brand-200" /> Your money, beautifully understood
          </span>
          <h2 className="mt-5 font-display text-[38px] font-extrabold leading-[1.1] tracking-tight">
            Track smart.<br />Spend wise.<br />Save more.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-brand-100/85">
            One calm place for your income, expenses, budgets and savings goals — with analytics that actually tell you what to do next.
          </p>

          <div className="mt-9 space-y-3">
            {[
              { icon: BarChart3, title: 'Live financial picture', text: 'Income, expenses and savings updated from every transaction.' },
              { icon: Sparkles, title: 'AI spending insights', text: 'Find your biggest categories and next best saving move.' },
              { icon: ShieldCheck, title: 'Private by design', text: 'Your data is isolated to your account and encrypted in transit.' },
            ].map(({ icon: Icon, title: itemTitle, text }) => (
              <div key={itemTitle} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12.5px] font-bold">{itemTitle}</p>
                  <p className="text-[11.5px] leading-relaxed text-brand-100/75">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">This month</p>
            <ArrowUpRight className="h-4 w-4 text-brand-200" />
          </div>
          <div className="mt-2 flex items-end gap-6">
            <div>
              <p className="text-[10px] text-brand-200/80">Saved</p>
              <p className="font-display text-xl font-bold">₹18,240</p>
            </div>
            <div className="flex h-10 flex-1 items-end gap-1.5">
              {[35, 55, 40, 70, 52, 88, 64].map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-md bg-gradient-to-t from-brand-300/40 to-white/80"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex w-full flex-1 items-center justify-center px-5 py-10 sm:px-10 lg:w-[54%] xl:w-[52%]">
        <div className="w-full max-w-[420px] animate-fade-up">
          <Link to="/" className="mb-8 inline-flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
              <Wallet className="h-5 w-5" />
            </span>
            <span className="font-display text-[15px] font-extrabold text-ink-900 dark:text-white">Expense Tracker</span>
          </Link>
          <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink-900 dark:text-white">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">{subtitle}</p>
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-center text-[13px] text-ink-500 dark:text-ink-400">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
