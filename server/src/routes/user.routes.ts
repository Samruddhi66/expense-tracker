import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { hashPassword, passwordStrengthIssues, verifyPassword } from '../lib/password.js';
import { publicUser, transactionDto, categoryDto, budgetDto, goalDto } from '../lib/serializers.js';
import { env } from '../config/env.js';
import { revokeAllRefreshTokens } from '../lib/tokens.js';

const router = Router();
router.use(requireAuth);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .superRefine((value, ctx) => {
    const issues = passwordStrengthIssues(value);
    if (issues.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Include ${issues.join(', ')}` });
  });

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: currentUserId(req) },
      include: { settings: true },
    });
    if (!user) throw ApiError.notFound('Account not found');
    res.json({ user: publicUser(user, user.settings) });
  })
);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2, 'Enter your name').max(80).optional(),
        avatarUrl: z.string().trim().url('Enter a valid image URL').max(500).nullable().optional(),
      }),
      req.body
    );
    const user = await prisma.user.update({
      where: { id: currentUserId(req) },
      data: { ...(body.name ? { name: body.name } : {}), ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}) },
      include: { settings: true },
    });
    res.json({ message: 'Profile updated', user: publicUser(user, user.settings) });
  })
);

router.post(
  '/me/change-password',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordSchema }),
      req.body
    );
    const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
    if (!user) throw ApiError.notFound('Account not found');
    if (!user.passwordHash) throw ApiError.badRequest('This account signs in with Google and has no password yet');
    const valid = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!valid) throw ApiError.badRequest('Your current password is incorrect');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    await revokeAllRefreshTokens(user.id);
    res.json({ message: 'Password updated. Please sign in again on your other devices.' });
  })
);

router.get(
  '/me/settings',
  asyncHandler(async (req, res) => {
    const settings =
      (await prisma.userSettings.findUnique({ where: { userId: currentUserId(req) } })) ??
      (await prisma.userSettings.create({ data: { userId: currentUserId(req) } }));
    res.json({ settings });
  })
);

router.patch(
  '/me/settings',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        currency: z.string().trim().toUpperCase().length(3).optional(),
        locale: z.string().trim().min(2).max(10).optional(),
        theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']).optional(),
        notifyBudgetAlerts: z.boolean().optional(),
        notifyBillReminders: z.boolean().optional(),
        notifySavings: z.boolean().optional(),
        notifyMonthlySummary: z.boolean().optional(),
        weekStartsOn: z.number().int().min(0).max(6).optional(),
      }),
      req.body
    );
    const userId = currentUserId(req);
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: body,
      create: { userId, ...body },
    });
    res.json({ message: 'Settings saved', settings });
  })
);

// Full personal data export (GDPR style).
router.get(
  '/me/export',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        transactions: { include: { category: true }, orderBy: { date: 'desc' } },
        categories: true,
        budgets: { include: { category: true } },
        goals: { include: { contributions: true } },
        recurring: { include: { category: true } },
        notifications: { orderBy: { createdAt: 'desc' }, take: 500 },
        aiInsights: { orderBy: { createdAt: 'desc' }, take: 200 },
      },
    });
    if (!user) throw ApiError.notFound('Account not found');
    const payload = {
      exportedAt: new Date().toISOString(),
      account: publicUser(user, user.settings),
      transactions: user.transactions.map(transactionDto),
      customCategories: user.categories.map(categoryDto),
      budgets: user.budgets.map(budgetDto),
      savingsGoals: user.goals.map(goalDto),
      recurringTransactions: user.recurring.map((r) => ({
        id: r.id,
        description: r.description,
        amount: Number(r.amount),
        type: r.type,
        frequency: r.frequency,
        interval: r.interval,
        nextRunDate: r.nextRunDate,
        category: r.category?.name ?? null,
      })),
      notifications: user.notifications,
      aiInsights: user.aiInsights,
    };
    res.setHeader('Content-Disposition', `attachment; filename="expense-tracker-data-${userId.slice(0, 8)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(payload, null, 2));
  })
);

router.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ password: z.string().optional(), confirm: z.literal('DELETE', {
        errorMap: () => ({ message: 'Type DELETE to confirm account deletion' }),
      }) }),
      req.body
    );
    const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
    if (!user) throw ApiError.notFound('Account not found');
    if (user.passwordHash) {
      const valid = await verifyPassword(body.password ?? '', user.passwordHash);
      if (!valid) throw ApiError.badRequest('Enter your password to delete your account');
    }
    if (user.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) throw ApiError.badRequest('The last administrator account cannot be deleted');
    }
    await prisma.user.delete({ where: { id: user.id } });
    res.clearCookie(env.refreshCookieName, { path: '/api/auth' });
    res.json({ message: 'Your account and all associated data have been deleted' });
  })
);

export default router;
