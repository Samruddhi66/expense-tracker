import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler, money } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { addDays, addMonths, addYears, isoDate, parseISODate, toDateOnly } from '../lib/dates.js';
import { processRecurring } from '../services/alerts.js';

const router = Router();
router.use(requireAuth);

const bodySchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce.number().positive('Enter an amount').max(1_000_000_000),
  description: z.string().trim().min(1, 'Add a description').max(200),
  categoryId: z.string().uuid().nullable().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK']).default('CASH'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  interval: z.coerce.number().int().min(1).max(24).default(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  reminderDays: z.coerce.number().int().min(0).max(30).default(3),
  isActive: z.boolean().default(true),
});

function advance(date: Date, frequency: string, interval: number) {
  if (frequency === 'DAILY') return addDays(date, interval);
  if (frequency === 'WEEKLY') return addDays(date, 7 * interval);
  if (frequency === 'YEARLY') return addYears(date, interval);
  return addMonths(date, interval);
}

function nextOnOrAfter(start: Date, frequency: string, interval: number, from: Date) {
  let next = start;
  let guard = 0;
  while (next < from && guard < 500) {
    next = advance(next, frequency, interval);
    guard += 1;
  }
  return next;
}

async function assertCategory(categoryId: string | null | undefined, userId: string, type: string) {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({ where: { id: categoryId, OR: [{ userId }, { userId: null }] } });
  if (!category) throw ApiError.badRequest('Category not found');
  if (category.type !== type) throw ApiError.badRequest(`This category is for ${category.type.toLowerCase()} transactions`);
}

function dto(item: {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amount: unknown;
  description: string;
  paymentMethod: string;
  frequency: string;
  interval: number;
  startDate: Date;
  nextRunDate: Date;
  endDate: Date | null;
  isActive: boolean;
  reminderDays: number;
  lastRunAt: Date | null;
  category?: { id: string; name: string; color: string; icon: string } | null;
}) {
  const today = toDateOnly(new Date());
  return {
    id: item.id,
    type: item.type,
    amount: money(item.amount),
    description: item.description,
    paymentMethod: item.paymentMethod,
    frequency: item.frequency,
    interval: item.interval,
    startDate: item.startDate,
    nextRunDate: item.nextRunDate,
    endDate: item.endDate,
    isActive: item.isActive,
    reminderDays: item.reminderDays,
    lastRunAt: item.lastRunAt,
    category: item.category ?? null,
    daysUntilNext: Math.ceil((item.nextRunDate.getTime() - today.getTime()) / 86_400_000),
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const items = await prisma.recurringTransaction.findMany({
      where: { userId },
      include: { category: true },
      orderBy: [{ isActive: 'desc' }, { nextRunDate: 'asc' }],
    });
    res.json({
      recurring: items.map(dto),
      summary: {
        active: items.filter((i) => i.isActive).length,
        monthlyExpense: money(
          items
            .filter((i) => i.isActive && i.type === 'EXPENSE')
            .reduce((sum, i) => {
              const multiplier =
                i.frequency === 'DAILY' ? 30 : i.frequency === 'WEEKLY' ? 4.345 : i.frequency === 'YEARLY' ? 1 / 12 : 1;
              return sum + Number(i.amount) * multiplier * i.interval;
            }, 0)
        ),
      },
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const body = parse(bodySchema, req.body);
    await assertCategory(body.categoryId, userId, body.type);
    const start = parseISODate(body.startDate);
    const today = toDateOnly(new Date());
    const end = body.endDate ? parseISODate(body.endDate) : null;
    if (end && end < start) throw ApiError.badRequest('End date must be after the start date');

    const item = await prisma.recurringTransaction.create({
      data: {
        userId,
        type: body.type,
        amount: body.amount,
        description: body.description,
        categoryId: body.categoryId ?? null,
        paymentMethod: body.paymentMethod,
        frequency: body.frequency,
        interval: body.interval,
        startDate: start,
        nextRunDate: nextOnOrAfter(start, body.frequency, body.interval, today),
        endDate: end,
        reminderDays: body.reminderDays,
        isActive: body.isActive,
      },
      include: { category: true },
    });
    res.status(201).json({ message: 'Recurring transaction created', recurring: dto(item) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const existing = await prisma.recurringTransaction.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw ApiError.notFound('Recurring transaction not found');
    const body = parse(bodySchema.partial(), req.body);
    if (body.categoryId !== undefined) await assertCategory(body.categoryId, userId, body.type ?? existing.type);
    if (body.endDate && body.startDate && parseISODate(body.endDate) < parseISODate(body.startDate)) {
      throw ApiError.badRequest('End date must be after the start date');
    }

    const shouldRecompute = Boolean(body.startDate || body.frequency || body.interval !== undefined);
    const nextStart = body.startDate ? parseISODate(body.startDate) : existing.startDate;
    const nextFrequency = body.frequency ?? existing.frequency;
    const nextInterval = body.interval ?? existing.interval;

    const item = await prisma.recurringTransaction.update({
      where: { id: existing.id },
      data: {
        ...(body.type ? { type: body.type } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
        ...(body.frequency ? { frequency: body.frequency } : {}),
        ...(body.interval !== undefined ? { interval: body.interval } : {}),
        ...(body.startDate ? { startDate: nextStart } : {}),
        ...(shouldRecompute
          ? { nextRunDate: nextOnOrAfter(nextStart, nextFrequency, nextInterval, toDateOnly(new Date())) }
          : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? parseISODate(body.endDate) : null } : {}),
        ...(body.reminderDays !== undefined ? { reminderDays: body.reminderDays } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: { category: true },
    });
    res.json({ message: 'Recurring transaction updated', recurring: dto(item) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id: req.params.id, userId: currentUserId(req) },
    });
    if (!existing) throw ApiError.notFound('Recurring transaction not found');
    await prisma.recurringTransaction.delete({ where: { id: existing.id } });
    res.json({ message: 'Recurring transaction deleted' });
  })
);

router.post(
  '/process',
  asyncHandler(async (req, res) => {
    const result = await processRecurring(currentUserId(req));
    res.json({
      message:
        result.created > 0
          ? `${result.created} scheduled transaction${result.created === 1 ? '' : 's'} added`
          : 'Everything is up to date',
      ...result,
    });
  })
);

router.post(
  '/:id/run',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const item = await prisma.recurringTransaction.findFirst({ where: { id: req.params.id, userId } });
    if (!item) throw ApiError.notFound('Recurring transaction not found');
    const today = toDateOnly(new Date());
    const runDate = item.nextRunDate;
    await prisma.transaction.create({
      data: {
        userId,
        categoryId: item.categoryId,
        type: item.type,
        amount: item.amount,
        description: item.description,
        paymentMethod: item.paymentMethod,
        date: runDate,
        recurringId: item.id,
      },
    });
    await prisma.recurringTransaction.update({
      where: { id: item.id },
      data: { lastRunAt: new Date(), nextRunDate: advance(runDate, item.frequency, item.interval) },
    });
    res.json({ message: `Added "${item.description}" for ${isoDate(runDate)}`, date: runDate, today });
  })
);

export default router;
