import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { answerQuestion, buildFinancialContext, generateInsight, suggestionsFor } from '../services/ai.js';
import { ApiError } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get('/status', (_req, res) => {
  res.json({
    configured: env.aiConfigured,
    provider: env.aiConfigured ? 'openai-compatible' : 'rule-engine',
    model: env.aiConfigured ? env.ai.model : 'rule-engine',
    fallback: 'Deterministic analysis of your own data',
  });
});

router.get(
  '/insights',
  asyncHandler(async (req, res) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
    const insights = await prisma.aiInsight.findMany({
      where: { userId: currentUserId(req) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ insights });
  })
);

router.post(
  '/insights',
  asyncHandler(async (req, res) => {
    const { type } = parse(
      z.object({ type: z.enum(['SPENDING_ANALYSIS', 'MONTHLY_SUMMARY', 'BUDGET_ADVICE']) }),
      req.body
    );
    const userId = currentUserId(req);
    const context = await buildFinancialContext(userId);
    const result = await generateInsight(userId, type, context);
    const insight = await prisma.aiInsight.create({
      data: {
        userId,
        type,
        content: result.content,
        source: result.source,
        model: result.model,
        metadata: {
          month: context.month,
          income: context.currentMonth.income,
          expense: context.currentMonth.expense,
        },
      },
    });
    res.status(201).json({ insight, suggestions: suggestionsFor(context) });
  })
);

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message } = parse(z.object({ message: z.string().trim().min(2, 'Ask a question').max(500) }), req.body);
    const userId = currentUserId(req);
    const context = await buildFinancialContext(userId);
    const result = await answerQuestion(userId, message, context);
    const insight = await prisma.aiInsight.create({
      data: {
        userId,
        type: 'CHAT',
        prompt: message,
        content: result.content,
        source: result.source,
        model: result.model,
        metadata: { month: context.month },
      },
    });
    res.json({
      reply: result.content,
      source: result.source,
      model: result.model,
      insightId: insight.id,
      suggestions: suggestionsFor(context),
    });
  })
);

router.delete(
  '/insights/:id',
  asyncHandler(async (req, res) => {
    const insight = await prisma.aiInsight.findFirst({
      where: { id: req.params.id, userId: currentUserId(req) },
    });
    if (!insight) throw ApiError.notFound('Insight not found');
    await prisma.aiInsight.delete({ where: { id: insight.id } });
    res.json({ message: 'Insight deleted' });
  })
);

export default router;
