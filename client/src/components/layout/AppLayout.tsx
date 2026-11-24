import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { setPreference } = useTheme();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user?.settings?.theme) {
      void setPreference(user.settings.theme, false);
    }
    if (user) localStorage.setItem('et-authenticated', 'true');
  }, [user, setPreference]);

  return (
    <div className="min-h-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-[268px]">
        <Topbar onMenu={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-14 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          <Outlet />
        </main>
        <footer className="border-t border-ink-100/70 px-4 py-5 text-center text-[11px] text-ink-400 dark:border-white/5 sm:px-8">
          Expense Tracker · Track Smart. Spend Wise. Save More.
        </footer>
      </div>
    </div>
  );
}
