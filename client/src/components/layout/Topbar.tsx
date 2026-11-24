import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useUnreadCount } from '../../hooks/useUnreadCount';
import { Avatar } from '../ui/Misc';
import { cn } from '../../lib/utils';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/budgets': 'Budgets',
  '/goals': 'Savings Goals',
  '/recurring': 'Recurring Transactions',
  '/analytics': 'Analytics',
  '/assistant': 'AI Assistant',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/admin': 'Admin Dashboard',
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const unread = useUnreadCount();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const title = titles[location.pathname] ?? 'Expense Tracker';

  return (
    <header className="sticky top-0 z-30 border-b border-ink-100/70 bg-[#f6f5fb]/85 backdrop-blur-xl dark:border-white/5 dark:bg-[#0d0819]/85">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="rounded-xl border border-ink-200 p-2 text-ink-500 transition hover:bg-white dark:border-ink-700 dark:text-ink-300 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-bold text-ink-900 dark:text-white">{title}</p>
          <p className="hidden text-[11px] text-ink-400 sm:block">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void toggle()}
          className="rounded-xl border border-ink-200 bg-white p-2.5 text-ink-500 transition hover:border-brand-200 hover:text-brand-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:text-brand-200"
          aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={resolved === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {resolved === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        <Link
          to="/notifications"
          className="relative rounded-xl border border-ink-200 bg-white p-2.5 text-ink-500 transition hover:border-brand-200 hover:text-brand-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:text-brand-200"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-[#f6f5fb] dark:ring-[#0d0819]">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-transparent p-1 pr-2 transition hover:border-ink-200 hover:bg-white dark:hover:border-ink-700 dark:hover:bg-ink-900"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <Avatar name={user?.name ?? 'User'} src={user?.avatarUrl} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-[13px] font-bold text-ink-900 dark:text-white">{user?.name}</span>
              <span className="block max-w-[140px] truncate text-[10px] text-ink-400">{user?.email}</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-ink-400 transition', menuOpen && 'rotate-180')} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] w-60 animate-fade-up overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-float dark:border-white/10 dark:bg-ink-900"
            >
              <div className="border-b border-ink-100 px-4 py-3 dark:border-white/5">
                <p className="truncate text-sm font-bold text-ink-900 dark:text-white">{user?.name}</p>
                <p className="truncate text-[11px] text-ink-400">{user?.email}</p>
                {user?.role === 'ADMIN' && (
                  <span className="mt-2 inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                    Administrator
                  </span>
                )}
              </div>
              <div className="p-1.5">
                <Link
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-700 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-white/5"
                  role="menuitem"
                >
                  <UserRound className="h-4 w-4 text-ink-400" /> Profile
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-700 transition hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-white/5"
                  role="menuitem"
                >
                  <Settings className="h-4 w-4 text-ink-400" /> Settings
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await logout();
                    navigate('/login');
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
