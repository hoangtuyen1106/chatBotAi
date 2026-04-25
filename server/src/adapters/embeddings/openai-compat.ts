import OpenAI from 'openai';

import { env } from '../../config/env.js';
import type { EmbeddingClient } from './index.js';

const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY || 'placeholder',
  baseURL: env.OPENAI_BASE_URL,
});

const BATCH_SIZE = 16;

const embedBatch = async (model: string, texts: string[]): Promise<number[][]> => {
  const res = await client.embeddings.create({ model, input: texts });
  return res.data.map((d) => d.embedding);
};

export const openAiCompatEmbeddings: EmbeddingClient = {
  dim: 1024,

  async embed(texts) {
    if (texts.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const vectors = await embedBatch(env.OPENAI_EMBEDDING_MODEL, batch);
      out.push(...vectors);
    }
    return out;
  },
};
