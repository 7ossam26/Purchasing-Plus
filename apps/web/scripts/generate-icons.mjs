import { Buffer } from 'node:buffer';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import sharp from 'sharp';

const output = new URL('../public/icons/', import.meta.url);
const logo = (
  await readFile(
    new URL('../../../assets/brand/logo.svg', import.meta.url),
    'utf8',
  )
).replaceAll('currentColor', '#FFFFFF');
await mkdir(output, { recursive: true });
for (const [name, size, scale] of [
  ['favicon', 64, 0.69],
  ['icon-192', 192, 0.69],
  ['icon-512', 512, 0.69],
  ['maskable-512', 512, 0.55],
]) {
  const inset = Math.round((size * (1 - scale)) / 2);
  const markSize = size - inset * 2;
  const mark = logo.replace(
    '<svg ',
    `<svg x="${inset}" y="${inset}" width="${markSize}" height="${markSize}" `,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#000000"/>${mark}</svg>`;
  await sharp(Buffer.from(svg))
    .removeAlpha()
    .png()
    .toFile(fileURLToPath(new URL(name + '.png', output)));
}
