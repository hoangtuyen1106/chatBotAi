'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('vector', { ifNotExists: true });

  pgm.createType('document_status', ['pending', 'processing', 'ready', 'failed']);

  pgm.createTable('documents', {
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
    storage_key: { type: 'text', notNull: true },
    filename: { type: 'text', notNull: true },
    mime: { type: 'text', notNull: true },
    size_bytes: { type: 'bigint', notNull: true },
    status: { type: 'document_status', notNull: true, default: 'pending' },
    error: { type: 'text' },
    chunk_count: { type: 'integer', notNull: true, default: 0 },
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
  pgm.createIndex('documents', 'user_id');
  pgm.createIndex('documents', 'status');

  pgm.createTable('document_chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: '"documents"(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"(id)',
      onDelete: 'CASCADE',
    },
    chunk_index: { type: 'integer', notNull: true },
    content: { type: 'text', notNull: true },
    token_estimate: { type: 'integer', notNull: true, default: 0 },
    embedding: { type: 'vector(1024)' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('document_chunks', 'user_id');
  pgm.createIndex('document_chunks', 'document_id');
  pgm.addConstraint('document_chunks', 'document_chunks_doc_idx_unique', {
    unique: ['document_id', 'chunk_index'],
  });

  pgm.sql(`
    CREATE INDEX document_chunks_embedding_idx
      ON document_chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('document_chunks');
  pgm.dropTable('documents');
  pgm.dropType('document_status');
};
