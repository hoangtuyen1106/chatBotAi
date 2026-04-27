import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import {
  clearSession,
  cookieNames,
  credentialsSchema,
  getUserById,
  issueSession,
  login,
  register,
  revokeRefreshToken,
  rotateRefreshToken,
  type Credentials,
} from '../services/auth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many auth requests, slow down.' },
});

authRouter.use('/auth', authLimiter);

const validate: RequestHandler = (req, _res, next) => {
  try {
    req.body = credentialsSchema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return next(
        new HttpError(400, err.issues.map((i) => i.message).join('; '), 'validation_error'),
      );
    }
    next(err);
  }
};

authRouter.post('/auth/register', validate, async (req, res, next) => {
  try {
    const user = await register(req.body as Credentials);
    await issueSession(res, user);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/login', validate, async (req, res, next) => {
  try {
    const user = await login(req.body as Credentials);
    await issueSession(res, user);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const raw = cookies?.[cookieNames.refresh];
    if (!raw) throw new HttpError(401, 'Missing refresh token', 'unauthorized');
    const user = await rotateRefreshToken(raw);
    await issueSession(res, user);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const raw = cookies?.[cookieNames.refresh];
    if (raw) await revokeRefreshToken(raw);
    clearSession(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    if (!req.userId) throw new HttpError(401, 'Unauthorized', 'unauthorized');
    const user = await getUserById(req.userId);
    if (!user) throw new HttpError(401, 'Unauthorized', 'unauthorized');
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});
