import { Router } from 'express';
import multer from 'multer';
import { fromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';

import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { s3Storage } from '../adapters/object-storage/index.js';
import { ingestQueue } from '../services/queue.js';
import { isSupportedMime } from '../services/ingestion/parsers/index.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 1 },
});

const TEXT_MIME_FALLBACK = new Set(['text/plain', 'text/csv']);

uploadRouter.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const userId = req.userId!;
    const file = req.file;
    if (!file) throw new HttpError(400, 'Missing file field "file"', 'no_file');

    let detectedMime = file.mimetype;
    const sniff = await fromBuffer(file.buffer);
    if (sniff?.mime) {
      detectedMime = sniff.mime;
    } else if (!TEXT_MIME_FALLBACK.has(file.mimetype)) {
      throw new HttpError(415, 'Could not detect file type from contents', 'unknown_mime');
    }

    if (!env.UPLOAD_ALLOWED_MIME_LIST.includes(detectedMime)) {
      throw new HttpError(415, `MIME ${detectedMime} not allowed`, 'mime_rejected');
    }
    if (!isSupportedMime(detectedMime)) {
      throw new HttpError(415, `No parser for ${detectedMime}`, 'no_parser');
    }

    const documentId = randomUUID();
    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '';
    const storageKey = `users/${userId}/${documentId}${ext}`;

    await s3Storage.put(storageKey, file.buffer, detectedMime);

    await pool.query(
      `INSERT INTO documents (id, user_id, storage_key, filename, mime, size_bytes, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [documentId, userId, storageKey, file.originalname.slice(0, 255), detectedMime, file.size],
    );

    await ingestQueue().add({
      documentId,
      userId,
      storageKey,
      mime: detectedMime,
    });

    logger.info({ documentId, userId, mime: detectedMime, size: file.size }, 'upload_ok');

    res.status(202).json({
      id: documentId,
      filename: file.originalname,
      mime: detectedMime,
      size: file.size,
      status: 'pending',
    });
  } catch (err) {
    next(err);
  }
});

uploadRouter.get('/documents', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, filename, mime, size_bytes, status, chunk_count, error, created_at, updated_at
         FROM documents
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [req.userId],
    );
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});
