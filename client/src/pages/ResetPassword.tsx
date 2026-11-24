import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api, ApiError } from '../lib/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.password.length < 8) next.password = 'Use at least 8 characters';
    else if (!/[A-Z]/.test(form.password)) next.password = 'Add an uppercase letter';
    else if (!/[0-9]/.test(form.password)) next.password = 'Add a number';
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    setMessage('');
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        if (error.details) setErrors(error.details);
      } else {
        setMessage('Could not reset your password. Please request a new link.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="This password reset link is missing its token.">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" /> Link not valid
          </p>
          <Link to="/forgot-password" className="mt-2 inline-block font-bold underline underline-offset-2">
            Request a new reset link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="Your password has been changed and all other sessions were signed out."
        footer={
          <Link to="/login" className="font-semibold text-brand-700 dark:text-brand-300">
            Continue to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-[13px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          You can now sign in with your new password.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Make it strong: 8+ characters with uppercase letters and numbers.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {message && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
          </div>
        )}
        <Input
          label="New password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          value={form.password}
          error={errors.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          required
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-lg p-2 text-ink-400 hover:text-ink-700 dark:hover:text-white"
              aria-label="Toggle password visibility"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Input
          label="Confirm new password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          value={form.confirm}
          error={errors.confirm}
          onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          required
        />
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
