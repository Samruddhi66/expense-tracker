import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Prisma Decimal / Date safe JSON payload conversion for money values. */
export function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value.toString()) * 100) / 100;
}
