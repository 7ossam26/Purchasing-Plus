import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { RequestHandler } from 'express';

import type { AppEnv } from '../config/env.js';
import { missing } from '../middleware/access.js';

export const urlSeconds = 3600;
export const mediaPath = '/api/v1/media';
export const r2Origin = (account: string) =>
  `https://${account}.r2.cloudflarestorage.com`;
export interface StorageDriver {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  url(key: string): Promise<string>;
}
const keyPattern = /^catalog\/[1-9]\d*\/[a-f0-9-]{36}-(?:thumb|display)\.webp$/;
function validate(key: string) {
  if (!keyPattern.test(key)) throw missing();
}
function publicUrl(base: string, key: string) {
  return base.replace(/\/+$/, '') + '/' + key;
}

export class LocalStorage implements StorageDriver {
  constructor(
    private root: string,
    private secret: string,
    private base?: string,
  ) {}
  private path(key: string) {
    validate(key);
    return resolve(this.root, key);
  }
  private sign(key: string, expires: number) {
    return createHmac('sha256', this.secret)
      .update(`media:${key}:${expires}`)
      .digest();
  }
  async put(key: string, buffer: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
  async url(key: string) {
    validate(key);
    if (this.base) return publicUrl(this.base, key);
    const expires = Math.floor(Date.now() / 1000) + urlSeconds;
    return `${mediaPath}/${key}?expires=${expires}&signature=${this.sign(key, expires).toString('hex')}`;
  }
  serve: RequestHandler = (req, res, next) => {
    const key = (req.params.key as string[]).join('/');
    const { expires, signature } = req.query;
    if (!this.base) {
      const end = Number(expires);
      if (
        typeof expires !== 'string' ||
        !Number.isSafeInteger(end) ||
        end <= Math.floor(Date.now() / 1000) ||
        typeof signature !== 'string' ||
        !/^[0-9a-f]{64}$/.test(signature) ||
        !timingSafeEqual(Buffer.from(signature, 'hex'), this.sign(key, end))
      )
        throw missing();
    }
    res
      .type('webp')
      .set('Cache-Control', 'private, no-store')
      .sendFile(this.path(key), (error) => {
        if (error)
          next(
            (error as NodeJS.ErrnoException).code === 'ENOENT'
              ? missing()
              : error,
          );
      });
  };
}

export class R2Storage implements StorageDriver {
  constructor(
    private client: Pick<S3Client, 'send'>,
    private bucket: string,
    private base?: string,
    private presign = getSignedUrl,
  ) {}
  async put(key: string, buffer: Buffer, contentType: string) {
    validate(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }
  async delete(key: string) {
    validate(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
  async url(key: string) {
    validate(key);
    return this.base
      ? publicUrl(this.base, key)
      : this.presign(
          this.client as S3Client,
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
          { expiresIn: urlSeconds },
        );
  }
}

export function createStorage(env: AppEnv) {
  if (env.STORAGE_DRIVER === 'local')
    return new LocalStorage(
      resolve('storage'),
      env.SESSION_SECRET,
      env.STORAGE_PUBLIC_BASE_URL,
    );
  return new R2Storage(
    new S3Client({
      region: 'auto',
      endpoint: r2Origin(env.R2_ACCOUNT_ID!),
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
    env.R2_BUCKET!,
    env.STORAGE_PUBLIC_BASE_URL,
  );
}
