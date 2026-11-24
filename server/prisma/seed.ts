import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { env } from '../src/config/env.js';
import { Prisma } from '@prisma/client';

type SeedCategory = { name: string; type: 'INCOME' | 'EXPENSE'; icon: string; color: string };

const expenseCategories: SeedCategory[] = [
  { name: 'Food & Dining', type: 'EXPENSE', icon: 'UtensilsCrossed', color: '#F97316' },
  { name: 'Groceries', type: 'EXPENSE', icon: 'ShoppingBasket', color: '#22C55E' },
  { name: 'Transport', type: 'EXPENSE', icon: 'Car', color: '#3B82F6' },
  { name: 'Housing & Rent', type: 'EXPENSE', icon: 'Home', color: '#8B5CF6' },
  { name: 'Utilities', type: 'EXPENSE', icon: 'Zap', color: '#EAB308' },
  { name: 'Shopping', type: 'EXPENSE', icon: 'ShoppingBag', color: '#EC4899' },
  { name: 'Health', type: 'EXPENSE', icon: 'HeartPulse', color: '#EF4444' },
  { name: 'Entertainment', type: 'EXPENSE', icon: 'Clapperboard', color: '#06B6D4' },
  { name: 'Education', type: 'EXPENSE', icon: 'GraduationCap', color: '#6366F1' },
  { name: 'Travel', type: 'EXPENSE', icon: 'Plane', color: '#14B8A6' },
  { name: 'Subscriptions', type: 'EXPENSE', icon: 'Repeat', color: '#A855F7' },
  { name: 'Other', type: 'EXPENSE', icon: 'Tag', color: '#94A3B8' },
];

const incomeCategories: SeedCategory[] = [
  { name: 'Salary', type: 'INCOME', icon: 'Wallet', color: '#10B981' },
  { name: 'Freelance', type: 'INCOME', icon: 'Laptop', color: '#0EA5E9' },
  { name: 'Business', type: 'INCOME', icon: 'Briefcase', color: '#8B5CF6' },
  { name: 'Investments', type: 'INCOME', icon: 'TrendingUp', color: '#F59E0B' },
  { name: 'Gifts', type: 'INCOME', icon: 'Gift', color: '#EC4899' },
  { name: 'Other Income', type: 'INCOME', icon: 'PlusCircle', color: '#64748B' },
];

async function main() {
  for (const category of [...expenseCategories, ...incomeCategories]) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, name: category.name, type: category.type },
    });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { icon: category.icon, color: category.color, isSystem: true },
      });
    } else {
      await prisma.category.create({
        data: { ...category, isSystem: true, userId: null },
      });
    }
  }
  console.info(`✓ System categories ready (${expenseCategories.length + incomeCategories.length})`);

  const passwordHash = await hashPassword(env.admin.password);
  const admin = await prisma.user.upsert({
    where: { email: env.admin.email.toLowerCase() },
    update: { role: 'ADMIN', emailVerified: true, isActive: true, passwordHash },
    create: {
      name: env.admin.name,
      email: env.admin.email.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      emailVerified: true,
      emailVerifiedAt: new Date(),
      settings: { create: {} },
    },
  });
  console.info(`✓ Admin account: ${admin.email}`);

  const users = await prisma.user.findMany({ where: { settings: null }, select: { id: true } });
  for (const user of users) {
    await prisma.userSettings.create({ data: { userId: user.id } });
  }
  console.info('✓ User settings backfilled');
}

main()
  .catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
