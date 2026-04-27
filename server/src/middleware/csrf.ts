import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { cookieNames } from '../services/auth.js';
import { HttpError } from './errorHandler.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/auth/register', '/auth/login']);

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

// Double-submit CSRF: for state-changing requests, require a non-httpOnly
// `csrf_token` cookie that the client mirrors into the `X-CSRF-Token` header.
// Cross-origin attackers can't read the cookie value, so they can't forge the header.
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PATHS.has(req.path)) return next();

  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const cookieToken = cookies?.[cookieNames.csrf];
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(new HttpError(403, 'CSRF token missing or invalid', 'csrf_invalid'));
  }
  return next();
};
