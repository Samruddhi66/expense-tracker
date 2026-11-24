import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.emailConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export type MailMessage = { to: string; subject: string; html: string; text: string };

/** Delivers a message. Without SMTP configured it is logged so flows stay testable. */
export async function sendMail(message: MailMessage): Promise<{ delivered: boolean }> {
  const transport = getTransporter();
  if (!transport) {
    console.info(`[mail:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return { delivered: false };
  }
  await transport.sendMail({
    from: env.smtp.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { delivered: true };
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f3fb;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
    <table width="100%" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e9e4f7">
      <tr><td style="background:#4c1d95;padding:26px 32px;color:#ffffff;font-size:20px;font-weight:700">Expense Tracker</td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 14px;font-size:22px;color:#1f1235">${title}</h1>
        <div style="font-size:15px;line-height:1.6;color:#4b4262">${body}</div>
        ${cta ? `<p style="margin:28px 0 8px"><a href="${cta.url}" style="background:#6d28d9;color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${cta.label}</a></p>
        <p style="font-size:12px;color:#8b83a3;word-break:break-all">Or open this link: ${cta.url}</p>` : ''}
      </td></tr>
      <tr><td style="padding:18px 32px;background:#faf8ff;color:#8b83a3;font-size:12px">Track Smart. Spend Wise. Save More.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export function verificationEmail(name: string, url: string): MailMessage {
  return {
    to: '',
    subject: 'Verify your Expense Tracker email',
    text: `Hi ${name}, confirm your email to activate your Expense Tracker account: ${url} (valid for 24 hours).`,
    html: layout(
      `Welcome, ${name}!`,
      'Confirm your email address to activate your account and start tracking your money.',
      { label: 'Verify email', url }
    ),
  };
}

export function resetPasswordEmail(name: string, url: string): MailMessage {
  return {
    to: '',
    subject: 'Reset your Expense Tracker password',
    text: `Hi ${name}, reset your password here: ${url} (valid for 60 minutes). If this wasn't you, ignore this email.`,
    html: layout(
      'Reset your password',
      `Hi ${name}, we received a request to reset your password. This link expires in 60 minutes. If you didn't ask for this, you can ignore this email.`,
      { label: 'Choose a new password', url }
    ),
  };
}

export function budgetAlertEmail(name: string, title: string, message: string): MailMessage {
  return {
    to: '',
    subject: title,
    text: `${name}, ${message}`,
    html: layout(title, message),
  };
}
