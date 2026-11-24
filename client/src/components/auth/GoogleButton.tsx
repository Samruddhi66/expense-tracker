import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleButton({ mode = 'continue' }: { mode?: 'continue' | 'signup' }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const { loginWithGoogle } = useAuth();
  const toast = useToast();

  useEffect(() => {
    api<{ googleClientId: string | null }>('/config')
      .then((data) => setClientId(data.googleClientId))
      .catch(() => setClientId(null));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const initialize = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            await loginWithGoogle(response.credential);
            toast.success('Signed in with Google');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Google sign-in failed');
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        width: 380,
        text: mode === 'signup' ? 'signup_with' : 'continue_with',
        logo_alignment: 'left',
      });
      setReady(true);
    };

    if (window.google) {
      initialize();
      return;
    }
    const existing = document.getElementById('google-identity-script');
    if (existing) {
      existing.addEventListener('load', initialize);
      return () => existing.removeEventListener('load', initialize);
    }
    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', initialize);
    document.head.appendChild(script);
    return () => script.removeEventListener('load', initialize);
  }, [clientId, loginWithGoogle, mode, toast]);

  if (!clientId) return null;

  return (
    <div className="mb-5">
      <div className="flex justify-center">
        <div ref={buttonRef} className="min-h-[40px] w-full overflow-hidden rounded-full" />
      </div>
      {!ready && <p className="mt-2 text-center text-[11px] text-ink-400">Preparing Google sign-in…</p>}
      <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        <span className="h-px flex-1 bg-ink-100 dark:bg-white/10" />
        or use email
        <span className="h-px flex-1 bg-ink-100 dark:bg-white/10" />
      </div>
    </div>
  );
}
