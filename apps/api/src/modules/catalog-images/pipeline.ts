import {
  catalogImageDisplayLimit,
  imageCrop,
  type ImageCrop,
} from '@purchasing-plus/shared';
import { catalogImages as copy } from '@purchasing-plus/shared/i18n/ar';
import Busboy from 'busboy';
import type { RequestHandler } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import convert from 'heic-convert';
import sharp, { type Sharp } from 'sharp';

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
async function imageSource(input: Buffer) {
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
    return sharp(decoded, { limitInputPixels: maxPixels }).autoOrient();
  } catch {
    throw corrupt();
  }
}

function displayVariant(source: Sharp) {
  return source
    .resize(catalogImageDisplayLimit, catalogImageDisplayLimit, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
}

export async function imagePreview(input: Buffer) {
  const source = await imageSource(input);
  try {
    return (await displayVariant(source)).data;
  } catch {
    throw corrupt();
  }
}

export async function variants(input: Buffer) {
  const source = await imageSource(input);
  try {
    const thumb = await source
      .clone()
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const display = await displayVariant(source);
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
const badCrop = () =>
  new AppError(
    422,
    'INVALID_IMAGE_CROP',
    copy.cropInvalid,
    copy.cropInvalidFix,
  );
function parseCrop(value: string): ImageCrop {
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    throw badCrop();
  }
  const result = imageCrop.safeParse(input);
  if (!result.success) throw badCrop();
  return result.data;
}
export function assertCropBounds(
  crop: ImageCrop | null,
  { width, height }: { width: number; height: number },
) {
  if (crop && (crop.x + crop.size > width || crop.y + crop.size > height))
    throw badCrop();
}
export function readImageUpload(
  req: Parameters<RequestHandler>[0],
  allowCrop = false,
) {
  return new Promise<{ file: Buffer; crop: ImageCrop | null }>(
    (resolve, reject) => {
      if (req.aborted) {
        reject(badForm());
        return;
      }
      let parser: ReturnType<typeof Busboy>;
      try {
        parser = Busboy({
          headers: req.headers,
          limits: {
            fileSize: maxUploadBytes + 1,
            files: 1,
            fields: allowCrop ? 1 : 0,
            fieldSize: 128,
            parts: allowCrop ? 3 : 2,
          },
        });
      } catch {
        reject(badForm());
        return;
      }
      const chunks: Buffer[] = [];
      let found = false;
      let error: Error | undefined;
      let crop: ImageCrop | null = null;
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
      parser.on('field', (name, value, info) => {
        if (name !== 'crop' || info.nameTruncated || info.valueTruncated) {
          error = badCrop();
          return;
        }
        try {
          crop = parseCrop(value);
        } catch {
          error = badCrop();
        }
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
        else resolve({ file: Buffer.concat(chunks), crop });
      });
      req.pipe(parser);
    },
  );
}
export const prepareImage: RequestHandler = async (req, res, next) => {
  const { file, crop } = await readImageUpload(req, true);
  const image = await variants(file);
  assertCropBounds(crop, image);
  res.locals.image = { ...image, crop };
  next();
};
