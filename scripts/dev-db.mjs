#!/usr/bin/env node
/**
 * Local PostgreSQL for development, powered by embedded-postgres.
 *
 *   npm run db:start   start (creates the cluster + database on first run)
 *   npm run db:stop    stop the running instance
 *
 * Data lives in .data/postgres (git ignored). Requires no root access.
 * For production use a managed PostgreSQL and set DATABASE_URL.
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = path.join(root, '.data', 'postgres');
const pidFile = path.join(root, '.data', 'postgres.pid');
const envFile = path.join(root, '.env');
const PORT = Number(process.env.PG_PORT ?? 5432);
const DB_NAME = 'expense_tracker';

const config = {
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
};

function ensureEnvFile() {
  // Prisma CLI only reads .env from the server/ package directory, while the
  // API itself reads the workspace root .env. Keep a single source of truth
  // by symlinking server/.env -> ../.env.
  const serverEnv = path.join(root, 'server', '.env');
  if (!fs.existsSync(serverEnv)) {
    try {
      fs.symlinkSync('../.env', serverEnv);
    } catch {
      fs.copyFileSync(envFile, serverEnv);
    }
  }
  if (fs.existsSync(envFile)) return;
  const secret = () => crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(
    envFile,
    [
      'NODE_ENV=development',
      'PORT=4000',
      'CLIENT_URL=http://localhost:5173',
      `DATABASE_URL=postgresql://postgres:postgres@localhost:${PORT}/${DB_NAME}?schema=public`,
      `JWT_ACCESS_SECRET=${secret()}`,
      `JWT_REFRESH_SECRET=${secret()}`,
      'ACCESS_TOKEN_TTL=15m',
      'REFRESH_TOKEN_TTL_DAYS=30',
      'ADMIN_EMAIL=admin@expense-tracker.app',
      'ADMIN_PASSWORD=Admin@12345',
      'ADMIN_NAME=System Administrator',
      'SMTP_HOST=',
      'SMTP_PORT=587',
      'SMTP_SECURE=false',
      'SMTP_USER=',
      'SMTP_PASS=',
      'MAIL_FROM="Expense Tracker <no-reply@expense-tracker.app>"',
      'GOOGLE_CLIENT_ID=',
      'AI_API_KEY=',
      'AI_BASE_URL=https://api.openai.com/v1',
      'AI_MODEL=gpt-4o-mini',
      'SCHEDULER_INTERVAL_MINUTES=15',
      '',
    ].join('\n')
  );
  console.log('✓ Created .env with a local DATABASE_URL and random JWT secrets');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const action = process.argv[2] ?? 'start';

if (action === 'stop') {
  if (!fs.existsSync(pidFile)) {
    console.log('No local database is recorded as running.');
    process.exit(0);
  }
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  try {
    process.kill(pid, 'SIGTERM');
    fs.rmSync(pidFile, { force: true });
    console.log(`Stopped local PostgreSQL (pid ${pid}).`);
  } catch {
    fs.rmSync(pidFile, { force: true });
    console.log('Local PostgreSQL was not running.');
  }
  process.exit(0);
}

if (action !== 'start') fail(`Unknown action "${action}". Use start or stop.`);

ensureEnvFile();
fs.mkdirSync(path.join(root, '.data'), { recursive: true });

const pg = new EmbeddedPostgres(config);

const alreadyInitialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (!alreadyInitialised) {
  console.log('Initialising local PostgreSQL cluster…');
  await pg.initialise();
}
await pg.start();

try {
  await pg.createDatabase(DB_NAME);
  console.log(`✓ Created database ${DB_NAME}`);
} catch {
  // already exists
}

fs.writeFileSync(pidFile, String(process.pid));
console.log(`✓ PostgreSQL ready on localhost:${PORT} (database: ${DB_NAME})`);
console.log('  Keep this process running while developing. Press Ctrl+C to stop.');

const shutdown = async () => {
  try {
    await pg.stop();
  } finally {
    fs.rmSync(pidFile, { force: true });
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// keep alive
setInterval(() => {}, 1 << 30);
