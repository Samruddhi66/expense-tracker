import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Boots a throwaway real PostgreSQL instance, applies the Prisma migrations
 * and points the API at it. No mocks: the tests exercise the actual database.
 */
const port = 55_435;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-tracker-test-'));
const database = 'expense_tracker_test';
const url = `postgresql://postgres:postgres@localhost:${port}/${database}?schema=public`;

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.JWT_ACCESS_SECRET = 'test-access-secret-'.padEnd(64, 'a');
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-'.padEnd(64, 'b');
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
});

await pg.initialise();
await pg.start();
await pg.createDatabase(database);

execSync('npx prisma migrate deploy', {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'pipe',
});

afterAll(async () => {
  try {
    await pg.stop();
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
