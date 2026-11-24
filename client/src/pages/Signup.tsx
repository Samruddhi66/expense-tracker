import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';
import { GoogleButton } from '../components/auth/GoogleButton';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;
  return score;
}

export default function Signup() {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ email: string; devLink?: string } | null>(null);

  const score = strength(form.password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = 'Enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address';
    if (form.password.length < 8) next.password = 'Use at least 8 characters';
    else if (!/[A-Z]/.test(form.password)) next.password = 'Add an uppercase letter';
    else if (!/[0-9]/.test(form.password)) next.password = 'Add a number';
    if (form.password !== form.confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    setMessage('');
    try {
      const data = await api<{ message: string; email: string; devVerificationUrl?: string }>('/auth/signup', {
        method: 'POST',
        body: { name: form.name.trim(), email: form.email.trim(), password: form.password },
      });
      setDone({ email: data.email, devLink: data.devVerificationUrl });
      toast.success('Account created');
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        if (error.details) setErrors(error.details);
      } else {
        setMessage('Unable to create your account right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`We sent a verification link to ${done.email}. Verify your email, then sign in.`}
        footer={
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-5 dark:border-brand-500/20 dark:bg-brand-500/10">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-600 dark:text-brand-300" />
            <div className="text-[13px] leading-relaxed text-brand-900 dark:text-brand-100">
              <p className="font-semibold">Account created successfully.</p>
              <p className="mt-1 text-brand-800/80 dark:text-brand-200/80">
                Email delivery is not configured on this server yet, so use the verification link below.
              </p>
              {done.devLink && (
                <a
                  href={done.devLink}
                  className="mt-3 inline-flex rounded-xl bg-brand-700 px-3.5 py-2 text-[12px] font-bold text-white hover:bg-brand-800"
                >
                  Verify my email now
                </a>
              )}
            </div>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start tracking income, expenses and savings in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton mode="signup" />

      <form onSubmit={submit} className="space-y-4" noValidate>
        {message && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[12.5px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
          </div>
        )}

        <Input
          label="Full name"
          placeholder="Aarav Sharma"
          autoComplete="name"
          icon={<UserRound className="h-4 w-4" />}
          value={form.name}
          error={errors.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          required
        />
        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          icon={<Mail className="h-4 w-4" />}
          value={form.email}
          error={errors.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
        <div>
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
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
                className="rounded-lg p-2 text-ink-400 transition hover:text-ink-700 dark:hover:text-white"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          {form.password && (
            <div className="mt-2 flex gap-1.5">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={`h-1 flex-1 rounded-full transition ${
                    index < score
                      ? score <= 1
                        ? 'bg-rose-400'
                        : score === 2
                          ? 'bg-amber-400'
                          : score === 3
                            ? 'bg-lime-500'
                            : 'bg-emerald-500'
                      : 'bg-ink-100 dark:bg-white/10'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          value={form.confirm}
          error={errors.confirm}
          onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          required
        />

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
        <p className="text-center text-[11px] leading-relaxed text-ink-400">
          By creating an account you agree to keep your financial data accurate. We never share your data.
        </p>
      </form>
    </AuthShell>
  );
}
