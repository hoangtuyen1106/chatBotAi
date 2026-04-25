import type { VectorStore } from './index.js';

const notImplemented = (): never => {
  throw new Error(
    'Pinecone adapter not implemented yet. Set VECTOR_STORE=pgvector or implement adapters/vector-store/pinecone.ts.',
  );
};

export const pineconeStore: VectorStore = {
  upsert: () => notImplemented(),
  query: () => notImplemented(),
  deleteByDocument: () => notImplemented(),
};
