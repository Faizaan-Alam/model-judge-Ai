import * as Minio from "minio";
import { config } from "../config";

let client: Minio.Client | null = null;

export function getMinio(): Minio.Client {
  if (!client) {
    client = new Minio.Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  const c = getMinio();
  const exists = await c.bucketExists(config.minio.bucket);
  if (!exists) {
    await c.makeBucket(config.minio.bucket, "us-east-1");
    console.log(`[api] created bucket ${config.minio.bucket}`);
  }
}

export async function putObject(
  key: string,
  data: Buffer | NodeJS.ReadableStream,
  size?: number,
  meta?: Record<string, string>
): Promise<void> {
  const c = getMinio();
  if (Buffer.isBuffer(data)) {
    await c.putObject(config.minio.bucket, key, data, data.length, meta);
  } else {
    await c.putObject(config.minio.bucket, key, data, size, meta);
  }
}

export async function presignedGet(key: string, expirySec = 900): Promise<string> {
  return getMinio().presignedGetObject(config.minio.bucket, key, expirySec);
}
