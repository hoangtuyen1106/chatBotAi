import { randomUUID } from 'node:crypto';

import { pool } from '../../db/pool.js';
import { logger } from '../../config/logger.js';
import { s3Storage } from '../../adapters/object-storage/index.js';
import { openAiCompatEmbeddings } from '../../adapters/embeddings/index.js';
import { getVectorStore } from '../../adapters/vector-store/index.js';
import { getParser } from './parsers/index.js';
import { chunk } from './chunker.js';

interface ChunkRow {
  id: string;
}

export const ingestDocument = async (opts: {
  documentId: string;
  userId: string;
  storageKey: string;
  mime: string;
}): Promise<{ chunkCount: number }> => {
  const { documentId, userId, storageKey, mime } = opts;
  const log = logger.child({ documentId, userId });

  await pool.query(`UPDATE documents SET status = 'processing', updated_at = now() WHERE id = $1`, [
    documentId,
  ]);

  try {
    log.info('ingest_fetch');
    const buf = await s3Storage.get(storageKey);

    log.info({ mime, bytes: buf.length }, 'ingest_parse');
    const parser = getParser(mime);
    const text = await parser(buf);
    if (!text.trim()) throw new Error('Parsed document is empty');

    const chunks = chunk(text);
    if (chunks.length === 0) throw new Error('Chunker produced no chunks');
    log.info({ chunks: chunks.length }, 'ingest_chunked');

    const insertedIds: string[] = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM document_chunks WHERE document_id = $1`, [documentId]);
      for (const c of chunks) {
        const id = randomUUID();
        await client.query<ChunkRow>(
          `INSERT INTO document_chunks
             (id, document_id, user_id, chunk_index, content, token_estimate)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, documentId, userId, c.index, c.content, c.tokenEstimate],
        );
        insertedIds.push(id);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    log.info('ingest_embed');
    const vectors = await openAiCompatEmbeddings.embed(chunks.map((c) => c.content));
    if (vectors.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${vectors.length}`);
    }

    log.info('ingest_upsert');
    await getVectorStore().upsert(
      chunks.map((c, i) => ({
        id: insertedIds[i],
        documentId,
        userId,
        chunkIndex: c.index,
        content: c.content,
        embedding: vectors[i],
      })),
    );

    await pool.query(
      `UPDATE documents
         SET status = 'ready', chunk_count = $2, error = NULL, updated_at = now()
       WHERE id = $1`,
      [documentId, chunks.length],
    );

    log.info({ chunkCount: chunks.length }, 'ingest_done');
    return { chunkCount: chunks.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'ingest_failed');
    await pool.query(
      `UPDATE documents SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [documentId, message.slice(0, 500)],
    );
    throw err;
  }
};
