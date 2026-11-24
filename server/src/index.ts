import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { runScheduledJobs } from './services/alerts.js';

async function main() {
  await prisma.$connect();
  console.info('✓ Database connected');

  const app = createApp();
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.info(`✓ API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  if (!env.isTest) {
    const intervalMs = Math.max(1, env.schedulerIntervalMinutes) * 60_000;
    const timer = setInterval(() => {
      runScheduledJobs().catch((error) => console.error('[scheduler] failed', error));
    }, intervalMs);
    timer.unref();
    runScheduledJobs().catch((error) => console.error('[scheduler] initial run failed', error));
  }

  const shutdown = async (signal: string) => {
    console.info(`\n${signal} received, shutting down…`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
