import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';
import { GoogleButton } from '../components/auth/GoogleButton';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [notVerified, setNotVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendUrl, setResendUrl] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.email.trim()) nextErrors.email = 'Enter your email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Enter a valid email address';
    if (!form.password) nextErrors.password = 'Enter your password';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    setMessage('');
    setNotVerified(false);
    try {
      await login(form.email.trim(), form.password);
      navigate('/dashboard');
      toast.success('Welcome back!');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'email_not_verified') setNotVerified(true);
        setMessage(error.message);
        if (error.details) setErrors(error.details);
      } else {
        setMessage('Unable to sign in right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const data = await api<{ message: string; devVerificationUrl?: string }>('/auth/resend-verification', {
        method: 'POST',
        body: { email: form.email.trim() },
      });
      setResendUrl(data.devVerificationUrl ?? '');
      toast.success(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not resend the email');
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your balances, budgets and insights."
      footer={
        <>
          New to Expense Tracker?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
            Create a free account
          </Link>
        </>
      }
    >
      <GoogleButton mode="continue" />

      <form onSubmit={submit} className="space-y-4" noValidate>
        {message && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>{message}</p>
              {notVerified && (
                <button type="button" onClick={resend} className="mt-1.5 font-bold underline underline-offset-2">
                  Resend verification email
                </button>
              )}
              {resendUrl && (
                <a href={resendUrl} className="mt-1.5 block font-semibold underline underline-offset-2">
                  Open verification link (development)
                </a>
              )}
            </div>
          </div>
        )}

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<Mail className="h-4 w-4" />}
          value={form.email}
          error={errors.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Enter your password"
          icon={<Lock className="h-4 w-4" />}
          value={form.password}
          error={errors.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          required
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-lg p-2 text-ink-400 transition hover:text-ink-700 dark:hover:text-white"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-[12.5px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
