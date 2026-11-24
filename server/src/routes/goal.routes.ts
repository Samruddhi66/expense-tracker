import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler, money } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { goalDto } from '../lib/serializers.js';
import { parseISODate, toDateOnly } from '../lib/dates.js';

const router = Router();
router.use(requireAuth);

const goalSchema = z.object({
  name: z.string().trim().min(2, 'Give your goal a name').max(100),
  description: z.string().trim().max(500).optional().nullable(),
  targetAmount: z.coerce.number().positive('Enter a target amount').max(1_000_000_000),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a target date'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid colour').optional(),
});

async function loadGoal(goalId: string, userId: string) {
  const goal = await prisma.savingsGoal.findFirst({
    where: { id: goalId, userId },
    include: { contributions: { orderBy: { date: 'desc' } } },
  });
  if (!goal) throw ApiError.notFound('Savings goal not found');
  return goal;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const goals = await prisma.savingsGoal.findMany({
      where: { userId },
      include: { contributions: { orderBy: { date: 'desc' } } },
      orderBy: [{ status: 'asc' }, { targetDate: 'asc' }],
    });
    const items = goals.map(goalDto);
    res.json({
      goals: items,
      summary: {
        count: items.length,
        active: items.filter((g) => g.status === 'ACTIVE').length,
        completed: items.filter((g) => g.status === 'COMPLETED').length,
        savedTotal: money(items.reduce((s, g) => s + g.savedAmount, 0)),
        targetTotal: money(items.reduce((s, g) => s + g.targetAmount, 0)),
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req.params.id, currentUserId(req));
    res.json({ goal: goalDto(goal) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const body = parse(goalSchema, req.body);
    const targetDate = parseISODate(body.targetDate);
    if (targetDate < toDateOnly(new Date())) throw ApiError.badRequest('Target date must be in the future');
    const goal = await prisma.savingsGoal.create({
      data: {
        userId,
        name: body.name,
        description: body.description ?? null,
        targetAmount: body.targetAmount,
        targetDate,
        color: body.color ?? '#7C3AED',
      },
      include: { contributions: true },
    });
    res.status(201).json({ message: 'Savings goal created', goal: goalDto(goal) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    await loadGoal(req.params.id, userId);
    const body = parse(
      goalSchema
        .partial()
        .extend({ status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional() }),
      req.body
    );
    const goal = await prisma.savingsGoal.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.targetAmount !== undefined ? { targetAmount: body.targetAmount } : {}),
        ...(body.targetDate ? { targetDate: parseISODate(body.targetDate) } : {}),
        ...(body.color ? { color: body.color } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
      include: { contributions: { orderBy: { date: 'desc' } } },
    });
    res.json({ message: 'Goal updated', goal: goalDto(goal) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const goal = await loadGoal(req.params.id, currentUserId(req));
    await prisma.savingsGoal.delete({ where: { id: goal.id } });
    res.json({ message: 'Savings goal deleted' });
  })
);

router.post(
  '/:id/contributions',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const goal = await loadGoal(req.params.id, userId);
    const body = parse(
      z.object({
        amount: z.coerce.number().positive('Enter a contribution amount').max(1_000_000_000),
        note: z.string().trim().max(300).optional().nullable(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
      req.body
    );

    await prisma.goalContribution.create({
      data: {
        goalId: goal.id,
        userId,
        amount: body.amount,
        note: body.note ?? null,
        date: body.date ? parseISODate(body.date) : toDateOnly(new Date()),
      },
    });

    const updated = await loadGoal(goal.id, userId);
    const dto = goalDto(updated);
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (dto.savedAmount >= dto.targetAmount && updated.status === 'ACTIVE') {
      await prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'COMPLETED' } });
      dto.status = 'COMPLETED';
      if (settings?.notifySavings !== false) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'SAVINGS',
            title: `Goal reached: ${goal.name}`,
            message: `You saved the full ${dto.targetAmount.toFixed(2)} for ${goal.name}. Time to celebrate!`,
            data: { goalId: goal.id },
          },
        });
      }
    } else if (settings?.notifySavings !== false) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'SAVINGS',
          title: `Saved towards ${goal.name}`,
          message: `${money(body.amount).toFixed(2)} added. You are now at ${dto.progress}% of your goal.`,
          data: { goalId: goal.id, contribution: true },
        },
      });
    }

    res.status(201).json({ message: 'Contribution added', goal: dto });
  })
);

router.delete(
  '/:id/contributions/:contributionId',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const goal = await loadGoal(req.params.id, userId);
    const contribution = goal.contributions.find((c) => c.id === req.params.contributionId);
    if (!contribution) throw ApiError.notFound('Contribution not found');
    await prisma.goalContribution.delete({ where: { id: contribution.id } });
    const updated = await loadGoal(goal.id, userId);
    res.json({ message: 'Contribution removed', goal: goalDto(updated) });
  })
);

export default router;
