import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

import { parseEnv } from '../config/env.js';
import { createStorage } from '../lib/storage.js';

let step = 'configuration';
try {
  const env = parseEnv(process.env);
  if (env.STORAGE_DRIVER !== 'r2') throw new Error('Set STORAGE_DRIVER=r2.');
  const storage = createStorage(env);
  const key = `catalog/1/${randomUUID()}-thumb.webp`;
  const bytes = await sharp({
    create: { width: 1, height: 1, channels: 3, background: 'white' },
  })
    .webp()
    .toBuffer();
  try {
    step = 'upload';
    await storage.put(key, bytes, 'image/webp');

    step = 'read';
    const response = await fetch(await storage.url(key), {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (
      !response.ok ||
      !bytes.equals(Buffer.from(await response.arrayBuffer()))
    )
      throw new Error('Read did not return the uploaded WebP.');
  } finally {
    try {
      await storage.delete(key);
    } catch {
      process.stderr.write(`Could not clean up the R2 test object: ${key}\n`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode)
    process.stdout.write('R2 upload, read and delete OK.\n');
} catch (error) {
  const detail =
    step === 'configuration' && error instanceof Error
      ? ` ${error.message}`
      : '';
  process.stderr.write(`R2 storage check failed during ${step}.${detail}\n`);
  process.exitCode = 1;
}
