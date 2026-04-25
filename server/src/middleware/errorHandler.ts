import type { ErrorRequestHandler, RequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';

export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, message: string, code = 'http_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : 'internal_error';
  const message = err instanceof Error ? err.message : 'Unexpected error';

  logger.error(
    {
      err,
      req: { method: req.method, url: req.originalUrl },
      status,
    },
    'request_failed',
  );

  res.status(status).json({
    error: code,
    message: isProd && status === 500 ? 'Internal server error' : message,
  });
};
