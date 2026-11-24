import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken } from '../lib/api';
import type { User } from '../lib/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: (credential: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type SessionResponse = { accessToken: string; user: User };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = (await res.json()) as SessionResponse;
          if (!cancelled) {
            setAccessToken(data.accessToken);
            setUser(data.user);
          }
        }
      } catch {
        // offline or no session – show the login screen
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<SessionResponse>).detail;
      if (detail?.user) setUser(detail.user);
    };
    window.addEventListener('auth:refreshed', onRefreshed);
    window.addEventListener('auth:expired', () => setUser(null));
    return () => {
      window.removeEventListener('auth:refreshed', onRefreshed);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<SessionResponse>('/auth/login', { method: 'POST', body: { email, password } });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const data = await api<SessionResponse>('/auth/google', { method: 'POST', body: { credential } });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors on sign out
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api<{ user: User }>('/auth/me');
    setUser(data.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginWithGoogle, logout, refreshUser, setUser }),
    [user, loading, login, loginWithGoogle, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useCurrency() {
  const { user } = useAuth();
  const currency = user?.settings?.currency ?? 'INR';
  const locale = user?.settings?.locale ?? 'en-IN';
  return { currency, locale };
}

export { refreshSession };
