import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';
import { addDays, isoDate, toDateOnly } from '../src/lib/dates.js';

let app: Express;
let adminToken = '';

type Session = { token: string; email: string; userId: string; categoryId: string };

async function createVerifiedUser(prefix: string): Promise<Session> {
  const email = `${prefix}.${Date.now()}@example.com`;
  const password = 'StrongPass123';
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ name: `${prefix} tester`, email, password })
    .expect(201);
  const verificationUrl: string = signup.body.devVerificationUrl;
  const token = new URL(verificationUrl).searchParams.get('token')!;
  await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
  const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  const categories = await request(app)
    .get('/api/categories')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .expect(200);
  const expenseCategory = categories.body.categories.find(
    (c: { type: string; name: string }) => c.type === 'EXPENSE' && c.name === 'Food & Dining'
  );
  return {
    token: login.body.accessToken,
    email,
    userId: login.body.user.id,
    categoryId: expenseCategory.id,
  };
}

beforeAll(async () => {
  app = createApp();

  for (const category of [
    { name: 'Food & Dining', type: 'EXPENSE' as const, icon: 'UtensilsCrossed', color: '#F97316' },
    { name: 'Salary', type: 'INCOME' as const, icon: 'Wallet', color: '#10B981' },
    { name: 'Shopping', type: 'EXPENSE' as const, icon: 'ShoppingBag', color: '#EC4899' },
  ]) {
    await prisma.category.create({ data: { ...category, isSystem: true, userId: null } });
  }

  await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: 'admin@test.local',
      passwordHash: await hashPassword('Admin@12345'),
      role: 'ADMIN',
      emailVerified: true,
      settings: { create: {} },
    },
  });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: 'Admin@12345' })
    .expect(200);
  adminToken = login.body.accessToken;
});

describe('authentication', () => {
  it('serves health and public config', async () => {
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.status).toBe('ok');
    const config = await request(app).get('/api/config').expect(200);
    expect(config.body).toHaveProperty('googleClientId');
  });

  it('rejects weak passwords with field details', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Weak', email: `weak${Date.now()}@example.com`, password: 'short' })
      .expect(400);
    expect(res.body.error.details.password).toBeTruthy();
  });

  it('requires verification before login, then issues a session', async () => {
    const email = `flow.${Date.now()}@example.com`;
    const password = 'StrongPass123';
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Flow Tester', email, password })
      .expect(201);
    expect(signup.body.devVerificationUrl).toBeTruthy();

    const blocked = await request(app).post('/api/auth/login').send({ email, password }).expect(403);
    expect(blocked.body.error.code).toBe('email_not_verified');

    const verifyToken = new URL(signup.body.devVerificationUrl).searchParams.get('token');
    await request(app).post('/api/auth/verify-email').send({ token: verifyToken }).expect(200);

    const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.user.emailVerified).toBe(true);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.user.email).toBe(email);
  });

  it('rotates refresh cookies and blocks unauthenticated access', async () => {
    const agent = request.agent(app);
    const email = `refresh.${Date.now()}@example.com`;
    await request(app).post('/api/auth/signup').send({ name: 'Refresh User', email, password: 'StrongPass123' });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

    await agent.post('/api/auth/login').send({ email, password: 'StrongPass123' }).expect(200);
    const refreshed = await agent.post('/api/auth/refresh').expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    await request(app).get('/api/transactions').expect(401);
    await agent.post('/api/auth/logout').expect(200);
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('supports password reset with a single-use token', async () => {
    const session = await createVerifiedUser('reset');
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: session.email }).expect(200);
    const token = new URL(forgot.body.devResetUrl).searchParams.get('token');

    await request(app).post('/api/auth/reset-password').send({ token, password: 'BrandNewPass456' }).expect(200);
    await request(app).post('/api/auth/login').send({ email: session.email, password: 'StrongPass123' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: session.email, password: 'BrandNewPass456' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token, password: 'AnotherPass789' }).expect(400);
  });
});

