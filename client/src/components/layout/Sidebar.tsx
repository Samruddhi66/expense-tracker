import { NavLink } from 'react-router-dom';
import {
  ArrowLeftRight, BarChart3, Bell, LayoutDashboard, Repeat, Settings, ShieldCheck,
  Sparkles, Target, UserRound, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { cn } from '../../lib/utils';

const mainNav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: Wallet },
  { to: '/goals', label: 'Savings Goals', icon: Target },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles, badge: 'AI' },
  { to: '/notifications', label: 'Notifications', icon: Bell },
];

const accountNav = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const unread = useUnreadCount();

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn('nav-item', isActive && 'nav-item-active');

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col border-r border-ink-100 bg-white/95 px-4 py-5 backdrop-blur transition-transform duration-300 dark:border-white/5 dark:bg-[#120c22]/95 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="mb-7 flex items-center justify-between px-2">
          <NavLink to="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-fuchsia-500 text-white shadow-glow">
              <Wallet className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-display text-[15px] font-extrabold tracking-tight text-ink-900 dark:text-white">
                Expense Tracker
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-500 dark:text-brand-300">
                Track · Spend · Save
              </span>
            </span>
          </NavLink>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-white/5 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400 dark:text-ink-500">Workspace</p>
          {mainNav.map(({ to, label, icon: Icon, badge }) => (
            <NavLink key={to} to={to} className={navLink}>
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="rounded-md bg-gradient-to-r from-brand-500 to-fuchsia-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                  {badge}
                </span>
              )}
              {to === '/notifications' && unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>
          ))}

          <p className="mb-2 mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400 dark:text-ink-500">Account</p>
          {accountNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLink}>
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={navLink}>
              <ShieldCheck className="h-[18px] w-[18px]" />
              <span className="flex-1">Admin</span>
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                Admin
              </span>
            </NavLink>
          )}
        </nav>

        <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-fuchsia-700 p-4 text-white shadow-float">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-200" />
            <p className="text-[12px] font-bold">Smart money habit</p>
          </div>
          <p className="text-[11px] leading-relaxed text-brand-100/90">
            Review your top spending category every week. Small adjustments compound into big savings.
          </p>
        </div>
      </aside>
    </>
  );
}
