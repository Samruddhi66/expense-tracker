import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'success' | 'error' | 'idle'>(token ? 'loading' : 'idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [devLink, setDevLink] = useState('');
  const [resending, setResending] = useState(false);
  const toast = useToast();
  const verified = useRef(false);

  useEffect(() => {
    if (!token || verified.current) return;
    verified.current = true;
    api<{ message: string }>('/auth/verify-email', { method: 'POST', body: { token } })
      .then((data) => {
        setState('success');
        setMessage(data.message);
        toast.success('Email verified');
      })
      .catch((error: Error) => {
        setState('error');
        setMessage(error.message);
      });
  }, [token, toast]);

  const resend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Enter a valid email address');
      return;
    }
    setResending(true);
    try {
      const data = await api<{ message: string; devVerificationUrl?: string }>('/auth/resend-verification', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setMessage(data.message);
      setDevLink(data.devVerificationUrl ?? '');
      toast.success('Verification email sent');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend the email');
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title={state === 'success' ? 'Email verified' : 'Verify your email'}
      subtitle={
        state === 'success'
          ? 'Your account is active. Sign in to start tracking your money.'
          : state === 'loading'
            ? 'Confirming your email address…'
            : 'Confirm your email to activate your account.'
      }
      footer={
        <Link to="/login" className="font-semibold text-brand-700 dark:text-brand-300">
          Go to sign in
        </Link>
      }
    >
      {state === 'loading' && (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-5 text-[13px] text-ink-600 dark:border-white/10 dark:bg-ink-900 dark:text-ink-300">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> Verifying your link…
        </div>
      )}

      {state === 'success' && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-[13px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Verification complete</p>
            <p className="mt-1">{message}</p>
          </div>
        </div>
      )}

      {(state === 'error' || state === 'idle') && (
        <div className="space-y-4">
          {state === 'error' && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">We could not verify that link</p>
                <p className="mt-1">{message}</p>
              </div>
            </div>
          )}
          <form onSubmit={resend} className="space-y-3">
            <p className="text-[13px] text-ink-600 dark:text-ink-300">
              Enter your email and we will send a fresh verification link.
            </p>
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              icon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Button type="submit" className="w-full" loading={resending}>
              Send verification link
            </Button>
            {devLink && (
              <a href={devLink} className="block text-center text-[12px] font-semibold text-brand-700 underline dark:text-brand-300">
                Open verification link (development)
              </a>
            )}
          </form>
        </div>
      )}
    </AuthShell>
  );
}
