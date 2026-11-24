import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { money } from '../lib/http.js';
import { addMonths, monthRange, startOfMonth, toDateOnly } from '../lib/dates.js';
import { budgetProgressFor, budgetsOverlapping } from './budgets.js';

export type InsightKind = 'SPENDING_ANALYSIS' | 'MONTHLY_SUMMARY' | 'BUDGET_ADVICE';

export type FinancialContext = Awaited<ReturnType<typeof buildFinancialContext>>;

const fmt = (currency: string) => (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export async function buildFinancialContext(userId: string) {
  const { start, end, key } = monthRange();
  const previous = monthRange(
    `${new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).getUTCFullYear()}-${String(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)).getUTCMonth() + 1
    ).padStart(2, '0')}`
  );
  const trailingStart = startOfMonth(addMonths(start, -2));
  const today = toDateOnly(new Date());

  const [user, currentRows, previousAgg, allTime, budgets, goals, recent, recurring] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { settings: true } }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: start, lte: end } },
      include: { category: true },
      orderBy: { date: 'desc' },
    }),
    prisma.transaction.groupBy({
      by: ['type'],
      where: { userId, date: { gte: previous.start, lte: previous.end } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({ by: ['type'], where: { userId }, _sum: { amount: true } }),
    budgetsOverlapping(userId, start, end),
    prisma.savingsGoal.findMany({
      where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      include: { contributions: { select: { amount: true } } },
      orderBy: { targetDate: 'asc' },
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: true },
      orderBy: [{ date: 'desc' }],
      take: 25,
    }),
    prisma.recurringTransaction.findMany({
      where: { userId, isActive: true },
      orderBy: { nextRunDate: 'asc' },
      take: 10,
    }),
  ]);

  const currency = user.settings?.currency ?? 'INR';
  const format = fmt(currency);

  const income = money(currentRows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + Number(r.amount), 0));
  const expense = money(currentRows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + Number(r.amount), 0));
  const previousIncome = money(previousAgg.find((r) => r.type === 'INCOME')?._sum.amount);
  const previousExpense = money(previousAgg.find((r) => r.type === 'EXPENSE')?._sum.amount);
  const allIncome = money(allTime.find((r) => r.type === 'INCOME')?._sum.amount);
  const allExpense = money(allTime.find((r) => r.type === 'EXPENSE')?._sum.amount);

  const categoryTotals = new Map<string, { name: string; total: number; count: number }>();
  for (const row of currentRows.filter((r) => r.type === 'EXPENSE')) {
    const name = row.category?.name ?? 'Uncategorised';
    const entry = categoryTotals.get(name) ?? { name, total: 0, count: 0 };
    entry.total += Number(row.amount);
    entry.count += 1;
    categoryTotals.set(name, entry);
  }
  const categories = [...categoryTotals.values()]
    .map((c) => ({ ...c, total: money(c.total), share: expense > 0 ? Math.round((c.total / expense) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total);

  const budgetProgress = await budgetProgressFor(budgets, userId);
  const saved = goals.reduce((sum, goal) => sum + goal.contributions.reduce((s, c) => s + Number(c.amount), 0), 0);
  const target = goals.reduce((sum, goal) => sum + Number(goal.targetAmount), 0);

  const last3 = await prisma.transaction.groupBy({
    by: ['type'],
    where: { userId, date: { gte: trailingStart, lte: end } },
    _sum: { amount: true },
  });

  return {
    currency,
    format,
    today: today.toISOString().slice(0, 10),
    month: key,
    monthLabel: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    totals: {
      allTimeBalance: money(allIncome - allExpense),
      allTimeIncome: allIncome,
      allTimeExpenses: allExpense,
      newTransactions: 0,
    },
    currentMonth: {
      income,
      expense,
      savings: money(income - expense),
      savingsRate: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0,
      transactionCount: currentRows.length,
      expenseCount: currentRows.filter((r) => r.type === 'EXPENSE').length,
    },
    previousMonth: {
      income: previousIncome,
      expense: previousExpense,
      savings: money(previousIncome - previousExpense),
      expenseChange: previousExpense > 0 ? Math.round(((expense - previousExpense) / previousExpense) * 1000) / 10 : null,
    },
    last3Months: {
      income: money(last3.find((r) => r.type === 'INCOME')?._sum.amount),
      expense: money(last3.find((r) => r.type === 'EXPENSE')?._sum.amount),
    },
    categories: categories.slice(0, 10),
    budgets: budgetProgress.map((p) => ({
      name: p.budget.name ?? p.budget.category?.name ?? 'Overall budget',
      category: p.budget.category?.name ?? null,
      period: p.budget.period,
      limit: p.amount,
      spent: p.spent,
      remaining: p.remaining,
      percentage: p.percentage,
      status: p.status,
    })),
    savingsGoals: goals.map((goal) => {
      const goalSaved = money(goal.contributions.reduce((s, c) => s + Number(c.amount), 0));
      return {
        name: goal.name,
        target: money(goal.targetAmount),
        saved: goalSaved,
        progress: Number(goal.targetAmount) > 0 ? Math.round((goalSaved / Number(goal.targetAmount)) * 1000) / 10 : 0,
        targetDate: goal.targetDate.toISOString().slice(0, 10),
      };
    }),
    savingsTotals: { saved: money(saved), target: money(target) },
    recentTransactions: recent.slice(0, 15).map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      type: row.type,
      amount: money(row.amount),
      description: row.description,
      category: row.category?.name ?? 'Uncategorised',
      paymentMethod: row.paymentMethod,
    })),
    recurring: recurring.map((item) => ({
      description: item.description,
      amount: money(item.amount),
      type: item.type,
      frequency: item.frequency,
      nextRunDate: item.nextRunDate.toISOString().slice(0, 10),
    })),
  };
}

