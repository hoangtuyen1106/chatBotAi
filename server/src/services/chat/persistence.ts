import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { logger } from '../../config/logger.js';
import type { ChatMessage } from '../../adapters/llm/index.js';
import type { Citation } from '../retrieval.js';

const HISTORY_LIMIT = 20;
const CACHE_TTL_SECONDS = 24 * 60 * 60;

const cacheKey = (chatId: string): string => `chat:${chatId}:msgs`;

export interface PersistedMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[] | null;
  truncated: boolean;
  createdAt: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[] | null;
  truncated: boolean;
  created_at: Date;
}

const rowToMessage = (r: MessageRow): PersistedMessage => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  citations: r.citations,
  truncated: r.truncated,
  createdAt: r.created_at.toISOString(),
});

export const ensureChat = async (opts: {
  chatId?: string;
  userId: string;
  firstMessage: string;
}): Promise<string> => {
  if (opts.chatId) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM chats WHERE id = $1 AND user_id = $2`,
      [opts.chatId, opts.userId],
    );
    if (!rows[0]) throw new Error('chat_not_found');
    return rows[0].id;
  }
  const title = opts.firstMessage.slice(0, 60).trim() || 'New chat';
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id`,
    [opts.userId, title],
  );
  return rows[0].id;
};

export const recentMessages = async (
  chatId: string,
  userId: string,
  limit = HISTORY_LIMIT,
): Promise<ChatMessage[]> => {
  try {
    const cached = await redis.get(cacheKey(chatId));
    if (cached) {
      const parsed = JSON.parse(cached) as ChatMessage[];
      return parsed.slice(-limit);
    }
  } catch (err) {
    logger.warn({ err, chatId }, 'chat_cache_read_failed');
  }

  const { rows } = await pool.query<MessageRow>(
    `SELECT id, chat_id, role, content, citations, truncated, created_at
       FROM messages
      WHERE chat_id = $1 AND user_id = $2
      ORDER BY created_at ASC
      LIMIT $3`,
    [chatId, userId, limit],
  );
  const msgs: ChatMessage[] = rows.map((r) => ({ role: r.role, content: r.content }));
  try {
    await redis.set(cacheKey(chatId), JSON.stringify(msgs), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, chatId }, 'chat_cache_write_failed');
  }
  return msgs;
};

const appendCache = async (chatId: string, message: ChatMessage): Promise<void> => {
  try {
    const cached = await redis.get(cacheKey(chatId));
    const arr = cached ? (JSON.parse(cached) as ChatMessage[]) : [];
    arr.push(message);
    await redis.set(
      cacheKey(chatId),
      JSON.stringify(arr.slice(-HISTORY_LIMIT)),
      'EX',
      CACHE_TTL_SECONDS,
    );
  } catch (err) {
    logger.warn({ err, chatId }, 'chat_cache_append_failed');
  }
};

export const saveExchange = async (opts: {
  chatId: string;
  userId: string;
  userContent: string;
  assistantContent: string;
  citations: Citation[];
  truncated: boolean;
}): Promise<{ userMessageId: string; assistantMessageId: string }> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query<{ id: string }>(
      `INSERT INTO messages (chat_id, user_id, role, content)
       VALUES ($1, $2, 'user', $3) RETURNING id`,
      [opts.chatId, opts.userId, opts.userContent],
    );
    const a = await client.query<{ id: string }>(
      `INSERT INTO messages (chat_id, user_id, role, content, citations, truncated)
       VALUES ($1, $2, 'assistant', $3, $4::jsonb, $5) RETURNING id`,
      [
        opts.chatId,
        opts.userId,
        opts.assistantContent,
        JSON.stringify(opts.citations),
        opts.truncated,
      ],
    );
    await client.query(`UPDATE chats SET updated_at = now() WHERE id = $1`, [opts.chatId]);
    await client.query('COMMIT');

    await appendCache(opts.chatId, { role: 'user', content: opts.userContent });
    await appendCache(opts.chatId, { role: 'assistant', content: opts.assistantContent });

    return { userMessageId: u.rows[0].id, assistantMessageId: a.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const listChats = async (
  userId: string,
  opts: { limit: number; before?: string },
): Promise<Array<{ id: string; title: string | null; updatedAt: string; createdAt: string }>> => {
  const params: unknown[] = [userId, opts.limit];
  let where = `user_id = $1`;
  if (opts.before) {
    params.push(opts.before);
    where += ` AND updated_at < $3`;
  }
  const { rows } = await pool.query<{
    id: string;
    title: string | null;
    updated_at: Date;
    created_at: Date;
  }>(
    `SELECT id, title, updated_at, created_at
       FROM chats
      WHERE ${where}
      ORDER BY updated_at DESC
      LIMIT $2`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  }));
};

export const listMessages = async (
  chatId: string,
  userId: string,
  opts: { limit: number; before?: string },
): Promise<PersistedMessage[]> => {
  const params: unknown[] = [chatId, userId, opts.limit];
  let where = `chat_id = $1 AND user_id = $2`;
  if (opts.before) {
    params.push(opts.before);
    where += ` AND created_at < $4`;
  }
  const { rows } = await pool.query<MessageRow>(
    `SELECT id, chat_id, role, content, citations, truncated, created_at
       FROM messages
      WHERE ${where}
      ORDER BY created_at ASC
      LIMIT $3`,
    params,
  );
  return rows.map(rowToMessage);
};
