import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler, money } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { transactionDto } from '../lib/serializers.js';
import { parseISODate } from '../lib/dates.js';
import { evaluateBudgetAlerts } from '../services/alerts.js';

const router = Router();
router.use(requireAuth);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date format YYYY-MM-DD')
  .transform((value) => parseISODate(value));

const transactionBody = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  amount: z.coerce
    .number({ invalid_type_error: 'Enter an amount' })
    .positive('Amount must be greater than zero')
    .max(1_000_000_000, 'Amount is too large'),
  description: z.string().trim().min(1, 'Add a description').max(200),
  notes: z.string().trim().max(1000).optional().nullable(),
  categoryId: z.string().uuid('Choose a category').nullable().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK']).default('CASH'),
  date: dateSchema,
});

async function assertCategoryAccess(categoryId: string | null | undefined, userId: string, type?: string) {
  if (!categoryId) return;
  const category = await prisma.category.findFirst({
    where: { id: categoryId, OR: [{ userId }, { userId: null }] },
  });
  if (!category) throw ApiError.badRequest('Category not found');
  if (type && category.type !== type) {
    throw ApiError.badRequest(`This category is for ${category.type.toLowerCase()} transactions`);
  }
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const query = parse(
      z.object({
        search: z.string().trim().max(100).optional(),
        type: z.enum(['INCOME', 'EXPENSE']).optional(),
        categoryId: z.string().uuid().optional(),
        paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK']).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).default('date_desc'),
      }),
      req.query
    );

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
              { category: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: parseISODate(query.from) } : {}),
              ...(query.to ? { lte: parseISODate(query.to) } : {}),
            },
          }
        : {}),
    };

    const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
      query.sort === 'date_asc'
        ? [{ date: 'asc' }, { createdAt: 'asc' }]
        : query.sort === 'amount_desc'
          ? [{ amount: 'desc' }, { date: 'desc' }]
          : query.sort === 'amount_asc'
            ? [{ amount: 'asc' }, { date: 'desc' }]
            : [{ date: 'desc' }, { createdAt: 'desc' }];

    const [items, total, totals] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: true },
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({ by: ['type'], where, _sum: { amount: true }, _count: true }),
    ]);

    const income = money(totals.find((t) => t.type === 'INCOME')?._sum.amount);
    const expense = money(totals.find((t) => t.type === 'EXPENSE')?._sum.amount);

    res.json({
      transactions: items.map(transactionDto),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.max(1, Math.ceil(total / query.limit)),
      },
      summary: { income, expense, net: money(income - expense), count: total },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: currentUserId(req) },
      include: { category: true },
    });
    if (!transaction) throw ApiError.notFound('Transaction not found');
    res.json({ transaction: transactionDto(transaction) });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const body = parse(transactionBody, req.body);
    await assertCategoryAccess(body.categoryId, userId, body.type);

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: body.type,
        amount: body.amount,
        description: body.description,
        notes: body.notes ?? null,
        categoryId: body.categoryId ?? null,
        paymentMethod: body.paymentMethod,
        date: body.date,
      },
      include: { category: true },
    });
    if (body.type === 'EXPENSE') await evaluateBudgetAlerts(userId);
    res.status(201).json({ message: 'Transaction added', transaction: transactionDto(transaction) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw ApiError.notFound('Transaction not found');

    const body = parse(transactionBody.partial(), req.body);
    const type = body.type ?? existing.type;
    if (body.categoryId !== undefined) await assertCategoryAccess(body.categoryId, userId, type);

    const transaction = await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        ...(body.type ? { type: body.type } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
        ...(body.date ? { date: body.date } : {}),
      },
      include: { category: true },
    });
    await evaluateBudgetAlerts(userId);
    res.json({ message: 'Transaction updated', transaction: transactionDto(transaction) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw ApiError.notFound('Transaction not found');
    await prisma.transaction.delete({ where: { id: existing.id } });
    res.json({ message: 'Transaction deleted' });
  })
);

export default router;