function suggestionsFrom(context: FinancialContext): string[] {
  const { format, currentMonth, categories, budgets, previousMonth, savingsGoals } = context;
  const tips: string[] = [];
  if (currentMonth.expense === 0 && currentMonth.income === 0) {
    return ['Add a few transactions this month so I can analyse your spending patterns.'];
  }
  const top = categories[0];
  if (top && top.share >= 30) {
    const target = Math.round((top.total * 0.9) / 10) * 10;
    tips.push(
      `Trim ${top.share}% of spending on ${top.name} by 10% — that frees up about ${format(top.total - target)} a month.`
    );
  }
  if (previousMonth.expenseChange !== null && previousMonth.expenseChange > 10) {
    tips.push(
      `Spending is up ${previousMonth.expenseChange}% versus last month. Check the ${top?.name ?? 'top'} category for one-off purchases.`
    );
  }
  if (currentMonth.savingsRate < 20 && currentMonth.income > 0) {
    tips.push('Your savings rate is below 20%. Try moving a fixed amount to savings right after income arrives.');
  }
  if (budgets.length === 0) {
    tips.push('Set a monthly budget — even a single overall limit makes overspending visible early.');
  }
  const exceeded = budgets.filter((b) => b.status === 'exceeded');
  if (exceeded.length) {
    tips.push(`You are over budget on ${exceeded.map((b) => b.name).join(', ')}. Pause discretionary spending there.`);
  }
  if (savingsGoals.length === 0) {
    tips.push('Create a savings goal with a target date; goal-based saving keeps motivation high.');
  } else if (context.savingsTotals.target > 0 && context.savingsTotals.saved / context.savingsTotals.target < 0.25) {
    tips.push('Your savings goals are under 25% funded. Schedule a small automatic contribution each month.');
  }
  if (currentMonth.income > 0 && currentMonth.expense / currentMonth.income > 0.9) {
    tips.push('Expenses use over 90% of income this month. Build a buffer before adding new recurring bills.');
  }
  return tips.slice(0, 4);
}

