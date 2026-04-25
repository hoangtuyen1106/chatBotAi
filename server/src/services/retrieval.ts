import { openAiCompatEmbeddings } from '../adapters/embeddings/index.js';
import { getVectorStore, type VectorMatch } from '../adapters/vector-store/index.js';

export interface Citation {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  score: number;
  preview: string;
}

const PREVIEW_CHARS = 240;

export const retrieveContext = async (opts: {
  userId: string;
  question: string;
  topK?: number;
  documentId?: string;
}): Promise<{ chunks: VectorMatch[]; citations: Citation[] }> => {
  const [embedding] = await openAiCompatEmbeddings.embed([opts.question]);
  if (!embedding) return { chunks: [], citations: [] };

  const matches = await getVectorStore().query({
    userId: opts.userId,
    embedding,
    topK: opts.topK ?? 6,
    ...(opts.documentId ? { documentId: opts.documentId } : {}),
  });

  const citations: Citation[] = matches.map((m) => ({
    chunkId: m.id,
    documentId: m.documentId,
    chunkIndex: m.chunkIndex,
    score: Number(m.score.toFixed(4)),
    preview:
      m.content.length > PREVIEW_CHARS
        ? m.content.slice(0, PREVIEW_CHARS).trimEnd() + '…'
        : m.content,
  }));

  return { chunks: matches, citations };
};
