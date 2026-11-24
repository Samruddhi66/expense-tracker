import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler, money } from '../lib/http.js';
import { requireAuth, requireAdmin, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { categoryDto } from '../lib/serializers.js';
import { addDays, isoDate, toDateOnly } from '../lib/dates.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const today = toDateOnly(new Date());
    const activeSince = addDays(today, -30);
    const signupSince = addDays(today, -13);

    const [
      totalUsers,
      activeUsers,
      newUsers,
      admins,
      totalTransactions,
      incomeAgg,
      expenseAgg,
      categories,
      goals,
      insights,
      recentUsers,
      dailySignups,
      dailyTransactions,
      categorySpend,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { isActive: true, OR: [{ lastLoginAt: { gte: activeSince } }, { transactions: { some: { date: { gte: activeSince } } } }] },
      }),
      prisma.user.count({ where: { createdAt: { gte: addDays(today, -7) } } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.transaction.count(),
      prisma.transaction.aggregate({ where: { type: 'INCOME' }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'EXPENSE' }, _sum: { amount: true } }),
      prisma.category.count(),
      prisma.savingsGoal.count(),
      prisma.aiInsight.count(),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, email: true, role: true, createdAt: true, emailVerified: true },
      }),
      prisma.user.findMany({ where: { createdAt: { gte: signupSince } }, select: { createdAt: true } }),
      prisma.transaction.findMany({ where: { date: { gte: addDays(today, -13) } }, select: { date: true, type: true } }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { type: 'EXPENSE' },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
    ]);

    const categoryIds = categorySpend.map((c) => c.categoryId).filter((id): id is string => Boolean(id));
    const categoryRows = await prisma.category.findMany({ where: { id: { in: categoryIds } } });
    const categoryMap = new Map(categoryRows.map((c) => [c.id, c]));

    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
    const signupSeries = days.map((day) => ({
      date: isoDate(day),
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      users: dailySignups.filter((u) => isoDate(u.createdAt) === isoDate(day)).length,
    }));
    const activitySeries = days.map((day) => {
      const rows = dailyTransactions.filter((t) => isoDate(t.date) === isoDate(day));
      return {
        date: isoDate(day),
        label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        transactions: rows.length,
        income: money(rows.filter((r) => r.type === 'INCOME').length),
        expense: rows.filter((r) => r.type === 'EXPENSE').length,
      };
    });

    res.json({
      totals: {
        users: totalUsers,
        activeUsers,
        newUsers7d: newUsers,
        admins,
        transactions: totalTransactions,
        volume: money(money(incomeAgg._sum.amount) + money(expenseAgg._sum.amount)),
        income: money(incomeAgg._sum.amount),
        expense: money(expenseAgg._sum.amount),
        categories,
        goals,
        aiInsights: insights,
      },
      signupSeries,
      activitySeries,
      topCategories: categorySpend.map((row) => ({
        name: row.categoryId ? categoryMap.get(row.categoryId)?.name ?? 'Unknown' : 'Uncategorised',
        color: row.categoryId ? categoryMap.get(row.categoryId)?.color ?? '#94A3B8' : '#94A3B8',
        value: money(row._sum.amount),
      })),
      recentUsers,
    });
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const query = parse(
      z.object({
        search: z.string().trim().max(100).optional(),
        role: z.enum(['USER', 'ADMIN']).optional(),
        status: z.enum(['active', 'suspended']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      req.query
    );
    const where = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { isActive: query.status === 'active' } : {}),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          avatarUrl: true,
          _count: { select: { transactions: true, budgets: true, goals: true } },
          settings: { select: { currency: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({
      users: users.map(({ _count, settings, ...user }) => ({
        ...user,
        currency: settings?.currency ?? 'INR',
        counts: _count,
      })),
      pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
    });
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        role: z.enum(['USER', 'ADMIN']).optional(),
        isActive: z.boolean().optional(),
        emailVerified: z.boolean().optional(),
      }),
      req.body
    );
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw ApiError.notFound('User not found');
    if (target.id === currentUserId(req) && (body.role === 'USER' || body.isActive === false)) {
      throw ApiError.badRequest('You cannot demote or suspend your own administrator account');
    }
    if (target.role === 'ADMIN' && body.role === 'USER') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (adminCount <= 1) throw ApiError.badRequest('At least one administrator must remain');
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.emailVerified !== undefined
          ? { emailVerified: body.emailVerified, emailVerifiedAt: body.emailVerified ? new Date() : null }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true },
    });
    if (body.isActive === false) {
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.json({ message: 'User updated', user });
  })
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw ApiError.notFound('User not found');
    if (target.id === currentUserId(req)) throw ApiError.badRequest('You cannot delete your own account here');
    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) throw ApiError.badRequest('At least one administrator must remain');
    }
    await prisma.user.delete({ where: { id: target.id } });
    res.json({ message: 'User and all related data deleted' });
  })
);

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      where: { userId: null },
      include: { _count: { select: { transactions: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    res.json({
      categories: categories.map((c) => ({ ...categoryDto(c), transactionCount: c._count.transactions })),
    });
  })
);

const adminCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(['INCOME', 'EXPENSE']),
  icon: z.string().trim().min(1).max(40).default('Tag'),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).default('#7C3AED'),
});

router.post(
  '/categories',
  asyncHandler(async (req, res) => {
    const body = parse(adminCategorySchema, req.body);
    const duplicate = await prisma.category.findFirst({ where: { userId: null, name: body.name, type: body.type } });
    if (duplicate) throw ApiError.conflict('A default category with this name already exists');
    const category = await prisma.category.create({ data: { ...body, userId: null, isSystem: true } });
    res.status(201).json({ message: 'Default category created', category: categoryDto(category) });
  })
);

router.patch(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const body = parse(adminCategorySchema.partial(), req.body);
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId: null } });
    if (!existing) throw ApiError.notFound('Default category not found');
    const category = await prisma.category.update({ where: { id: existing.id }, data: body });
    res.json({ message: 'Default category updated', category: categoryDto(category) });
  })
);

router.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId: null } });
    if (!existing) throw ApiError.notFound('Default category not found');
    await prisma.category.delete({ where: { id: existing.id } });
    res.json({ message: 'Default category removed. Existing transactions are kept without a category.' });
  })
);

router.get(
  '/system',
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - started;
    const memory = process.memoryUsage();
    res.json({
      status: 'operational',
      uptimeSeconds: Math.round(process.uptime()),
      database: { status: 'connected', latencyMs: latency, provider: 'PostgreSQL', orm: 'Prisma' },
      runtime: {
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
        environment: env.nodeEnv,
        memoryUsedMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      integrations: {
        email: env.emailConfigured ? 'configured' : 'console mode',
        google: env.googleConfigured ? 'configured' : 'disabled',
        ai: env.aiConfigured ? `configured (${env.ai.model})` : 'rule engine',
      },
      time: new Date().toISOString(),
    });
  })
);

export default router;
