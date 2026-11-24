import type { ZodTypeAny, z } from 'zod';
import { ApiError } from '../lib/errors.js';

export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new ApiError(400, 'Please check the highlighted fields', 'validation_error', fields);
  }
  return result.data;
}
