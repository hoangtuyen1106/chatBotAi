import bcrypt from 'bcrypt';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/errorHandler.js';

export const credentialsSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

export type Credentials = z.infer<typeof credentialsSchema>;

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

const signToken = (userId: string): string => {
  const secret: Secret = env.JWT_SECRET;
  const options = { expiresIn: env.JWT_EXPIRES_IN } as SignOptions;
  return jwt.sign({ sub: userId }, secret, options);
};

export const register = async (input: Credentials): Promise<AuthResult> => {
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
    return { token: signToken(user.id), user: { id: user.id, email: user.email } };
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
      throw new HttpError(409, 'Email already registered', 'email_taken');
    }
    throw err;
  }
};

export const login = async (input: Credentials): Promise<AuthResult> => {
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

  return { token: signToken(user.id), user: { id: user.id, email: user.email } };
};
