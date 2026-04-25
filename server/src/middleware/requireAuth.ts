import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { HttpError } from './errorHandler.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing bearer token', 'unauthorized'));
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(new HttpError(401, 'Missing bearer token', 'unauthorized'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    const sub = typeof payload === 'string' ? payload : payload.sub;
    if (!sub || typeof sub !== 'string') {
      return next(new HttpError(401, 'Invalid token subject', 'unauthorized'));
    }
    req.userId = sub;
    return next();
  } catch {
    return next(new HttpError(401, 'Invalid or expired token', 'unauthorized'));
  }
};
