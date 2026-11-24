import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler, money } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { budgetDto } from '../lib/serializers.js';
import { monthRange, parseISODate, toDateOnly } from '../lib/dates.js';
import { budgetProgressFor, budgetsOverlapping, periodLabel, periodWindow } from '../services/budgets.js';
import { evaluateBudgetAlerts } from '../services/alerts.js';

const router = Router();
router.use(requireAuth);

const budgetSchema = z.object({
  period: z.enum(['WEEKLY', 'MONTHLY']),
  amount: z.coerce.number().positive('Budget must be greater than zero').max(1_000_000_000),
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(120).optional().nullable(),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req.query);
    const { start, end, key } = monthRange(month);
    const budgets = await budgetsOverlapping(userId, start, end);
    const progress = await budgetProgressFor(budgets, userId);

    res.json({
      period: { month: key, start, end },
      budgets: progress.map((p) => ({
        ...budgetDto(p.budget),
        periodLabel: periodLabel(p.budget),
        spent: p.spent,
        remaining: p.remaining,
        percentage: p.percentage,
        status: p.status,
        daysLeft: p.daysLeft,
      })),
      summary: (() => {
        const overall = progress.find((p) => !p.budget.categoryId);
        return {
          totalBudgeted: overall ? overall.amount : money(progress.reduce((s, p) => s + p.amount, 0)),
          totalSpent: overall ? overall.spent : money(progress.reduce((s, p) => s + p.spent, 0)),
          count: progress.length,
        };
      })(),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const body = parse(budgetSchema, req.body);
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const reference = body.referenceDate ? parseISODate(body.referenceDate) : toDateOnly(new Date());
    const { startDate, endDate } = periodWindow(body.period, reference, settings?.weekStartsOn ?? 1);

    if (body.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: body.categoryId, OR: [{ userId }, { userId: null }] },
      });
      if (!category) throw ApiError.badRequest('Category not found');
      if (category.type !== 'EXPENSE') throw ApiError.badRequest('Budgets can only track expense categories');
    }

    const duplicate = await prisma.budget.findFirst({
      where: {
        userId,
        period: body.period,
        startDate,
        ...(body.categoryId ? { categoryId: body.categoryId } : { categoryId: null }),
      },
    });
    if (duplicate) {
      throw ApiError.conflict('A budget for this period and category already exists. Edit it instead.');
    }

    const budget = await prisma.budget.create({
      data: {
        userId,
        period: body.period,
        amount: body.amount,
        categoryId: body.categoryId ?? null,
        name: body.name ?? null,
        startDate,
        endDate,
      },
      include: { category: true },
    });
    await evaluateBudgetAlerts(userId);
    res.status(201).json({
      message: 'Budget created',
      budget: { ...budgetDto(budget), periodLabel: periodLabel(budget) },
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const existing = await prisma.budget.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw ApiError.notFound('Budget not found');
    const body = parse(
      z.object({
        amount: z.coerce.number().positive('Budget must be greater than zero').max(1_000_000_000).optional(),
        name: z.string().trim().max(120).nullable().optional(),
      }),
      req.body
    );
    const budget = await prisma.budget.update({
      where: { id: existing.id },
      data: { ...(body.amount !== undefined ? { amount: body.amount } : {}), ...(body.name !== undefined ? { name: body.name } : {}) },
      include: { category: true },
    });
    res.json({ message: 'Budget updated', budget: { ...budgetDto(budget), periodLabel: periodLabel(budget) } });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.budget.findFirst({ where: { id: req.params.id, userId: currentUserId(req) } });
    if (!existing) throw ApiError.notFound('Budget not found');
    await prisma.budget.delete({ where: { id: existing.id } });
    res.json({ message: 'Budget deleted' });
  })
);

export default router;
