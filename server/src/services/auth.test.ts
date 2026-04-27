import { describe, expect, it } from 'vitest';
import { credentialsSchema } from './auth.js';

describe('credentialsSchema', () => {
  it('accepts a valid pair', () => {
    const out = credentialsSchema.parse({ email: 'Alice@Example.COM', password: 'sup3rSecret' });
    expect(out.email).toBe('alice@example.com');
    expect(out.password).toBe('sup3rSecret');
  });

  it('rejects bad email', () => {
    expect(() => credentialsSchema.parse({ email: 'nope', password: 'longenough' })).toThrow();
  });

  it('rejects too-short password', () => {
    expect(() => credentialsSchema.parse({ email: 'a@b.co', password: 'short' })).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      credentialsSchema.parse({ email: 'a@b.co', password: 'longenough', role: 'admin' }),
    ).toThrow();
  });
});
