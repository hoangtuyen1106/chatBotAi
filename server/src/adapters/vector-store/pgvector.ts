import pgvector from 'pgvector';
import { pool } from '../../db/pool.js';
import type { VectorMatch, VectorStore } from './index.js';

interface MatchRow {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  distance: number;
}

export const pgVectorStore: VectorStore = {
  async upsert(records) {
    if (records.length === 0) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        await client.query(
          `UPDATE document_chunks
             SET embedding = $1
           WHERE id = $2`,
          [pgvector.toSql(r.embedding), r.id],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async query({ userId, embedding, topK, documentId }) {
    const params: unknown[] = [pgvector.toSql(embedding), userId, topK];
    let where = `user_id = $2 AND embedding IS NOT NULL`;
    if (documentId) {
      params.splice(2, 0, documentId);
      where = `user_id = $2 AND document_id = $3 AND embedding IS NOT NULL`;
    }
    const sql = `
      SELECT id, document_id, chunk_index, content,
             embedding <=> $1 AS distance
        FROM document_chunks
       WHERE ${where}
       ORDER BY embedding <=> $1
       LIMIT $${params.length}
    `;
    const { rows } = await pool.query<MatchRow>(sql, params);
    return rows.map<VectorMatch>((r) => ({
      id: r.id,
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      score: 1 - Number(r.distance),
    }));
  },

  async deleteByDocument(documentId) {
    await pool.query(`DELETE FROM document_chunks WHERE document_id = $1`, [documentId]);
  },
};
