import { env } from '../../config/env.js';
import type { VectorStore } from './index.js';
import { pgVectorStore } from './pgvector.js';
import { pineconeStore } from './pinecone.js';

export const getVectorStore = (): VectorStore =>
  env.VECTOR_STORE === 'pinecone' ? pineconeStore : pgVectorStore;
