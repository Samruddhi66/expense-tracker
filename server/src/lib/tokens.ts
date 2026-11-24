import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { randomToken, sha256 } from './password.js';
import { ApiError } from './errors.js';

export type AccessPayload = { sub: string; role: 'USER' | 'ADMIN'; email: string };

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, env.accessSecret, {
    expiresIn: env.accessTtl as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const decoded = jwt.verify(token, env.accessSecret) as JwtPayload & {
      sub?: string;
      role?: 'USER' | 'ADMIN';
      email?: string;
      type?: string;
    };
    if (!decoded.sub || decoded.type !== 'access' || !decoded.role || !decoded.email) {
      throw new Error('Malformed token');
    }
    return { sub: decoded.sub, role: decoded.role, email: decoded.email };
  } catch {
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.refreshDays * 24 * 60 * 60 * 1000);
}

export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {}
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(48);
  const expiresAt = refreshExpiry();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
    },
  });
  return { token, expiresAt };
}

export async function consumeRefreshToken(rawToken: string): Promise<{ userId: string }> {
  const hash = sha256(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Your session has ended, please sign in again');
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return { userId: stored.userId };
}

export async function revokeRefreshToken(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Issue a single-use token for email verification or password reset. */
export async function createEmailToken(
  userId: string,
  purpose: 'verify_email' | 'reset_password',
  ttlMinutes: number
): Promise<string> {
  const token = randomToken(32);
  // invalidate earlier unused tokens of the same purpose
  await prisma.emailToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.emailToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    },
  });
  return token;
}

export async function consumeEmailToken(
  token: string,
  purpose: 'verify_email' | 'reset_password'
): Promise<string> {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest('This link is invalid or has expired');
  }
  await prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return record.userId;
}
