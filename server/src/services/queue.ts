import Bull, { type Queue } from 'bull';
import { env } from '../config/env.js';

export interface IngestJobData {
  documentId: string;
  userId: string;
  storageKey: string;
  mime: string;
}

export const INGEST_QUEUE = 'ingest-document';

let queueInstance: Queue<IngestJobData> | null = null;

export const ingestQueue = (): Queue<IngestJobData> => {
  if (!queueInstance) {
    queueInstance = new Bull<IngestJobData>(INGEST_QUEUE, env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return queueInstance;
};

export const closeQueue = async (): Promise<void> => {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
};
