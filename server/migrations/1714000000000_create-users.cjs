'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('citext', { ifNotExists: true });
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    email: {
      type: 'citext',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('users', 'email', { name: 'users_email_idx' });
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
