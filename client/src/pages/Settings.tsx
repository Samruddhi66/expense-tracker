import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, Check, Download, Globe2, KeyRound, Monitor, Moon, Palette, ShieldAlert,
  Sparkles, Sun, Tags, Trash2, UserRound,
} from 'lucide-react';
import { api, downloadFile } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { Card, PageHeader, Spinner } from '../components/ui/Misc';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import type { Settings as SettingsType, ThemePreference } from '../lib/types';
import { cn } from '../lib/utils';

const currencies = [
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'SGD', label: 'Singapore Dollar (S$)' },
  { code: 'AED', label: 'UAE Dirham (AED)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
];

const locales = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'fr-FR', label: 'French (France)' },
];

function Toggle({
  checked, onChange, label, description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-[13px] font-semibold text-ink-800 dark:text-ink-100">{label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-400">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-ink-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20 dark:bg-ink-700" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { setPreference, resolved } = useTheme();
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [config, setConfig] = useState<{ emailConfigured: boolean; googleClientId: string | null; aiConfigured: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ settings: SettingsType }>('/users/me/settings');
      setSettings(data.settings);
    } catch {
      toast.error('Could not load settings');
    }
  }, [toast]);

  useEffect(() => {
    void load();
    api<typeof config>('/config').then(setConfig).catch(() => undefined);
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api('/users/me/settings', {
        method: 'PATCH',
        body: {
          currency: settings.currency,
          locale: settings.locale,
          theme: settings.theme,
          weekStartsOn: settings.weekStartsOn,
          notifyBudgetAlerts: settings.notifyBudgetAlerts,
          notifyBillReminders: settings.notifyBillReminders,
          notifySavings: settings.notifySavings,
          notifyMonthlySummary: settings.notifyMonthlySummary,
        },
      });
      await refreshUser();
      await setPreference(settings.theme, false);
      toast.success('Settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      await downloadFile('/users/me/export', 'expense-tracker-data.json');
      toast.success('Your data export has been downloaded');
    } catch {
      toast.error('Could not export your data');
    } finally {
      setExporting(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Currency, appearance, notifications and your account data — all in one place."
        actions={<Button onClick={() => void save()} loading={saving}><Check className="h-4 w-4" /> Save changes</Button>}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <Globe2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Regional</h2>
              <p className="text-[11px] text-ink-400">How amounts and dates are formatted</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Currency"
              value={settings.currency}
              onChange={(event) => setSettings({ ...settings, currency: event.target.value })}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>{currency.label}</option>
              ))}
            </Select>
            <Select
              label="Number format"
              value={settings.locale}
              onChange={(event) => setSettings({ ...settings, locale: event.target.value })}
            >
              {locales.map((locale) => (
                <option key={locale.value} value={locale.value}>{locale.label}</option>
              ))}
            </Select>
            <Select
              label="Week starts on"
              value={String(settings.weekStartsOn)}
              onChange={(event) => setSettings({ ...settings, weekStartsOn: Number(event.target.value) })}
            >
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </Select>
            <div className="flex items-end pb-1">
              <p className="text-[11px] leading-relaxed text-ink-400">
                Changing currency only changes display — stored amounts stay intact.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <Palette className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Appearance</h2>
              <p className="text-[11px] text-ink-400">Currently using {resolved} mode</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'LIGHT', label: 'Light', icon: Sun },
              { value: 'DARK', label: 'Dark', icon: Moon },
              { value: 'SYSTEM', label: 'System', icon: Monitor },
            ] as { value: ThemePreference; label: string; icon: typeof Sun }[]).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={async () => {
                  setSettings({ ...settings, theme: value });
                  await setPreference(value);
                }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-[12px] font-semibold transition',
                  settings.theme === value
                    ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-200'
                    : 'border-ink-200 text-ink-500 hover:border-brand-200 dark:border-ink-700 dark:text-ink-400'
                )}
                aria-pressed={settings.theme === value}
              >
                <Icon className="h-4.5 w-4.5" />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-400">
            The theme is also available from the top bar and is remembered on this device.
          </p>
        </Card>

        <Card className="p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
              <Bell className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Notifications</h2>
              <p className="text-[11px] text-ink-400">Choose what we tell you about</p>
            </div>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-white/5">
            <Toggle
              label="Budget alerts"
              description="When you reach 80% or exceed a budget"
              checked={settings.notifyBudgetAlerts}
              onChange={(checked) => setSettings({ ...settings, notifyBudgetAlerts: checked })}
            />
            <Toggle
              label="Bill reminders"
              description="Before a recurring payment is due"
              checked={settings.notifyBillReminders}
              onChange={(checked) => setSettings({ ...settings, notifyBillReminders: checked })}
            />
            <Toggle
              label="Savings notifications"
              description="Contributions and completed goals"
              checked={settings.notifySavings}
              onChange={(checked) => setSettings({ ...settings, notifySavings: checked })}
            />
            <Toggle
              label="Monthly summaries"
              description="A recap of the previous month"
              checked={settings.notifyMonthlySummary}
              onChange={(checked) => setSettings({ ...settings, notifyMonthlySummary: checked })}
            />
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Tags className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Categories</h2>
                <p className="text-[11px] text-ink-400">Create, rename or recolour your categories</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setCategoryModal(true)}>
              <Tags className="h-4 w-4" /> Manage categories
            </Button>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                <UserRound className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Account & security</h2>
                <p className="text-[11px] text-ink-400">Password, profile and personal data</p>
              </div>
            </div>
            <div className="space-y-2">
              <Link to="/profile" className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-700 transition hover:border-brand-200 hover:text-brand-700 dark:border-white/5 dark:text-ink-200">
                <span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-ink-400" /> Profile & password</span>
                <span className="text-ink-300">→</span>
              </Link>
              <button
                type="button"
                onClick={() => void exportData()}
                disabled={exporting}
                className="flex w-full items-center justify-between rounded-xl border border-ink-100 px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-700 transition hover:border-brand-200 hover:text-brand-700 disabled:opacity-60 dark:border-white/5 dark:text-ink-200"
              >
                <span className="flex items-center gap-2"><Download className="h-4 w-4 text-ink-400" /> Export my data (JSON)</span>
                <span className="text-ink-300">{exporting ? '…' : '→'}</span>
              </button>
              <Link to="/profile" className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete my account</span>
                <span className="opacity-60">→</span>
              </Link>
            </div>
          </Card>
        </div>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-[14px] font-bold text-ink-900 dark:text-white">Integrations</h2>
              <p className="text-[11px] text-ink-400">Optional services configured on the server</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Email delivery',
                active: config?.emailConfigured ?? false,
                detail: config?.emailConfigured ? 'SMTP configured — verification and alert emails are delivered.' : 'Console mode — action links are shown in the app for development.',
              },
              {
                label: 'Google sign-in',
                active: Boolean(config?.googleClientId),
                detail: config?.googleClientId ? 'Google OAuth client configured.' : 'Set GOOGLE_CLIENT_ID on the server to enable it.',
              },
              {
                label: 'AI assistant',
                active: config?.aiConfigured ?? false,
                detail: config?.aiConfigured ? 'External AI model configured with rule-based fallback.' : 'Using the built-in rule engine over your real data.',
              },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-ink-100 p-3.5 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-[12.5px] font-bold text-ink-800 dark:text-ink-100">{item.label}</p>
                  <span className={cn('h-2 w-2 rounded-full', item.active ? 'bg-emerald-500' : 'bg-amber-400')} />
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-ink-400">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Keep API keys and SMTP passwords in the server environment. They are never sent to the browser.
          </div>
        </Card>
      </div>

      <CategoryManagerModal open={categoryModal} onClose={() => setCategoryModal(false)} />
      {user && <span className="sr-only">Signed in as {user.email}</span>}
    </div>
  );
}
