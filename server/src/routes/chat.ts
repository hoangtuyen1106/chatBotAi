import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';

import { env } from '../config/env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import { runChatStream } from '../services/chat/index.js';
import { listChats, listMessages } from '../services/chat/persistence.js';

export const chatRouter = Router();

const chatLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many chat requests, slow down.' },
});

chatRouter.use(['/chat', '/chats'], chatLimiter);

const chatBodySchema = z
  .object({
    chatId: z.string().uuid().optional(),
    message: z.string().min(1).max(8000),
    documentId: z.string().uuid().optional(),
  })
  .strict();

const sseHeaders = (res: Response): void => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
};

const sseSend = (res: Response, event: string, data: unknown): void => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

chatRouter.post('/chat/stream', requireAuth, async (req, res) => {
  let body: z.infer<typeof chatBodySchema>;
  try {
    body = chatBodySchema.parse(req.body);
  } catch (err) {
    const msg = err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : 'bad body';
    res.status(400).json({ error: 'validation_error', message: msg });
    return;
  }

  const userId = req.userId!;
  const controller = new AbortController();

  req.on('close', () => {
    if (!res.writableEnded) {
      logger.info({ userId }, 'chat_stream_aborted_by_client');
      controller.abort();
    }
  });

  sseHeaders(res);
  sseSend(res, 'open', { ok: true });

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(`: ping\n\n`);
  }, 15_000);

  await runChatStream({
    userId,
    message: body.message,
    abortSignal: controller.signal,
    ...(body.chatId ? { chatId: body.chatId } : {}),
    ...(body.documentId ? { documentId: body.documentId } : {}),
    events: {
      onStart: (data) => sseSend(res, 'start', data),
      onDelta: (delta) => sseSend(res, 'delta', { delta }),
      onDone: (data) => sseSend(res, 'done', data),
      onError: (err) => {
        logger.error({ err, userId }, 'chat_stream_error');
        sseSend(res, 'error', { message: err.message });
      },
    },
  });

  clearInterval(heartbeat);
  if (!res.writableEnded) res.end();
});

chatRouter.get('/history', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 100);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const chats = await listChats(req.userId!, { limit, ...(before ? { before } : {}) });
    res.json({ chats });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/chats/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const chatId = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(chatId)) {
      throw new HttpError(400, 'Invalid chat id', 'invalid_id');
    }
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const messages = await listMessages(chatId, req.userId!, {
      limit,
      ...(before ? { before } : {}),
    });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});
