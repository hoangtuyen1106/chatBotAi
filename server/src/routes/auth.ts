import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';

import { env } from '../config/env.js';
import { credentialsSchema, login, register, type Credentials } from '../services/auth.js';
import { HttpError } from '../middleware/errorHandler.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many auth requests, slow down.' },
});

authRouter.use(authLimiter);

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
    const result = await register(req.body as Credentials);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/login', validate, async (req, res, next) => {
  try {
    const result = await login(req.body as Credentials);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
