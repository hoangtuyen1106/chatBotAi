import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';
import { env } from '../../config/env.js';
import type { VectorMatch, VectorStore } from './index.js';

interface ChunkMetadata extends RecordMetadata {
  user_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
}

let cachedClient: Pinecone | null = null;
let cachedIndex: Index<ChunkMetadata> | null = null;

const getIndex = (): Index<ChunkMetadata> => {
  if (cachedIndex) return cachedIndex;
  if (!env.PINECONE_API_KEY || !env.PINECONE_INDEX) {
    throw new Error(
      'Pinecone is not configured. Set PINECONE_API_KEY and PINECONE_INDEX, or use VECTOR_STORE=pgvector.',
    );
  }
  cachedClient ??= new Pinecone({ apiKey: env.PINECONE_API_KEY });
  cachedIndex = cachedClient.index<ChunkMetadata>(env.PINECONE_INDEX);
  return cachedIndex;
};

export const pineconeStore: VectorStore = {
  async upsert(records) {
    if (records.length === 0) return;
    const index = getIndex();
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map((r) => ({
        id: r.id,
        values: r.embedding,
        metadata: {
          user_id: r.userId,
          document_id: r.documentId,
          chunk_index: r.chunkIndex,
          content: r.content,
        } satisfies ChunkMetadata,
      }));
      await index.upsert({ records: batch });
    }
  },

  async query({ userId, embedding, topK, documentId }) {
    const index = getIndex();
    const filter: Record<string, unknown> = { user_id: { $eq: userId } };
    if (documentId) filter.document_id = { $eq: documentId };

    const result = await index.query({
      vector: embedding,
      topK,
      filter,
      includeMetadata: true,
    });

    return (result.matches ?? []).flatMap<VectorMatch>((m) => {
      const md = m.metadata;
      if (!md) return [];
      return [
        {
          id: m.id,
          documentId: md.document_id,
          chunkIndex: md.chunk_index,
          content: md.content,
          score: m.score ?? 0,
        },
      ];
    });
  },

  async deleteByDocument(documentId) {
    const index = getIndex();
    await index.deleteMany({ filter: { document_id: { $eq: documentId } } });
  },
};
