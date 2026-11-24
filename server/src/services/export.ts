import PDFDocument from 'pdfkit';
import type { AnalyticsResult } from './analytics.js';

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function analyticsToCsv(analytics: AnalyticsResult, user: { name: string; email: string }) {
  const lines: string[] = [];
  lines.push(`Expense Tracker report,${csvCell(analytics.period)},${csvCell(analytics.range.label)}`);
  lines.push(`Account,${csvCell(user.name)},${csvCell(user.email)}`);
  lines.push(`Generated,${csvCell(new Date().toISOString())}`);
  lines.push('');
  lines.push('Summary');
  lines.push('Metric,Value');
  lines.push(`Income,${analytics.summary.income}`);
  lines.push(`Expenses,${analytics.summary.expense}`);
  lines.push(`Net savings,${analytics.summary.net}`);
  lines.push(`Savings rate %,${analytics.summary.savingsRate}`);
  lines.push('');
  lines.push('Category breakdown');
  lines.push('Category,Transactions,Amount,Share %');
  for (const row of analytics.categoryBreakdown) {
    lines.push([csvCell(row.name), row.count, row.value, row.percentage].join(','));
  }
  lines.push('');
  lines.push('Period series');
  lines.push('Period,Income,Expense');
  for (const row of analytics.series) lines.push([csvCell(row.label), row.income, row.expense].join(','));
  lines.push('');
  lines.push('Transactions');
  lines.push('Date,Type,Category,Description,Payment method,Amount');
  for (const tx of analytics.transactions) {
    lines.push(
      [
        csvCell(tx.date.toISOString().slice(0, 10)),
        tx.type,
        csvCell(tx.category?.name ?? 'Uncategorised'),
        csvCell(tx.description),
        tx.paymentMethod,
        tx.amount,
      ].join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function moneyText(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PdfInput = {
  analytics: AnalyticsResult;
  user: { name: string; email: string };
  currency: string;
};

export function analyticsToPdf({ analytics, user, currency }: PdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const purple = '#4C1D95';
    const muted = '#6B6280';
    const ink = '#1C1430';
    const money = (value: number) => `${currency} ${moneyText(value)}`;

    doc.rect(0, 0, doc.page.width, 96).fill(purple);
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('Expense Tracker', 48, 32);
    doc.fontSize(10).font('Helvetica').fillColor('#E9E0FF').text('Track Smart. Spend Wise. Save More.', 48, 62);
    doc.fontSize(9).text(new Date().toLocaleString('en-US'), 48, 62, { align: 'right', width: doc.page.width - 96 });

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text('Financial Report', 48, 124);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(muted)
      .text(
        `${analytics.period.charAt(0).toUpperCase() + analytics.period.slice(1)} report · ${analytics.range.label}`,
        48,
        148
      )
      .text(`Prepared for ${user.name} (${user.email})`, 48, 162);

    const cards: Array<[string, string]> = [
      ['Income', money(analytics.summary.income)],
      ['Expenses', money(analytics.summary.expense)],
      ['Net savings', money(analytics.summary.net)],
      ['Savings rate', `${analytics.summary.savingsRate}%`],
    ];
    let x = 48;
    const cardWidth = (doc.page.width - 96 - 24) / 4;
    cards.forEach(([label, value]) => {
      doc.roundedRect(x, 192, cardWidth, 62, 8).fillAndStroke('#F6F2FF', '#E4D9FB');
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 12, 204, { width: cardWidth - 24 });
      doc.fillColor(purple).font('Helvetica-Bold').fontSize(13).text(value, x + 12, 220, { width: cardWidth - 24 });
      x += cardWidth + 8;
    });

    let y = 284;
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('Spending by category', 48, y);
    y += 22;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted);
    doc.text('Category', 48, y).text('Txns', 330, y, { width: 50, align: 'right' }).text('Amount', 390, y, { width: 80, align: 'right' }).text('Share', 490, y, { width: 57, align: 'right' });
    y += 14;
    doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor('#E9E4F7').stroke();
    y += 8;
    doc.font('Helvetica').fontSize(9).fillColor(ink);
    if (analytics.categoryBreakdown.length === 0) {
      doc.fillColor(muted).text('No expenses recorded in this period.', 48, y);
      y += 20;
    }
    for (const row of analytics.categoryBreakdown.slice(0, 15)) {
      doc.fillColor(ink).text(row.name.slice(0, 42), 48, y, { width: 260 });
      doc.text(String(row.count), 330, y, { width: 50, align: 'right' });
      doc.text(moneyText(row.value), 390, y, { width: 80, align: 'right' });
      doc.text(`${row.percentage}%`, 490, y, { width: 57, align: 'right' });
      y += 16;
    }

    y += 16;
    if (y > 640) {
      doc.addPage();
      y = 60;
    }
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('Period overview', 48, y);
    y += 22;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(muted);
    doc.text('Period', 48, y).text('Income', 250, y, { width: 110, align: 'right' }).text('Expense', 380, y, { width: 110, align: 'right' }).text('Net', 500, y, { width: 47, align: 'right' });
    y += 14;
    doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor('#E9E4F7').stroke();
    y += 8;
    doc.font('Helvetica').fontSize(9).fillColor(ink);
    for (const row of analytics.series) {
      if (y > 760) {
        doc.addPage();
        y = 60;
      }
      doc.text(row.label, 48, y);
      doc.text(moneyText(row.income), 250, y, { width: 110, align: 'right' });
      doc.text(moneyText(row.expense), 380, y, { width: 110, align: 'right' });
      doc.text(moneyText(row.income - row.expense), 500, y, { width: 47, align: 'right' });
      y += 15;
    }

    y += 16;
    if (y > 660) {
      doc.addPage();
      y = 60;
    }
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('Largest expenses', 48, y);
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor(ink);
    if (analytics.topExpenses.length === 0) {
      doc.fillColor(muted).text('No expenses recorded in this period.', 48, y);
    }
    for (const tx of analytics.topExpenses) {
      doc.text(`${tx.date.toISOString().slice(0, 10)}  ${tx.description.slice(0, 50)}`, 48, y, { width: 340 });
      doc.text(tx.category?.name ?? 'Uncategorised', 380, y, { width: 100 });
      doc.text(money(tx.amount), 480, y, { width: 67, align: 'right' });
      y += 16;
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i += 1) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(muted)
        .text(`Generated by Expense Tracker · Page ${i + 1} of ${pageCount}`, 48, doc.page.height - 36, {
          width: doc.page.width - 96,
          align: 'center',
        });
    }
    doc.end();
  });
}
