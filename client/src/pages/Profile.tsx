import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Download, KeyRound, Mail, ShieldCheck, Trash2, UserRound,
} from 'lucide-react';
import { api, ApiError, downloadFile } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Badge, Card, PageHeader } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { formatDate } from '../lib/format';

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  if (!user) return null;

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Enter your name');
      return;
    }
    setSavingProfile(true);
    try {
      const data = await api<{ user: typeof user }>('/users/me', {
        method: 'PATCH',
        body: { name: name.trim(), avatarUrl: avatarUrl.trim() || null },
      });
      setUser(data.user);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!passwords.currentPassword) next.currentPassword = 'Enter your current password';
    if (passwords.newPassword.length < 8) next.newPassword = 'Use at least 8 characters';
    else if (!/[A-Z]/.test(passwords.newPassword)) next.newPassword = 'Add an uppercase letter';
    else if (!/[0-9]/.test(passwords.newPassword)) next.newPassword = 'Add a number';
    if (passwords.newPassword !== passwords.confirm) next.confirm = 'Passwords do not match';
    setPasswordErrors(next);
    if (Object.keys(next).length) return;

    setSavingPassword(true);
    try {
      await api('/users/me/change-password', {
        method: 'POST',
        body: { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
      });
      toast.success('Password updated. Other devices were signed out.');
      setPasswords({ currentPassword: '', newPassword: '', confirm: '' });
      await logout();
      navigate('/login');
    } catch (error) {
      if (error instanceof ApiError) {
        setPasswordErrors(error.details ?? {});
        toast.error(error.message);
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      await downloadFile('/users/me/export', 'expense-tracker-data.json');
      toast.success('Data exported');
    } catch {
      toast.error('Could not export data');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeleting(true);
    try {
      await api('/users/me', {
        method: 'DELETE',
        body: { password: deletePassword || undefined, confirm: 'DELETE' },
      });
      setUser(null);
      toast.success('Your account has been deleted');
      navigate('/login');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete account');
    } finally {
      setDeleting(false);
    }
  };

  const revokeSessions = async () => {
    setRevoking(true);
    try {
      await api('/auth/logout-all', { method: 'POST' });
      toast.success('Signed out everywhere. Please sign in again.');
      await logout();
      navigate('/login');
    } catch {
      toast.error('Could not sign out all devices');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile" subtitle="Your identity, password and personal data." />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} src={user.avatarUrl} size="xl" />
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-extrabold text-ink-900 dark:text-white">{user.name}</h2>
              <p className="truncate text-[12.5px] text-ink-500 dark:text-ink-400">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                  {user.emailVerified ? 'Email verified' : 'Email unverified'}
                </Badge>
                {user.role === 'ADMIN' && <Badge tone="brand">Administrator</Badge>}
              </div>
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-t border-ink-100 pt-4 text-[12.5px] dark:border-white/5">
            <div className="flex items-center justify-between">
              <dt className="text-ink-400">Member since</dt>
              <dd className="font-semibold text-ink-800 dark:text-ink-100">{formatDate(user.createdAt, 'long')}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-400">Last sign-in</dt>
              <dd className="font-semibold text-ink-800 dark:text-ink-100">{user.lastLoginAt ? formatDate(user.lastLoginAt, 'long') : '—'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-400">Currency</dt>
              <dd className="font-semibold text-ink-800 dark:text-ink-100">{user.settings?.currency ?? 'INR'}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-400">Sign-in method</dt>
              <dd className="font-semibold text-ink-800 dark:text-ink-100">{user.hasPassword ? 'Email & password' : 'Google'}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl bg-brand-50/70 p-3.5 text-[11.5px] leading-relaxed text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">
            <ShieldCheck className="mb-1 h-4 w-4" />
            Your transactions are private to your account. Every API query is scoped to your user id.
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[14px] font-bold text-ink-900 dark:text-white">
              <UserRound className="h-4 w-4 text-brand-600" /> Personal details
            </h2>
            <form onSubmit={saveProfile} className="space-y-3.5">
              <Input label="Full name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
              <Input
                label="Email"
                value={user.email}
                disabled
                readOnly
                icon={<Mail className="h-4 w-4" />}
                hint="Email changes are disabled. Contact support if you need to update it."
              />
              <Input
                label="Avatar image URL (optional)"
                value={avatarUrl}
                placeholder="https://…"
                onChange={(event) => setAvatarUrl(event.target.value)}
              />
              <Button type="submit" loading={savingProfile}>Save profile</Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-[14px] font-bold text-ink-900 dark:text-white">
              <KeyRound className="h-4 w-4 text-brand-600" /> Change password
            </h2>
            {user.hasPassword ? (
              <form onSubmit={changePassword} className="space-y-3.5" noValidate>
                <Input
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  error={passwordErrors.currentPassword}
                  onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.newPassword}
                    error={passwordErrors.newPassword}
                    onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                    required
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.confirm}
                    error={passwordErrors.confirm}
                    onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
                    required
                  />
                </div>
                <Button type="submit" loading={savingPassword}>Update password</Button>
              </form>
            ) : (
              <p className="text-[12.5px] text-ink-500 dark:text-ink-400">
                This account signs in with Google, so there is no password to change.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-[14px] font-bold text-ink-900 dark:text-white">
              <Download className="h-4 w-4 text-brand-600" /> Personal data
            </h2>
            <p className="mb-3 text-[11.5px] leading-relaxed text-ink-400">
              Download every transaction, budget, goal, recurring schedule and insight stored for your account.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void exportData()} loading={exporting}>
                <Download className="h-4 w-4" /> Export JSON
              </Button>
              <Button variant="ghost" onClick={() => void revokeSessions()} loading={revoking}>
                Sign out all devices
              </Button>
            </div>
          </Card>

          <Card className="border-rose-100 p-5 dark:border-rose-500/20">
            <h2 className="mb-1 flex items-center gap-2 font-display text-[14px] font-bold text-rose-700 dark:text-rose-300">
              <Trash2 className="h-4 w-4" /> Danger zone
            </h2>
            <p className="mb-3 text-[11.5px] leading-relaxed text-ink-500 dark:text-ink-400">
              Deleting your account permanently removes all transactions, budgets, goals and settings. This cannot be undone.
            </p>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete account</Button>
          </Card>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account"
        description="This action is permanent and cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void deleteAccount()} loading={deleting}>Delete permanently</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-[11.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            All {user.email} data will be erased, including transactions and savings goals.
          </div>
          {user.hasPassword && (
            <Input
              label="Password"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              placeholder="Confirm with your password"
            />
          )}
          <Input
            label="Type DELETE to confirm"
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder="DELETE"
          />
        </div>
      </Modal>

    </div>
  );
}
