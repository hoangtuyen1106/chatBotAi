import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import { z } from 'zod';

import { env, isProd } from '../config/env.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

export const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export type Credentials = z.infer<typeof credentialsSchema>;

export interface SessionUser {
  id: string;
  email: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

const REFRESH_BYTES = 32;
const CSRF_BYTES = 32;

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const CSRF_COOKIE = 'csrf_token';

const refreshMaxAgeMs = env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;
// Hard-coded 15 min for the access cookie maxAge regardless of JWT_EXPIRES_IN string format —
// JWT lib accepts strings like "15m"/"1h" but Express cookies need ms.
const accessCookieMaxAgeMs = 15 * 60 * 1000;

const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
};

const hashRefresh = (raw: string): string => createHash('sha256').update(raw).digest('hex');

const signAccessToken = (userId: string): string => {
  const secret: Secret = env.JWT_SECRET;
  const options = { expiresIn: env.JWT_EXPIRES_IN } as SignOptions;
  return jwt.sign({ sub: userId, type: 'access' }, secret, options);
};

const mintRefreshToken = async (userId: string): Promise<string> => {
  const raw = randomBytes(REFRESH_BYTES).toString('hex');
  const hash = hashRefresh(raw);
  const expiresAt = new Date(Date.now() + refreshMaxAgeMs);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );
  return raw;
};

const generateCsrfToken = (): string => randomBytes(CSRF_BYTES).toString('hex');

export const issueSession = async (res: Response, user: SessionUser): Promise<void> => {
  const access = signAccessToken(user.id);
  const refresh = await mintRefreshToken(user.id);
  const csrf = generateCsrfToken();

  res.cookie(ACCESS_COOKIE, access, { ...baseCookie, maxAge: accessCookieMaxAgeMs });
  res.cookie(REFRESH_COOKIE, refresh, {
    ...baseCookie,
    path: '/auth',
    maxAge: refreshMaxAgeMs,
  });
  res.cookie(CSRF_COOKIE, csrf, {
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    httpOnly: false,
    maxAge: refreshMaxAgeMs,
  });
};

export const clearSession = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: '/auth' });
  res.clearCookie(CSRF_COOKIE, { secure: isProd, sameSite: 'lax', path: '/', httpOnly: false });
};

export const register = async (input: Credentials): Promise<SessionUser> => {
  const { email, password } = input;
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_COST);

  try {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash`,
      [email, passwordHash],
    );
    const user = rows[0];
    if (!user) throw new HttpError(500, 'Failed to create user', 'register_failed');
    return { id: user.id, email: user.email };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new HttpError(409, 'Email already registered', 'email_taken');
    }
    throw err;
  }
};

export const login = async (input: Credentials): Promise<SessionUser> => {
  const { email, password } = input;
  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, password_hash FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  const user = rows[0];

  const dummyHash = '$2b$12$abcdefghijklmnopqrstuuOZGgVcyklh4WJXFhXgYbhhPQv.VjhOK';
  const hash = user?.password_hash ?? dummyHash;
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) {
    throw new HttpError(401, 'Invalid email or password', 'invalid_credentials');
  }

  return { id: user.id, email: user.email };
};

interface RefreshRow {
  id: string;
  user_id: string;
  email: string;
}

export const rotateRefreshToken = async (rawRefresh: string): Promise<SessionUser> => {
  const hash = hashRefresh(rawRefresh);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<RefreshRow>(
      `SELECT rt.id, rt.user_id, u.email
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked_at IS NULL
          AND rt.expires_at > now()
        LIMIT 1`,
      [hash],
    );
    const row = rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      throw new HttpError(401, 'Invalid or expired refresh token', 'unauthorized');
    }
    await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
    await client.query('COMMIT');
    return { id: row.user_id, email: row.email };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
};

export const revokeRefreshToken = async (rawRefresh: string): Promise<void> => {
  const hash = hashRefresh(rawRefresh);
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash],
  );
};

export const getUserById = async (id: string): Promise<SessionUser | null> => {
  const { rows } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
};

export const cookieNames = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
  csrf: CSRF_COOKIE,
} as const;
