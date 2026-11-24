import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { ThemePreference } from '../lib/types';

type Resolved = 'light' | 'dark';
type ThemeContextValue = {
  preference: ThemePreference;
  resolved: Resolved;
  setPreference: (preference: ThemePreference, persist?: boolean) => Promise<void>;
  toggle: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'et-theme';

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function resolve(preference: ThemePreference): Resolved {
  if (preference === 'SYSTEM') return systemPrefersDark() ? 'dark' : 'light';
  return preference === 'DARK' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'LIGHT' || stored === 'DARK' || stored === 'SYSTEM' ? stored : 'SYSTEM';
  });
  const [resolved, setResolved] = useState<Resolved>(() => resolve(preference));

  useEffect(() => {
    const next = resolve(preference);
    setResolved(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  useEffect(() => {
    if (preference !== 'SYSTEM') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      const next = resolve('SYSTEM');
      setResolved(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [preference]);

  const setPreference = useCallback(async (next: ThemePreference, persist = true) => {
    setPreferenceState(next);
    if (persist && localStorage.getItem('et-authenticated') === 'true') {
      try {
        await api('/users/me/settings', { method: 'PATCH', body: { theme: next } });
      } catch {
        // preference still applies locally
      }
    }
  }, []);

  const toggle = useCallback(async () => {
    await setPreference(resolved === 'dark' ? 'LIGHT' : 'DARK');
  }, [resolved, setPreference]);

  const value = useMemo(() => ({ preference, resolved, setPreference, toggle }), [preference, resolved, setPreference, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