describe('transactions and dashboard', () => {
  it('creates transactions, validates input and computes totals', async () => {
    const user = await createVerifiedUser('tx');
    const today = isoDate(toDateOnly(new Date()));

    const salary = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'INCOME', amount: 50000, description: 'Salary', date: today, paymentMethod: 'BANK' })
      .expect(201);
    expect(salary.body.transaction.amount).toBe(50000);

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: 1200, description: 'Lunch', categoryId: user.categoryId, date: today })
      .expect(201);

    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: -10, description: 'Bad', date: today })
      .expect(400);

    const dashboard = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(dashboard.body.totals.income).toBe(50000);
    expect(dashboard.body.totals.expenses).toBe(1200);
    expect(dashboard.body.totals.balance).toBe(48800);
    expect(dashboard.body.charts.weeklyExpense).toHaveLength(7);
    expect(dashboard.body.charts.monthlyExpense).toHaveLength(6);

    const search = await request(app)
      .get('/api/transactions?search=lunch&type=EXPENSE')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(search.body.transactions).toHaveLength(1);
    expect(search.body.summary.expense).toBe(1200);
  });

  it('keeps each user\'s data private', async () => {
    const alice = await createVerifiedUser('alice');
    const bob = await createVerifiedUser('bob');
    const tx = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ type: 'EXPENSE', amount: 900, description: 'Alice only', date: isoDate(toDateOnly(new Date())) })
      .expect(201);

    await request(app)
      .get(`/api/transactions/${tx.body.transaction.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);
    await request(app)
      .delete(`/api/transactions/${tx.body.transaction.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);

    const bobDashboard = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(bobDashboard.body.totals.income).toBe(0);
    expect(bobDashboard.body.totals.expenses).toBe(0);
  });

  it('edits and deletes a transaction', async () => {
    const user = await createVerifiedUser('edit');
    const created = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: 100, description: 'Coffee', date: isoDate(toDateOnly(new Date())) })
      .expect(201);

    const updated = await request(app)
      .patch(`/api/transactions/${created.body.transaction.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amount: 250, description: 'Coffee and cake' })
      .expect(200);
    expect(updated.body.transaction.amount).toBe(250);

    await request(app)
      .delete(`/api/transactions/${created.body.transaction.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    await request(app)
      .get(`/api/transactions/${created.body.transaction.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(404);
  });
});

describe('budgets, goals and recurring transactions', () => {
  it('tracks budget spending and raises alerts', async () => {
    const user = await createVerifiedUser('budget');
    const today = isoDate(toDateOnly(new Date()));
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: 850, description: 'Dinner', categoryId: user.categoryId, date: today })
      .expect(201);

    const budget = await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ period: 'MONTHLY', amount: 1000, categoryId: user.categoryId, name: 'Food budget' })
      .expect(201);
    expect(budget.body.budget.amount).toBe(1000);

    await request(app)
      .post('/api/budgets')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ period: 'MONTHLY', amount: 2000, categoryId: user.categoryId })
      .expect(409);

    const list = await request(app)
      .get('/api/budgets')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const food = list.body.budgets.find((b: { id: string }) => b.id === budget.body.budget.id);
    expect(food.spent).toBe(850);
    expect(food.remaining).toBe(150);
    expect(food.percentage).toBe(85);
    expect(food.status).toBe('warning');

    const notifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(notifications.body.notifications.some((n: { type: string }) => n.type === 'BUDGET_ALERT')).toBe(true);
  });

  it('adds goal contributions and completes goals', async () => {
    const user = await createVerifiedUser('goal');
    const target = isoDate(addDays(toDateOnly(new Date()), 90));
    const goal = await request(app)
      .post('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Laptop', targetAmount: 1000, targetDate: target })
      .expect(201);

    const first = await request(app)
      .post(`/api/goals/${goal.body.goal.id}/contributions`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amount: 400 })
      .expect(201);
    expect(first.body.goal.progress).toBe(40);

    const second = await request(app)
      .post(`/api/goals/${goal.body.goal.id}/contributions`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ amount: 600 })
      .expect(201);
    expect(second.body.goal.savedAmount).toBe(1000);
    expect(second.body.goal.status).toBe('COMPLETED');

    const list = await request(app)
      .get('/api/goals')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(list.body.summary.savedTotal).toBe(1000);
  });

  it('materialises due recurring transactions exactly once', async () => {
    const user = await createVerifiedUser('recurring');
    const start = isoDate(toDateOnly(new Date()));
    const created = await request(app)
      .post('/api/recurring')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        type: 'EXPENSE', amount: 499, description: 'Streaming', frequency: 'MONTHLY',
        startDate: start, paymentMethod: 'CARD',
      })
      .expect(201);
    expect(created.body.recurring.isActive).toBe(true);

    const run = await request(app)
      .post('/api/recurring/process')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(run.body.created).toBe(1);

    const secondRun = await request(app)
      .post('/api/recurring/process')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(secondRun.body.created).toBe(0);

    const transactions = await request(app)
      .get('/api/transactions?search=Streaming')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(transactions.body.transactions).toHaveLength(1);
  });
});

describe('analytics, AI and exports', () => {
  it('builds analytics, CSV and PDF exports', async () => {
    const user = await createVerifiedUser('analytics');
    const today = isoDate(toDateOnly(new Date()));
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'INCOME', amount: 3000, description: 'Project', date: today, paymentMethod: 'BANK' })
      .expect(201);
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: 1200, description: 'Groceries', categoryId: user.categoryId, date: today })
      .expect(201);

    const monthly = await request(app)
      .get('/api/analytics?period=monthly')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(monthly.body.series).toHaveLength(12);
    expect(monthly.body.summary.income).toBe(3000);
    expect(monthly.body.summary.expense).toBe(1200);
    expect(monthly.body.summary.net).toBe(1800);
    expect(monthly.body.categoryBreakdown[0].name).toBe('Food & Dining');

    const daily = await request(app)
      .get('/api/analytics?period=daily')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(daily.body.series).toHaveLength(30);

    const csv = await request(app)
      .get('/api/analytics/export?period=monthly&format=csv')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Groceries');

    const pdf = await request(app)
      .get('/api/analytics/export?period=monthly&format=pdf')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.length).toBeGreaterThan(1000);
  });

  it('answers AI questions from the authenticated user\'s data', async () => {
    const user = await createVerifiedUser('ai');
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: 5000, description: 'Big purchase', categoryId: user.categoryId, date: isoDate(toDateOnly(new Date())) })
      .expect(201);

    const chat = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ message: 'Where did I spend the most this month?' })
      .expect(200);
    expect(chat.body.reply).toContain('Food & Dining');
    expect(chat.body.source).toBe('rules');

    const insight = await request(app)
      .post('/api/ai/insights')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'MONTHLY_SUMMARY' })
      .expect(201);
    expect(insight.body.insight.content.length).toBeGreaterThan(50);
    expect(insight.body.insight.userId).toBe(user.userId);
  });
});

describe('settings, categories and admin', () => {
  it('persists settings, validates currency and exports personal data', async () => {
    const user = await createVerifiedUser('settings');
    await request(app)
      .patch('/api/users/me/settings')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currency: 'USD', theme: 'DARK', notifySavings: false })
      .expect(200);

    const settings = await request(app)
      .get('/api/users/me/settings')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(settings.body.settings.currency).toBe('USD');
    expect(settings.body.settings.theme).toBe('DARK');
    expect(settings.body.settings.notifySavings).toBe(false);

    const invalid = await request(app)
      .patch('/api/users/me/settings')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ currency: 'TOOLONG' })
      .expect(400);
    expect(invalid.status).toBe(400);

    const exported = await request(app)
      .get('/api/users/me/export')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(exported.body.account.email).toBe(user.email);
    expect(Array.isArray(exported.body.transactions)).toBe(true);
  });

  it('manages custom categories and protects defaults', async () => {
    const user = await createVerifiedUser('cat');
    const created = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Pets', type: 'EXPENSE', icon: 'Tag', color: '#14B8A6' })
      .expect(201);

    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Pets', type: 'EXPENSE' })
      .expect(409);

    await request(app)
      .patch(`/api/categories/${created.body.category.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Pet care' })
      .expect(200);

    await request(app)
      .patch(`/api/categories/${user.categoryId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ name: 'Hacked' })
      .expect(403);

    await request(app)
      .delete(`/api/categories/${created.body.category.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
  });

  it('enforces admin authorization and exposes platform stats', async () => {
    const user = await createVerifiedUser('admincheck');
    await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(403);

    const stats = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stats.body.totals.users).toBeGreaterThan(0);
    expect(stats.body.signupSeries).toHaveLength(14);

    const system = await request(app)
      .get('/api/admin/system')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(system.body.database.status).toBe('connected');

    await request(app)
      .patch(`/api/admin/users/${user.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'StrongPass123' })
      .expect(403);
  });

  it('deletes accounts and cascades their data', async () => {
    const user = await createVerifiedUser('delete');
    const today = isoDate(toDateOnly(new Date()));
    await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ type: 'EXPENSE', amount: 250, description: 'Temp', date: today })
      .expect(201);

    await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ password: 'StrongPass123', confirm: 'DELETE' })
      .expect(200);

    expect(await prisma.user.findUnique({ where: { id: user.userId } })).toBeNull();
    expect(await prisma.transaction.count({ where: { userId: user.userId } })).toBe(0);
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'StrongPass123' })
      .expect(401);
  });
});
