import Busboy from 'busboy';
import type { RequestHandler } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import convert from 'heic-convert';
import sharp from 'sharp';

import { AppError } from '../../middleware/errors.js';

export const maxUploadBytes = 15 * 1024 * 1024;
const maxPixels = 50_000_000;
const accepted = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heic-sequence',
  'image/heif',
  'image/heif-sequence',
]);
const corrupt = () =>
  new AppError(
    422,
    'INVALID_IMAGE',
    'الصورة مش سليمة أو حجمها كبير جدًا',
    'جرّب صورة تانية.',
  );
export async function variants(input: Buffer) {
  if (input.length > maxUploadBytes) throw tooLarge();
  const mime = await fileTypeFromBuffer(input).catch(() => undefined);
  if (!mime || !accepted.has(mime.mime))
    throw new AppError(
      422,
      'IMAGE_TYPE',
      'نوع الصورة مش مدعوم',
      'اختار JPEG أو PNG أو WebP أو HEIC.',
    );
  try {
    const { width, height } = await sharp(input, {
      limitInputPixels: maxPixels,
    }).metadata();
    if (!width || !height || width * height > maxPixels) throw corrupt();
    // libheif applies HEIF container transforms. Sharp applies EXIF orientation on other formats.
    const decoded = /^image\/hei[cf]/.test(mime.mime)
      ? Buffer.from(await convert({ buffer: input, format: 'PNG' }))
      : input;
    const source = sharp(decoded, { limitInputPixels: maxPixels }).autoOrient();
    const thumb = await source
      .clone()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const display = await source
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return {
      thumb,
      display: display.data,
      width: display.info.width,
      height: display.info.height,
    };
  } catch {
    throw corrupt();
  }
}
function tooLarge() {
  return new AppError(
    422,
    'IMAGE_TOO_LARGE',
    'الصورة أكبر من 15 ميجابايت',
    'اختار صورة أصغر.',
  );
}
const badForm = () =>
  new AppError(422, 'IMAGE_REQUIRED', 'ارفع صورة واحدة في حقل الملف.');
export const prepareImage: RequestHandler = async (req, res, next) => {
  const file = await new Promise<Buffer>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: maxUploadBytes + 1, files: 1, fields: 0, parts: 2 },
      });
    } catch {
      reject(badForm());
      return;
    }
    const chunks: Buffer[] = [];
    let found = false;
    let error: Error | undefined;
    parser.on('file', (name, stream) => {
      found = name === 'file';
      stream.on('data', (chunk: Buffer) => {
        if (found) chunks.push(chunk);
      });
      stream.on('limit', () => {
        error = tooLarge();
      });
      stream.on('error', reject);
    });
    parser.on('filesLimit', () => {
      error = badForm();
    });
    parser.on('fieldsLimit', () => {
      error = badForm();
    });
    parser.on('partsLimit', () => {
      error = badForm();
    });
    parser.on('error', () => reject(badForm()));
    const aborted = () => parser.destroy(badForm());
    req.once('aborted', aborted);
    parser.on('close', () => {
      req.off('aborted', aborted);
      if (error || !found) reject(error ?? badForm());
      else resolve(Buffer.concat(chunks));
    });
    req.pipe(parser);
  });
  res.locals.image = await variants(file);
  next();
};
