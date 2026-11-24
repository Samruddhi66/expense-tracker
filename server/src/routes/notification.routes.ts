import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const query = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        unreadOnly: z.enum(['true', 'false']).optional(),
        type: z.enum(['BUDGET_ALERT', 'BILL_REMINDER', 'SAVINGS', 'MONTHLY_SUMMARY', 'SYSTEM']).optional(),
      }),
      req.query
    );
    const where = {
      userId,
      ...(query.unreadOnly === 'true' ? { isRead: false } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [notifications, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    res.json({
      notifications,
      unread,
      pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
    });
  })
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await prisma.notification.count({ where: { userId: currentUserId(req), isRead: false } });
    res.json({ unread });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const notification = await prisma.notification.findFirst({ where: { id: req.params.id, userId } });
    if (!notification) throw ApiError.notFound('Notification not found');
    const updated = await prisma.notification.update({ where: { id: notification.id }, data: { isRead: true } });
    res.json({ message: 'Marked as read', notification: updated });
  })
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: currentUserId(req), isRead: false },
      data: { isRead: true },
    });
    res.json({ message: `${result.count} notification${result.count === 1 ? '' : 's'} marked as read`, count: result.count });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const notification = await prisma.notification.findFirst({ where: { id: req.params.id, userId } });
    if (!notification) throw ApiError.notFound('Notification not found');
    await prisma.notification.delete({ where: { id: notification.id } });
    res.json({ message: 'Notification deleted' });
  })
);

export default router;
