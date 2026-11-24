import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../lib/errors.js';
import { asyncHandler } from '../lib/http.js';
import { hashPassword, passwordStrengthIssues, verifyPassword } from '../lib/password.js';
import {
  consumeEmailToken,
  consumeRefreshToken,
  createEmailToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
} from '../lib/tokens.js';
import { parse } from '../middleware/validate.js';
import { requireAuth, type AuthUser } from '../middleware/auth.js';
import { publicUser } from '../lib/serializers.js';
import { resetPasswordEmail, sendMail, verificationEmail } from '../lib/mailer.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Please try again in a few minutes.' } },
});

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .superRefine((value, ctx) => {
    const issues = passwordStrengthIssues(value);
    if (issues.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Include ${issues.join(', ')}` });
    }
  });

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(env.refreshCookieName, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/api/auth',
    expires: expiresAt,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(env.refreshCookieName, { path: '/api/auth' });
}

function clientMeta(req: { headers: Record<string, unknown>; ip?: string }) {
  return {
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    ip: req.ip,
  };
}

async function startSession(userId: string, res: Response, req: { headers: Record<string, unknown>; ip?: string }) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { settings: true },
  });
  const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });
  const refresh = await issueRefreshToken(user.id, clientMeta(req));
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  return { accessToken, user: publicUser(user, user.settings) };
}

function actionLink(path: string, token: string) {
  return `${env.clientUrl.replace(/\/$/, '')}${path}?token=${token}`;
}

// ── Signup ────────────────────────────────────────────────────────────────
router.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2, 'Enter your name').max(80),
        email: emailSchema,
        password: passwordSchema,
      }),
      req.body
    );

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        settings: { create: {} },
        notifications: {
          create: {
            type: 'SYSTEM',
            title: 'Welcome to Expense Tracker',
            message: 'Add your first transaction and set a budget to start tracking smart.',
          },
        },
      },
    });

    const token = await createEmailToken(user.id, 'verify_email', 24 * 60);
    const link = actionLink('/verify-email', token);
    const mail = verificationEmail(user.name, link);
    const { delivered } = await sendMail({ ...mail, to: user.email });

    res.status(201).json({
      message: delivered
        ? 'Account created. Check your inbox to verify your email.'
        : 'Account created. Email delivery is not configured on this server, so use the verification link below.',
      email: user.email,
      verificationRequired: true,
      devVerificationUrl: !env.isProd && !delivered ? link : undefined,
    });
  })
);

// ── Login ─────────────────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') }),
      req.body
    );

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const invalid = ApiError.unauthorized('Incorrect email or password');
    if (!user || !user.passwordHash) throw invalid;
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw invalid;
    if (!user.isActive) throw ApiError.forbidden('This account has been suspended. Contact support.');
    if (!user.emailVerified) {
      throw new ApiError(403, 'Please verify your email address before signing in', 'email_not_verified');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await startSession(user.id, res, req);
    res.json(session);
  })
);

// ── Refresh / logout ──────────────────────────────────────────────────────
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[env.refreshCookieName] as string | undefined;
    if (!raw) throw ApiError.unauthorized('No active session');
    let userId: string;
    try {
      ({ userId } = await consumeRefreshToken(raw));
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { settings: true } });
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      throw ApiError.unauthorized('Account unavailable');
    }
    const session = await startSession(user.id, res, req);
    res.json(session);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[env.refreshCookieName] as string | undefined;
    await revokeRefreshToken(raw);
    clearRefreshCookie(res);
    res.json({ message: 'Signed out' });
  })
);

router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeAllRefreshTokens(req.user!.id);
    clearRefreshCookie(res);
    res.json({ message: 'Signed out from all devices' });
  })
);

// ── Email verification ────────────────────────────────────────────────────
router.post(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = parse(z.object({ token: z.string().min(10, 'Verification link is invalid') }), req.body);
    const userId = await consumeEmailToken(token, 'verify_email');
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, emailVerifiedAt: new Date() },
    });
    res.json({ message: 'Email verified. You can now sign in.' });
  })
);

router.post(
  '/resend-verification',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    let devVerificationUrl: string | undefined;
    if (user && !user.emailVerified) {
      const token = await createEmailToken(user.id, 'verify_email', 24 * 60);
      const link = actionLink('/verify-email', token);
      const { delivered } = await sendMail({ ...verificationEmail(user.name, link), to: user.email });
      if (!env.isProd && !delivered) devVerificationUrl = link;
    }
    res.json({
      message: 'If an unverified account exists for that email, a verification link has been sent.',
      devVerificationUrl,
    });
  })
);

// ── Password reset ────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    let devResetUrl: string | undefined;
    if (user && user.isActive) {
      const token = await createEmailToken(user.id, 'reset_password', 60);
      const link = actionLink('/reset-password', token);
      const { delivered } = await sendMail({ ...resetPasswordEmail(user.name, link), to: user.email });
      if (!env.isProd && !delivered) devResetUrl = link;
    }
    res.json({
      message: 'If an account exists for that email, a password reset link has been sent.',
      devResetUrl,
    });
  })
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ token: z.string().min(10, 'Reset link is invalid'), password: passwordSchema }),
      req.body
    );
    const userId = await consumeEmailToken(body.token, 'reset_password');
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(body.password), emailVerified: true },
    });
    await revokeAllRefreshTokens(userId);
    res.json({ message: 'Password updated. Please sign in with your new password.' });
  })
);

// ── Google login ──────────────────────────────────────────────────────────
router.post(
  '/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!env.googleConfigured) {
      throw ApiError.badRequest('Google sign-in is not configured on this server');
    }
    const { credential } = parse(z.object({ credential: z.string().min(20) }), req.body);
    const client = new OAuth2Client(env.googleClientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw ApiError.unauthorized('Google account could not be verified');
    if (payload.email_verified === false) throw ApiError.unauthorized('Your Google email is not verified');

    const email = payload.email.toLowerCase();
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId: payload.sub }, { email }] } });
    if (user && !user.isActive) throw ApiError.forbidden('This account has been suspended');

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: payload.name ?? email.split('@')[0]!,
          email,
          googleId: payload.sub,
          avatarUrl: payload.picture ?? null,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          settings: { create: {} },
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, emailVerified: true, avatarUrl: user.avatarUrl ?? payload.picture ?? null },
      });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await startSession(user.id, res, req);
    res.json(session);
  })
);

// ── Current user ──────────────────────────────────────────────────────────
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { settings: true } });
    if (!user) throw ApiError.notFound('Account not found');
    res.json({ user: publicUser(user, user.settings) });
  })
);

export type { AuthUser };
export default router;
