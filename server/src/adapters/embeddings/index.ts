export interface EmbeddingClient {
  /** Vector dimension this client produces (must match VectorStore column). */
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

export { openAiCompatEmbeddings } from './openai-compat.js';
