/**
 * Optional demo data: creates demo@expense-tracker.app / Demo@12345 with
 * three months of realistic transactions, budgets, goals and schedules.
 *
 *   npm run db:demo
 *
 * Safe to re-run: it replaces only the demo account's own data.
 */
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { addDays, addMonths, endOfMonth, startOfMonth, toDateOnly } from '../src/lib/dates.js';
import { evaluateBudgetAlerts } from '../src/services/alerts.js';

const DEMO_EMAIL = 'demo@expense-tracker.app';
const DEMO_PASSWORD = 'Demo@12345';

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } });
    console.info('Removed previous demo account');
  }

  const user = await prisma.user.create({
    data: {
      name: 'Ananya Sharma',
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      emailVerified: true,
      emailVerifiedAt: new Date(),
      settings: { create: { currency: 'INR', locale: 'en-IN' } },
      notifications: {
        create: {
          type: 'SYSTEM',
          title: 'Welcome to your demo account',
          message: 'This account is pre-filled with three months of sample data so you can explore every feature.',
        },
      },
    },
  });

  const categories = await prisma.category.findMany({ where: { userId: null } });
  const byName = (name: string) => categories.find((c) => c.name === name);
  const random = seeded(42);
  const today = toDateOnly(new Date());

  type Seed = { category: string; description: string; min: number; max: number; method: 'CASH' | 'UPI' | 'CARD' | 'BANK'; perMonth: number };
  const expenseSeeds: Seed[] = [
    { category: 'Food & Dining', description: 'Dinner at a restaurant', min: 450, max: 1400, method: 'UPI', perMonth: 4 },
    { category: 'Food & Dining', description: 'Coffee with friends', min: 180, max: 420, method: 'UPI', perMonth: 4 },
    { category: 'Groceries', description: 'Weekly groceries', min: 1200, max: 2600, method: 'CARD', perMonth: 3 },
    { category: 'Transport', description: 'Cab to work', min: 120, max: 480, method: 'UPI', perMonth: 6 },
    { category: 'Transport', description: 'Metro card recharge', min: 200, max: 500, method: 'CARD', perMonth: 1 },
    { category: 'Shopping', description: 'Online shopping', min: 700, max: 3400, method: 'CARD', perMonth: 2 },
    { category: 'Entertainment', description: 'Movie tickets', min: 350, max: 900, method: 'CARD', perMonth: 1 },
    { category: 'Health', description: 'Pharmacy', min: 200, max: 850, method: 'CASH', perMonth: 1 },
    { category: 'Utilities', description: 'Electricity bill', min: 900, max: 1600, method: 'BANK', perMonth: 1 },
    { category: 'Utilities', description: 'Internet bill', min: 799, max: 799, method: 'BANK', perMonth: 1 },
    { category: 'Subscriptions', description: 'Streaming subscription', min: 649, max: 649, method: 'CARD', perMonth: 1 },
    { category: 'Education', description: 'Online course', min: 999, max: 2499, method: 'CARD', perMonth: 0.5 },
  ];

  for (let monthOffset = -2; monthOffset <= 0; monthOffset += 1) {
    const monthStart = startOfMonth(addMonths(today, monthOffset));
    const monthEnd = endOfMonth(monthStart) > today && monthOffset === 0 ? today : endOfMonth(monthStart);

    // Salary + occasional freelance income
    await prisma.transaction.create({
      data: {
        userId: user.id,
        categoryId: byName('Salary')?.id,
        type: 'INCOME',
        amount: 85000,
        description: 'Monthly salary',
        paymentMethod: 'BANK',
        date: monthStart,
      },
    });
    if (monthOffset !== -1) {
      await prisma.transaction.create({
        data: {
          userId: user.id,
          categoryId: byName('Freelance')?.id,
          type: 'INCOME',
          amount: monthOffset === 0 ? 12000 : 18500,
          description: 'Freelance design project',
          paymentMethod: 'BANK',
          date: addDays(monthStart, 9),
        },
      });
    }

    // Rent every month
    await prisma.transaction.create({
      data: {
        userId: user.id,
        categoryId: byName('Housing & Rent')?.id,
        type: 'EXPENSE',
        amount: 24000,
        description: 'Apartment rent',
        paymentMethod: 'BANK',
        date: addDays(monthStart, 2),
      },
    });

    for (const seed of expenseSeeds) {
      const count = Math.floor(seed.perMonth) + (random() > 0.5 ? 1 : 0);
      for (let index = 0; index < count; index += 1) {
        const span = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);
        const date = addDays(monthStart, Math.floor(random() * Math.max(1, span)));
        if (date > monthEnd) continue;
        const amount = Math.round((seed.min + random() * (seed.max - seed.min)) / 10) * 10;
        await prisma.transaction.create({
          data: {
            userId: user.id,
            categoryId: byName(seed.category)?.id,
            type: 'EXPENSE',
            amount,
            description: seed.description,
            paymentMethod: seed.method,
            date,
          },
        });
      }
    }
  }

  // Budgets for the current month
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(monthStart);
  const budgets: Array<[string | null, number, string]> = [
    [null, 62000, 'Overall monthly budget'],
    ['Food & Dining', 9000, 'Dining out'],
    ['Groceries', 9000, 'Groceries'],
    ['Shopping', 7000, 'Shopping'],
    ['Transport', 5000, 'Transport'],
  ];
  for (const [categoryName, amount, name] of budgets) {
    await prisma.budget.create({
      data: {
        userId: user.id,
        categoryId: categoryName ? byName(categoryName)?.id ?? null : null,
        name,
        period: 'MONTHLY',
        amount,
        startDate: monthStart,
        endDate: monthEnd,
      },
    });
  }

  // Savings goals with contributions
  const emergency = await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: 'Emergency fund',
      description: 'Six months of essential expenses',
      targetAmount: 200000,
      targetDate: addMonths(today, 10),
      color: '#7C3AED',
    },
  });
  for (const [index, amount] of [20000, 20000, 20000].entries()) {
    await prisma.goalContribution.create({
      data: {
        goalId: emergency.id,
        userId: user.id,
        amount,
        note: 'Monthly transfer',
        date: addDays(startOfMonth(addMonths(today, -2 + index)), 4),
      },
    });
  }

  const trip = await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: 'Japan trip',
      description: 'Two weeks in Tokyo and Kyoto',
      targetAmount: 150000,
      targetDate: addMonths(today, 7),
      color: '#EC4899',
    },
  });
  for (const [index, amount] of [15000, 12000, 8000].entries()) {
    await prisma.goalContribution.create({
      data: {
        goalId: trip.id,
        userId: user.id,
        amount,
        note: 'Travel savings',
        date: addDays(startOfMonth(addMonths(today, -2 + index)), 12),
      },
    });
  }

  // Recurring schedules
  await prisma.recurringTransaction.create({
    data: {
      userId: user.id,
      categoryId: byName('Housing & Rent')?.id,
      type: 'EXPENSE',
      amount: 24000,
      description: 'Apartment rent',
      paymentMethod: 'BANK',
      frequency: 'MONTHLY',
      startDate: addMonths(monthStart, 1),
      nextRunDate: addMonths(monthStart, 1),
      reminderDays: 5,
    },
  });
  await prisma.recurringTransaction.create({
    data: {
      userId: user.id,
      categoryId: byName('Subscriptions')?.id,
      type: 'EXPENSE',
      amount: 649,
      description: 'Streaming subscription',
      paymentMethod: 'CARD',
      frequency: 'MONTHLY',
      startDate: addDays(today, 4),
      nextRunDate: addDays(today, 4),
      reminderDays: 3,
    },
  });
  await prisma.recurringTransaction.create({
    data: {
      userId: user.id,
      categoryId: byName('Salary')?.id,
      type: 'INCOME',
      amount: 85000,
      description: 'Monthly salary',
      paymentMethod: 'BANK',
      frequency: 'MONTHLY',
      startDate: addMonths(monthStart, 1),
      nextRunDate: addMonths(monthStart, 1),
    },
  });

  await evaluateBudgetAlerts(user.id);

  const totals = await prisma.transaction.aggregate({
    where: { userId: user.id },
    _sum: { amount: true },
    _count: true,
  });
  console.info(`✓ Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.info(`  ${totals._count} transactions seeded`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