function summaryText(context: FinancialContext) {
  const { format, monthLabel, currentMonth, previousMonth, categories, budgets, savingsGoals } = context;
  const lines: string[] = [];
  lines.push(`${monthLabel} at a glance`);
  lines.push(
    `• Income ${format(currentMonth.income)} · Expenses ${format(currentMonth.expense)} · Saved ${format(
      currentMonth.savings
    )} (${currentMonth.savingsRate}% savings rate)`
  );
  if (previousMonth.expense > 0) {
    const direction = (previousMonth.expenseChange ?? 0) >= 0 ? 'more' : 'less';
    lines.push(
      `• Spending is ${Math.abs(previousMonth.expenseChange ?? 0)}% ${direction} than last month (${format(
        previousMonth.expense
      )}).`
    );
  }
  if (categories.length) {
    lines.push('• Top categories: ' + categories.slice(0, 3).map((c) => `${c.name} ${format(c.total)} (${c.share}%)`).join(', '));
  } else {
    lines.push('• No expenses recorded yet this month.');
  }
  if (budgets.length) {
    const over = budgets.filter((b) => b.status === 'exceeded');
    lines.push(
      over.length
        ? `• Budgets exceeded: ${over.map((b) => `${b.name} (${b.percentage}%)`).join(', ')}.`
        : `• All ${budgets.length} budget${budgets.length === 1 ? '' : 's'} are on track.`
    );
  }
  if (savingsGoals.length) {
    lines.push(
      '• Goals: ' +
        savingsGoals
          .slice(0, 3)
          .map((g) => `${g.name} ${g.progress}% (${format(g.saved)} of ${format(g.target)})`)
          .join(', ')
    );
  }
  lines.push('');
  lines.push('What I suggest');
  for (const tip of suggestionsFrom(context)) lines.push(`• ${tip}`);
  return lines.join('\n');
}

function analysisText(context: FinancialContext) {
  const { format, currentMonth, categories, recurring, previousMonth } = context;
  if (currentMonth.expense === 0) {
    return 'I do not see any expenses recorded yet. Add transactions and I will break down exactly where your money goes.';
  }
  const lines: string[] = [];
  lines.push('Spending analysis');
  lines.push(
    `• You spent ${format(currentMonth.expense)} across ${currentMonth.expenseCount} expense${
      currentMonth.expenseCount === 1 ? '' : 's'
    } this month.`
  );
  if (previousMonth.expenseChange !== null) {
    lines.push(
      `• That is ${Math.abs(previousMonth.expenseChange)}% ${previousMonth.expenseChange >= 0 ? 'higher' : 'lower'} than last month.`
    );
  }
  const top = categories[0];
  if (top) {
    lines.push(`• ${top.name} is your biggest category at ${format(top.total)} — ${top.share}% of all spending.`);
  }
  const top3Share = categories.slice(0, 3).reduce((sum, c) => sum + c.share, 0);
  if (categories.length > 3) {
    lines.push(`• Your top three categories account for ${Math.round(top3Share)}% of expenses.`);
  }
  if (recurring.length) {
    const monthlyRecurring = recurring
      .filter((r) => r.type === 'EXPENSE')
      .reduce((sum, r) => {
        const multiplier = r.frequency === 'DAILY' ? 30 : r.frequency === 'WEEKLY' ? 4.345 : r.frequency === 'YEARLY' ? 1 / 12 : 1;
        return sum + r.amount * multiplier;
      }, 0);
    if (monthlyRecurring > 0) {
      lines.push(`• Committed recurring payments total roughly ${format(monthlyRecurring)} per month.`);
    }
  }
  lines.push('');
  lines.push('Recommendations');
  for (const tip of suggestionsFrom(context)) lines.push(`• ${tip}`);
  return lines.join('\n');
}

function budgetAdviceText(context: FinancialContext) {
  const { format, currentMonth, budgets, categories } = context;
  const lines: string[] = ['Budget review'];
  if (!budgets.length) {
    lines.push('• You have no budgets yet. Start with one overall monthly limit, then add category limits.');
    if (currentMonth.expense > 0) {
      lines.push(
        `• A realistic starting point is ${format(Math.round((currentMonth.expense * 1.1) / 10) * 10)} — about 10% above this month's spending.`
      );
    }
  } else {
    for (const budget of budgets) {
      lines.push(
        `• ${budget.name}: ${format(budget.spent)} of ${format(budget.limit)} used (${budget.percentage}%) — ${
          budget.status === 'exceeded'
            ? `over by ${format(Math.abs(budget.remaining))}`
            : `${format(budget.remaining)} left`
        }.`
      );
    }
    const over = budgets.filter((b) => b.status === 'exceeded');
    if (over.length) lines.push(`• Rebalance by moving budget from underused categories to ${over.map((b) => b.name).join(', ')}.`);
    if (!budgets.some((b) => !b.category)) {
      lines.push('• Add an overall budget so day-to-day spending is capped, not only individual categories.');
    }
  }
  if (currentMonth.income > 0) {
    lines.push(
      `• With income of ${format(currentMonth.income)}, a 50/30/20 split suggests ${format(
        currentMonth.income * 0.5
      )} needs, ${format(currentMonth.income * 0.3)} wants and ${format(currentMonth.income * 0.2)} savings.`
    );
  }
  if (categories[0]) {
    lines.push(`• Your largest category is ${categories[0].name} at ${format(categories[0].total)}; review it first.`);
  }
  return lines.join('\n');
}

