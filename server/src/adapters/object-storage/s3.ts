import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

import { env } from '../../config/env.js';
import type { ObjectStorage } from './index.js';

const client = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
};

export const s3Storage: ObjectStorage = {
  async put(key, body, contentType) {
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  },

  async get(key) {
    const out = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!out.Body) throw new Error(`S3 object ${key} has no body`);
    return streamToBuffer(out.Body as Readable);
  },

  async remove(key) {
    await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },
};
