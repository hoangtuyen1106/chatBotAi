export interface VectorRecord {
  id: string;
  documentId: string;
  userId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface VectorMatch {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  score: number;
}

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  query(opts: {
    userId: string;
    embedding: number[];
    topK: number;
    documentId?: string;
  }): Promise<VectorMatch[]>;
  deleteByDocument(documentId: string): Promise<void>;
}

export { getVectorStore } from './factory.js';