function chatAnswer(question: string, context: FinancialContext) {
  const q = question.toLowerCase();
  const { format, currentMonth, previousMonth, categories, budgets, recentTransactions, savingsGoals, savingsTotals } = context;
  const over = budgets.filter((b) => b.status === 'exceeded');
  const near = budgets.filter((b) => b.status === 'warning');

  if (/highest|top|most|biggest|where.*spend|spent.*most/.test(q)) {
    if (!categories.length) return 'You have no expenses recorded this month, so there is no top category yet.';
    return [
      `Your biggest spending categories this month:`,
      ...categories.slice(0, 5).map((c, i) => `${i + 1}. ${c.name} — ${format(c.total)} (${c.share}% of expenses)`),
      '',
      categories[0]
        ? `Focusing on ${categories[0].name} gives you the largest savings opportunity.`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (/budget/.test(q)) {
    if (!budgets.length) {
      return `You have no budgets set up yet. This month you spent ${format(currentMonth.expense)}; set a monthly budget so I can track how much room is left.`;
    }
    return [
      `Budget status for ${context.monthLabel}:`,
      ...budgets.map((b) => `${b.name}: ${b.percentage}% used (${format(b.spent)} of ${format(b.limit)}, ${format(b.remaining)} remaining)`),
      over.length ? `⚠ Over budget: ${over.map((b) => b.name).join(', ')}.` : 'All budgets are within their limits.',
      near.length ? `Getting close: ${near.map((b) => b.name).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (/sav(e|ing)|goal/.test(q)) {
    const lines = [
      `This month you saved ${format(currentMonth.savings)} (${currentMonth.savingsRate}% of income).`,
    ];
    if (savingsGoals.length) {
      lines.push('Goals:');
      for (const g of savingsGoals) lines.push(`• ${g.name}: ${g.progress}% — ${format(g.saved)} of ${format(g.target)} by ${g.targetDate}`);
      const gap = savingsTotals.target - savingsTotals.saved;
      if (gap > 0) lines.push(`You need ${format(gap)} more to fully fund all active goals.`);
    } else {
      lines.push('You have no savings goals yet. Create one to give your saving a target.');
    }
    return lines.join('\n');
  }
  if (/income|earn|salary/.test(q)) {
    return `This month you recorded ${format(currentMonth.income)} of income${
      previousMonth.income > 0 ? `, compared with ${format(previousMonth.income)} last month` : ''
    }. All-time balance is ${format(context.totals.allTimeBalance)}.`;
  }
  if (/compare|last month|trend|higher|lower/.test(q)) {
    if (previousMonth.expense === 0) return 'There is no spending from last month to compare against yet.';
    return `Expenses this month are ${format(currentMonth.expense)} versus ${format(previousMonth.expense)} last month — ${
      (previousMonth.expenseChange ?? 0) >= 0 ? 'up' : 'down'
    } ${Math.abs(previousMonth.expenseChange ?? 0)}%. Savings moved from ${format(previousMonth.savings)} to ${format(
      currentMonth.savings
    )}.`;
  }
  if (/biggest expense|largest expense|last transaction|recent/.test(q)) {
    if (!recentTransactions.length) return 'You have not added any transactions yet.';
    return [
      'Your most recent transactions:',
      ...recentTransactions.slice(0, 5).map((t) => `• ${t.date} — ${t.description} ${format(t.amount)} (${t.category})`),
    ].join('\n');
  }
  if (/how much.*(spend|spent)|total.*expense|expense.*total/.test(q)) {
    return `You spent ${format(currentMonth.expense)} this month across ${currentMonth.expenseCount} expenses${
      categories[0] ? `, mostly on ${categories[0].name} (${format(categories[0].total)})` : ''
    }. Average per day is ${format(currentMonth.expense / Math.max(1, new Date().getUTCDate()))}.`;
  }
  if (/balance|net worth|money left/.test(q)) {
    return `Your all-time balance is ${format(context.totals.allTimeBalance)} (income ${format(
      context.totals.allTimeIncome
    )} minus expenses ${format(context.totals.allTimeExpenses)}).`;
  }
  if (/advice|improve|save more|reduce|help/.test(q)) {
    return ['Here is what I would do next:', ...suggestionsFrom(context).map((t) => `• ${t}`)].join('\n');
  }

  return [
    `Here is your financial snapshot for ${context.monthLabel}:`,
    `• Income ${format(currentMonth.income)} · Expenses ${format(currentMonth.expense)} · Saved ${format(currentMonth.savings)}`,
    categories[0] ? `• Top category: ${categories[0].name} (${format(categories[0].total)})` : '',
    over.length ? `• Over budget: ${over.map((b) => b.name).join(', ')}` : budgets.length ? '• Budgets are on track' : '',
    '',
    'You can ask me things like “Where did I spend the most this month?”, “How is my budget doing?”, or “How can I save more?”',
  ]
    .filter(Boolean)
    .join('\n');
}

async function callAiProvider(system: string, userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.model,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`AI provider returned ${response.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('AI provider returned an empty response');
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

const SYSTEM_PROMPT = `You are the Expense Tracker AI assistant, a concise personal finance coach.
Use ONLY the JSON financial context supplied by the user. Never invent transactions, income, budgets or goals.
Amounts are already in the user's currency; format them plainly. Be specific, practical and warm.
Return short plain text with "•" bullet points. Never mention that you received JSON.`;

export async function generateInsight(
  userId: string,
  kind: InsightKind,
  context?: FinancialContext
): Promise<{ content: string; source: 'ai' | 'rules'; model: string }> {
  const ctx = context ?? (await buildFinancialContext(userId));
  const fallback =
    kind === 'MONTHLY_SUMMARY' ? summaryText(ctx) : kind === 'BUDGET_ADVICE' ? budgetAdviceText(ctx) : analysisText(ctx);

  if (!env.aiConfigured) return { content: fallback, source: 'rules', model: 'rule-engine' };

  const prompt =
    kind === 'MONTHLY_SUMMARY'
      ? 'Write a monthly financial summary and 3 concrete suggestions from this context:'
      : kind === 'BUDGET_ADVICE'
        ? 'Review the budgets and suggest improvements using this context:'
        : 'Analyse the spending patterns and give 3 actionable recommendations using this context:';

  try {
    const content = await callAiProvider(
      SYSTEM_PROMPT,
      `${prompt}\n\n${JSON.stringify(ctx)}`
    );
    return { content, source: 'ai', model: env.ai.model };
  } catch (error) {
    console.warn('[ai] provider failed, using rule engine:', (error as Error).message);
    return { content: fallback, source: 'rules', model: 'rule-engine' };
  }
}

export async function answerQuestion(
  userId: string,
  question: string,
  context?: FinancialContext
): Promise<{ content: string; source: 'ai' | 'rules'; model: string }> {
  const ctx = context ?? (await buildFinancialContext(userId));
  const fallback = chatAnswer(question, ctx);
  if (!env.aiConfigured) return { content: fallback, source: 'rules', model: 'rule-engine' };
  try {
    const content = await callAiProvider(
      SYSTEM_PROMPT,
      `Question: ${question}\n\nFinancial context:\n${JSON.stringify(ctx)}`
    );
    return { content, source: 'ai', model: env.ai.model };
  } catch (error) {
    console.warn('[ai] provider failed, using rule engine:', (error as Error).message);
    return { content: fallback, source: 'rules', model: 'rule-engine' };
  }
}

export function suggestionsFor(context: FinancialContext) {
  return suggestionsFrom(context);
}
