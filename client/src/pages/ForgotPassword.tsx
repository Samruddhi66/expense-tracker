import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { AuthShell } from '../components/auth/AuthShell';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ message: string; devResetUrl?: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await api<{ message: string; devResetUrl?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setSent(data);
      toast.success('Request received');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={sent ? 'Check your email' : 'Reset your password'}
      subtitle={
        sent
          ? sent.message
          : 'Enter the email linked to your account and we will send a secure reset link.'
      }
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 dark:text-brand-300">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 p-5 dark:border-brand-500/20 dark:bg-brand-500/10">
            <MailCheck className="mt-0.5 h-5 w-5 text-brand-600 dark:text-brand-300" />
            <div className="text-[13px] leading-relaxed text-brand-900 dark:text-brand-100">
              <p className="font-semibold">Reset link sent</p>
              <p className="mt-1 text-brand-800/80 dark:text-brand-200/80">
                The link expires in 60 minutes. If you do not see the email, check your spam folder.
              </p>
              {sent.devResetUrl && (
                <a
                  href={sent.devResetUrl}
                  className="mt-3 inline-flex rounded-xl bg-brand-700 px-3.5 py-2 text-[12px] font-bold text-white hover:bg-brand-800"
                >
                  Open reset link (development)
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
            value={email}
            error={error}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
