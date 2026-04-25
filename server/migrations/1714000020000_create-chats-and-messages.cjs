'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType('message_role', ['system', 'user', 'assistant']);

  pgm.createTable('chats', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"(id)',
      onDelete: 'CASCADE',
    },
    title: { type: 'text' },
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
  pgm.createIndex('chats', ['user_id', 'updated_at']);

  pgm.createTable('messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    chat_id: {
      type: 'uuid',
      notNull: true,
      references: '"chats"(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"(id)',
      onDelete: 'CASCADE',
    },
    role: { type: 'message_role', notNull: true },
    content: { type: 'text', notNull: true },
    citations: { type: 'jsonb' },
    truncated: { type: 'boolean', notNull: true, default: false },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('messages', ['chat_id', 'created_at']);
  pgm.createIndex('messages', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('messages');
  pgm.dropTable('chats');
  pgm.dropType('message_role');
};
