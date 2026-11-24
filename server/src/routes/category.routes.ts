import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, currentUserId } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { categoryDto } from '../lib/serializers.js';

const router = Router();
router.use(requireAuth);

const categoryBody = z.object({
  name: z.string().trim().min(2, 'Enter a category name').max(60),
  type: z.enum(['INCOME', 'EXPENSE']),
  icon: z.string().trim().min(1).max(40).default('Tag'),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, 'Pick a valid colour')
    .default('#7C3AED'),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const type = req.query.type;
    if (type && type !== 'INCOME' && type !== 'EXPENSE') throw ApiError.badRequest('Invalid category type');
    const categories = await prisma.category.findMany({
      where: {
        OR: [{ userId }, { userId: null }],
        ...(type ? { type: type as 'INCOME' | 'EXPENSE' } : {}),
      },
      include: { _count: { select: { transactions: { where: { userId } } } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    res.json({
      categories: categories.map((category) => ({
        ...categoryDto(category),
        transactionCount: category._count.transactions,
      })),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const body = parse(categoryBody, req.body);
    const duplicate = await prisma.category.findFirst({
      where: { userId, name: body.name, type: body.type },
    });
    if (duplicate) throw ApiError.conflict('You already have a category with this name');
    const category = await prisma.category.create({ data: { ...body, userId } });
    res.status(201).json({ message: 'Category created', category: categoryDto(category) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const body = parse(categoryBody.partial(), req.body);
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      const system = await prisma.category.findFirst({ where: { id: req.params.id, userId: null } });
      if (system) throw ApiError.forbidden('Default categories can only be changed by an administrator');
      throw ApiError.notFound('Category not found');
    }
    const category = await prisma.category.update({ where: { id: existing.id }, data: body });
    res.json({ message: 'Category updated', category: categoryDto(category) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = currentUserId(req);
    const existing = await prisma.category.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) {
      const system = await prisma.category.findFirst({ where: { id: req.params.id, userId: null } });
      if (system) throw ApiError.forbidden('Default categories can only be removed by an administrator');
      throw ApiError.notFound('Category not found');
    }
    await prisma.category.delete({ where: { id: existing.id } });
    res.json({ message: 'Category deleted. Its transactions are kept without a category.' });
  })
);

export default router;
