import type { ImageCrop } from '@purchasing-plus/shared';

export type ImageSize = { width: number; height: number };

const clamp = (value: number, limit: number) =>
  Math.max(0, Math.min(limit, Math.round(value)));

export function positionCrop(
  image: ImageSize,
  size: number,
  x: number,
  y: number,
): ImageCrop {
  return {
    x: clamp(x, image.width - size),
    y: clamp(y, image.height - size),
    size,
  };
}

export function centeredCrop(image: ImageSize): ImageCrop {
  const size = Math.min(image.width, image.height);
  return positionCrop(
    image,
    size,
    (image.width - size) / 2,
    (image.height - size) / 2,
  );
}

export function resizeCrop(
  image: ImageSize,
  crop: ImageCrop,
  size: number,
): ImageCrop {
  const offset = (crop.size - size) / 2;
  return positionCrop(image, size, crop.x + offset, crop.y + offset);
}

export function imageFramingStyle(image: ImageSize, crop: ImageCrop) {
  const percent = (pixels: number) => (pixels * 100) / crop.size + '%';
  return {
    width: percent(image.width),
    height: percent(image.height),
    insetInlineStart: percent(-crop.x),
    insetBlockStart: percent(-crop.y),
  };
}
