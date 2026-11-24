import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors.js';
import { env } from '../config/env.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: 'not_found', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    return res
      .status(error.statusCode)
      .json({ error: { code: error.code, message: error.message, details: error.details } });
  }

  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({
      error: { code: 'validation_error', message: 'Please check the highlighted fields', details: fields },
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? (error.meta?.target as string[]).join(', ') : 'value';
      return res.status(409).json({
        error: { code: 'conflict', message: `A record with this ${target} already exists` },
      });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: { code: 'not_found', message: 'Record not found' } });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Related record is missing' } });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid data supplied' } });
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(`[error] ${req.method} ${req.originalUrl}:`, error);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: env.isProd ? 'Something went wrong on our side' : message,
    },
  });
}
