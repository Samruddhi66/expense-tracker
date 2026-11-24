import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { buildAnalytics, type ReportPeriod } from '../services/analytics.js';
import { analyticsToCsv, analyticsToPdf } from '../services/export.js';
import { env } from '../config/env.js';

const router = Router();
router.use(requireAuth);

const querySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parse(querySchema, req.query);
    const analytics = await buildAnalytics(currentUserId(req), query.period as ReportPeriod, query.date);
    res.json(analytics);
  })
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const query = parse(querySchema, req.query);
    const userId = currentUserId(req);
    const [analytics, user, settings] = await Promise.all([
      buildAnalytics(userId, query.period as ReportPeriod, query.date),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
      prisma.userSettings.findUnique({ where: { userId }, select: { currency: true } }),
    ]);
    res.setHeader('Cache-Control', 'no-store');

    if (query.format === 'csv') {
      const csv = analyticsToCsv(analytics, user);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="expense-report-${query.period}-${analytics.range.start}.csv"`
      );
      return res.send(csv);
    }

    if (query.format === 'pdf') {
      const pdf = await analyticsToPdf({
        analytics,
        user,
        currency: settings?.currency ?? 'INR',
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="expense-report-${query.period}-${analytics.range.start}.pdf"`
      );
      return res.send(pdf);
    }

    res.json({ analytics, generatedBy: env.nodeEnv });
  })
);

export default router;
