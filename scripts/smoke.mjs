#!/usr/bin/env node
/**
 * End-to-end API smoke test. Run with the API on :4000 and a migrated database:
 *   node scripts/smoke.mjs
 * Exercises auth, transactions, budgets, goals, recurring, analytics, exports,
 * AI, notifications, settings and admin/authorization.
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000/api';
let cookie = '';
let failures = 0;
const results = [];

function log(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    if (c.startsWith('et_refresh=')) cookie = c.split(';')[0];
  }
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, type };
}

const email = `smoke.${Date.now()}@example.com`;
const password = 'StrongPass123';

// 1. Signup + verification
const signup = await call('POST', '/auth/signup', { name: 'Smoke Tester', email, password });
log('Signup creates an account', signup.status === 201, `status ${signup.status}`);
const verifyLink = signup.data?.devVerificationUrl;
log('Signup returns a development verification link', Boolean(verifyLink));
let verifyToken = '';
if (verifyLink) verifyToken = new URL(verifyLink).searchParams.get('token') ?? '';

const loginBeforeVerify = await call('POST', '/auth/login', { email, password });
log('Login blocked before email verification', loginBeforeVerify.status === 403, loginBeforeVerify.data?.error?.code);

const verify = await call('POST', '/auth/verify-email', { token: verifyToken });
log('Email verification succeeds', verify.status === 200);

const login = await call('POST', '/auth/login', { email, password });
log('Login returns an access token', login.status === 200 && Boolean(login.data?.accessToken));
const token = login.data?.accessToken;

const badLogin = await call('POST', '/auth/login', { email, password: 'WrongPass123' });
log('Wrong password is rejected', badLogin.status === 401);

const weakSignup = await call('POST', '/auth/signup', { name: 'Weak', email: `weak.${Date.now()}@example.com`, password: 'short' });
log('Weak passwords are rejected', weakSignup.status === 400 && Boolean(weakSignup.data?.error?.details?.password));

const me = await call('GET', '/auth/me', undefined, token);
log('Authenticated profile loads', me.status === 200 && me.data?.user?.email === email);
log('New accounts are not admins', me.data?.user?.role === 'USER');

const noAuth = await call('GET', '/transactions');
log('Protected routes require a token', noAuth.status === 401);

// Refresh cookie flow
const refreshed = await call('POST', '/auth/refresh');
log('Refresh token cookie issues a new session', refreshed.status === 200 && Boolean(refreshed.data?.accessToken));
const token2 = refreshed.data?.accessToken ?? token;

// 2. Categories
const cats = await call('GET', '/categories', undefined, token2);
const expenseCat = cats.data?.categories?.find((c) => c.type === 'EXPENSE' && c.isSystem);
const incomeCat = cats.data?.categories?.find((c) => c.type === 'INCOME' && c.isSystem);
log('Default categories are available', Boolean(expenseCat && incomeCat), `${cats.data?.categories?.length} categories`);

const customCat = await call('POST', '/categories', { name: 'Coffee Runs', type: 'EXPENSE', icon: 'Coffee', color: '#a855f7' }, token2);
log('Custom category creation works', customCat.status === 201, customCat.data?.category?.name);
const customCatId = customCat.data?.category?.id;

// 3. Transactions
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const incomeTx = await call('POST', '/transactions', {
  type: 'INCOME', amount: 50000, description: 'Monthly salary', categoryId: incomeCat?.id, paymentMethod: 'BANK', date: iso(today),
}, token2);
log('Income transaction is created', incomeTx.status === 201 && incomeTx.data?.transaction?.amount === 50000);

const expenseTx = await call('POST', '/transactions', {
  type: 'EXPENSE', amount: 1200, description: 'Team lunch', categoryId: expenseCat?.id, paymentMethod: 'UPI', date: iso(today),
}, token2);
log('Expense transaction is created', expenseTx.status === 201);
const expenseId = expenseTx.data?.transaction?.id;

const customTx = await call('POST', '/transactions', {
  type: 'EXPENSE', amount: 300, description: 'Flat white', categoryId: customCatId, paymentMethod: 'CARD', date: iso(today),
}, token2);
log('Transaction with custom category works', customTx.status === 201);

const invalidAmount = await call('POST', '/transactions', { type: 'EXPENSE', amount: -5, description: 'Bad' }, token2);
log('Negative amounts are rejected', invalidAmount.status === 400);

const wrongType = await call('POST', '/transactions', { type: 'EXPENSE', amount: 10, description: 'Mismatch', categoryId: incomeCat?.id }, token2);
log('Category/type mismatch is rejected', wrongType.status === 400);

const edited = await call('PATCH', `/transactions/${expenseId}`, { amount: 1500, description: 'Team lunch (updated)' }, token2);
log('Transaction editing works', edited.status === 200 && edited.data?.transaction?.amount === 1500);

const list = await call('GET', '/transactions?search=lunch&limit=5', undefined, token2);
log('Search and pagination work', list.status === 200 && list.data?.transactions?.length === 1 && list.data?.summary?.expense === 1500);

const filtered = await call('GET', '/transactions?type=INCOME', undefined, token2);
log('Type filter works', filtered.data?.transactions?.every((t) => t.type === 'INCOME'));

// 4. Dashboard
const dash = await call('GET', '/dashboard', undefined, token2);
log('Dashboard totals are calculated from transactions',
  dash.status === 200 && dash.data?.totals?.income === 50000 && dash.data?.totals?.expenses === 1800,
  `income ${dash.data?.totals?.income}, expense ${dash.data?.totals?.expenses}`);
log('Dashboard charts contain weekly and monthly series',
  dash.data?.charts?.weeklyExpense?.length === 7 && dash.data?.charts?.monthlyExpense?.length === 6);
log('Category pie reflects expenses', dash.data?.charts?.categoryPie?.length >= 1);
log('Recent transactions are included', dash.data?.recentTransactions?.length >= 2);

// 5. Budgets
const budget = await call('POST', '/budgets', { period: 'MONTHLY', amount: 2000, categoryId: expenseCat?.id, name: 'Dining budget' }, token2);
log('Budget can be created', budget.status === 201);
const dupe = await call('POST', '/budgets', { period: 'MONTHLY', amount: 3000, categoryId: expenseCat?.id }, token2);
log('Duplicate budget is rejected', dupe.status === 409);
const budgets = await call('GET', '/budgets', undefined, token2);
const dining = budgets.data?.budgets?.find((b) => b.name === 'Dining budget');
log('Budget progress is computed', dining?.spent === 1500 && dining?.percentage === 75, `${dining?.spent}/${dining?.amount}`);
const overallBudget = await call('POST', '/budgets', { period: 'MONTHLY', amount: 1000 }, token2);
log('Overall budget works', overallBudget.status === 201);
const notificationsAfterBudget = await call('GET', '/notifications', undefined, token2);
log('Budget alerts generate notifications',
  notificationsAfterBudget.data?.notifications?.some((n) => n.type === 'BUDGET_ALERT'),
  `${notificationsAfterBudget.data?.unread} unread`);

// 6. Savings goals
const futureDate = iso(new Date(Date.now() + 90 * 86400000));
const goal = await call('POST', '/goals', { name: 'New laptop', targetAmount: 80000, targetDate: futureDate }, token2);
log('Savings goal can be created', goal.status === 201);
const goalId = goal.data?.goal?.id;
const contribution = await call('POST', `/goals/${goalId}/contributions`, { amount: 20000, note: 'First deposit' }, token2);
log('Contribution updates goal progress', contribution.status === 201 && contribution.data?.goal?.progress === 25);
const goals = await call('GET', '/goals', undefined, token2);
log('Goal totals aggregate contributions', goals.data?.summary?.savedTotal === 20000);

// 7. Recurring
const recurring = await call('POST', '/recurring', {
  type: 'EXPENSE', amount: 499, description: 'Streaming subscription', categoryId: expenseCat?.id,
  paymentMethod: 'CARD', frequency: 'MONTHLY', startDate: iso(today),
}, token2);
log('Recurring transaction can be created', recurring.status === 201);
const processed = await call('POST', '/recurring/process', undefined, token2);
log('Recurring processing creates due transactions', processed.status === 200 && processed.data?.created >= 1, `${processed.data?.created} created`);
const recurringList = await call('GET', '/recurring', undefined, token2);
log('Recurring list shows next run', recurringList.data?.recurring?.length === 1 && recurringList.data?.recurring?.[0]?.nextRunDate);

// 8. Analytics + exports
const analytics = await call('GET', '/analytics?period=monthly', undefined, token2);
log('Monthly analytics load', analytics.status === 200 && analytics.data?.series?.length === 12);
log('Analytics category breakdown is present', Array.isArray(analytics.data?.categoryBreakdown));
const csv = await call('GET', '/analytics/export?period=monthly&format=csv', undefined, token2);
log('CSV export returns a csv file', csv.status === 200 && csv.type.includes('text/csv') && csv.data.includes('Transactions'));
const pdf = await call('GET', '/analytics/export?period=monthly&format=pdf', undefined, token2);
log('PDF export returns a pdf document', pdf.status === 200 && pdf.type.includes('application/pdf'), `${(pdf.data?.length ?? 0)} bytes`);

// 9. AI assistant (rule engine fallback)
const insight = await call('POST', '/ai/insights', { type: 'MONTHLY_SUMMARY' }, token2);
log('AI monthly summary is generated', insight.status === 201 && insight.data?.insight?.content?.length > 50, insight.data?.insight?.source);
const chat = await call('POST', '/ai/chat', { message: 'Where did I spend the most this month?' }, token2);
log('AI chat answers from user data', chat.status === 200 && chat.data?.reply?.toLowerCase().includes('biggest spending'), chat.data?.source);
const insights = await call('GET', '/ai/insights', undefined, token2);
log('Insights are stored per user', insights.data?.insights?.length >= 2);

// 10. Notifications + settings
const marked = await call('POST', '/notifications/read-all', undefined, token2);
log('Notifications can be marked read', marked.status === 200);
const settings = await call('PATCH', '/users/me/settings', { currency: 'USD', theme: 'DARK', notifySavings: false }, token2);
log('Settings update persists', settings.status === 200 && settings.data?.settings?.currency === 'USD');
const profile = await call('PATCH', '/users/me', { name: 'Smoke Tester Jr' }, token2);
log('Profile update works', profile.status === 200 && profile.data?.user?.name === 'Smoke Tester Jr');
const changed = await call('POST', '/users/me/change-password', { currentPassword: password, newPassword: 'NewStrongPass456' }, token2);
log('Password change works', changed.status === 200);
const relogin = await call('POST', '/auth/login', { email, password: 'NewStrongPass456' });
log('Login works with the new password', relogin.status === 200);
const exportData = await call('GET', '/users/me/export', undefined, relogin.data?.accessToken);
log('Personal data export includes transactions', exportData.status === 200 && exportData.data?.transactions?.length >= 3);

// 11. Authorization boundaries
const otherEmail = `other.${Date.now()}@example.com`;
const otherSignup = await call('POST', '/auth/signup', { name: 'Other User', email: otherEmail, password });
const otherToken = new URL(otherSignup.data?.devVerificationUrl ?? 'http://x?token=x').searchParams.get('token');
await call('POST', '/auth/verify-email', { token: otherToken });
const otherLogin = await call('POST', '/auth/login', { email: otherEmail, password });
const otherAccess = otherLogin.data?.accessToken;
const foreignTx = await call('GET', `/transactions/${expenseId}`, undefined, otherAccess);
log('Users cannot read another user\'s transaction', foreignTx.status === 404);
const foreignDelete = await call('DELETE', `/transactions/${expenseId}`, undefined, otherAccess);
log('Users cannot delete another user\'s transaction', foreignDelete.status === 404);
const otherDash = await call('GET', '/dashboard', undefined, otherAccess);
log('New users start with zero balances', otherDash.data?.totals?.income === 0 && otherDash.data?.totals?.expenses === 0);
const forbiddenAdmin = await call('GET', '/admin/stats', undefined, otherAccess);
log('Admin routes reject normal users', forbiddenAdmin.status === 403);

// 12. Admin
const adminLogin = await call('POST', '/auth/login', { email: 'admin@expense-tracker.app', password: 'Admin@12345' });
log('Seeded admin can sign in', adminLogin.status === 200);
const adminToken = adminLogin.data?.accessToken;
const stats = await call('GET', '/admin/stats', undefined, adminToken);
log('Admin stats load', stats.status === 200 && stats.data?.totals?.users >= 2, `${stats.data?.totals?.users} users`);
const users = await call('GET', '/admin/users?search=smoke', undefined, adminToken);
log('Admin user search works', users.status === 200 && users.data?.users?.length >= 1);
const system = await call('GET', '/admin/system', undefined, adminToken);
log('Admin system monitoring works', system.status === 200 && system.data?.database?.status === 'connected');
const suspend = await call('PATCH', `/admin/users/${me.data?.user?.id}`, { isActive: false }, adminToken);
log('Admin can suspend a user', suspend.status === 200);
const suspendedLogin = await call('POST', '/auth/login', { email, password: 'NewStrongPass456' });
log('Suspended users cannot sign in', suspendedLogin.status === 403);
const reactivate = await call('PATCH', `/admin/users/${me.data?.user?.id}`, { isActive: true }, adminToken);
log('Admin can reactivate a user', reactivate.status === 200);

const logout = await call('POST', '/auth/logout', undefined, adminToken);
log('Logout clears the session', logout.status === 200);

// 13. Account deletion cascades
const deleteAccount = await call('DELETE', '/users/me', { password, confirm: 'DELETE' }, otherAccess);
log('Account deletion works', deleteAccount.status === 200);
const deletedLogin = await call('POST', '/auth/login', { email: otherEmail, password });
log('Deleted account cannot sign in', deletedLogin.status === 401);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (failures > 0) {
  console.log('\nFailures:');
  for (const r of results.filter((r) => !r.ok)) console.log(` - ${r.name}: ${r.detail}`);
  process.exit(1);
}
