import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src/config -> workspace root / server root (same depth for dist/config)
dotenv.config({ path: path.resolve(here, '../../../.env') });
dotenv.config({ path: path.resolve(here, '../../.env') });

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function required(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value && value.trim() !== '') return value;
  if (fallback !== undefined) {
    if (isProd) throw new Error(`Missing required environment variable: ${name}`);
    return fallback;
  }
  throw new Error(`Missing required environment variable: ${name}`);
}

function devSecret(fallback: string): string {
  if (process.env.JWT_ACCESS_SECRET) return process.env.JWT_ACCESS_SECRET;
  if (isProd) throw new Error('JWT_ACCESS_SECRET is required in production');
  return fallback;
}

const databaseUrl = required(
  'DATABASE_URL',
  'postgresql://postgres:postgres@localhost:5432/expense_tracker?schema=public'
);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  isTest,
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  databaseUrl,
  accessSecret: devSecret(crypto.createHash('sha256').update('dev-access-secret').digest('hex')),
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? crypto.createHash('sha256').update('dev-refresh-secret').digest('hex'),
  accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Expense Tracker <no-reply@expense-tracker.app>',
  },
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  ai: {
    apiKey: process.env.AI_API_KEY ?? '',
    baseUrl: (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL ?? 'gpt-4o-mini',
  },
  schedulerIntervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 15),
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@expense-tracker.app',
    password: process.env.ADMIN_PASSWORD ?? 'Admin@12345',
    name: process.env.ADMIN_NAME ?? 'System Administrator',
  },
  refreshCookieName: 'et_refresh',
  emailConfigured: Boolean(process.env.SMTP_HOST),
  aiConfigured: Boolean(process.env.AI_API_KEY),
  googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
};
