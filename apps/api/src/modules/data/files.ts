import { Readable } from 'node:stream';

import {
  dataColumnLabel,
  dataColumns,
  maxDataFileBytes,
  type DataEntity,
  type DataIssue,
} from '@purchasing-plus/shared';
import { dataUi } from '@purchasing-plus/shared/i18n/ar';
import Busboy from 'busboy';
import ExcelJS from 'exceljs';
import type { Request, Response } from 'express';

import { AppError } from '../../middleware/errors.js';

export type Cells = Record<string, string | boolean>;
export type FileRow = { number: number; cells: Record<string, string> };
export type DataFile = { rows: FileRow[]; errors: DataIssue[] };
export const excelMime =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const badUpload = () =>
  new AppError(
    422,
    'INVALID_DATA_FILE',
    'ارفع ملف Excel أو CSV واحد.',
    'استخدم نموذج Excel أو احفظ الملف بصيغة CSV بترميز UTF-8.',
  );
const tooLarge = () =>
  new AppError(
    422,
    'DATA_FILE_TOO_LARGE',
    'الملف أكبر من 10 ميجابايت.',
    'قسّم الصفوف على أكتر من ملف.',
  );

export async function uploadData(req: Request, entity: DataEntity) {
  const upload = await new Promise<{ filename: string; bytes: Buffer }>(
    (resolve, reject) => {
      let parser: ReturnType<typeof Busboy>;
      try {
        parser = Busboy({
          headers: req.headers,
          limits: {
            files: 1,
            fields: 0,
            parts: 2,
            fileSize: maxDataFileBytes + 1,
          },
        });
      } catch {
        reject(badUpload());
        return;
      }
      const chunks: Buffer[] = [];
      let filename = '';
      let error: AppError | undefined;
      parser.on('file', (field, stream, info) => {
        if (field === 'file') filename = info.filename ?? '';
        stream.on('data', (chunk: Buffer) => {
          if (filename) chunks.push(chunk);
        });
        stream.on('limit', () => {
          error = tooLarge();
        });
        stream.on('error', () => reject(badUpload()));
      });
      for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const)
        parser.on(event, () => {
          error ??= badUpload();
        });
      const aborted = () => parser.destroy(badUpload());
      req.once('aborted', aborted);
      parser.on('error', () => reject(badUpload()));
      parser.on('close', () => {
        req.off('aborted', aborted);
        if (error || !filename) reject(error ?? badUpload());
        else resolve({ filename, bytes: Buffer.concat(chunks) });
      });
      req.pipe(parser);
    },
  );
  const { bytes, filename } = upload;
  if (bytes.length > maxDataFileBytes) throw tooLarge();
  return readData(entity, filename, bytes);
}

function cellText(cell: ExcelJS.Cell): string | undefined {
  const value = cell.value;
  if (value == null) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  )
    return String(value).trim();
  if ('richText' in value)
    return value.richText
      .map(({ text }) => text)
      .join('')
      .trim();
  return undefined;
}

async function readData(
  entity: DataEntity,
  filename: string,
  bytes: Buffer,
): Promise<DataFile> {
  const book = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (
      /\.xlsx$/i.test(filename) &&
      bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
    ) {
      await book.xlsx.load(new Uint8Array(bytes).buffer);
      if (book.worksheets.length === 1) sheet = book.worksheets[0];
    } else if (/\.csv$/i.test(filename)) {
      const csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!csv.includes('\0'))
        sheet = await book.csv.read(Readable.from([csv]), {
          map: (cell: string) => cell,
        });
    }
  } catch {
    throw badUpload();
  }
  if (!sheet) throw badUpload();
  const keys = dataColumns[entity];
  const columns = new Map<number, string>();
  const errors: DataIssue[] = [];
  const rows: FileRow[] = [];
  const header = (row: number, column: string) =>
    errors.push({
      row,
      column,
      message: 'عناوين الأعمدة مختلفة عن النموذج.',
      fix: 'نزّل النموذج وانسخ البيانات تحت أول صفين.',
    });
  const keyRow = sheet.getRow(2);
  for (let col = 1; col <= keyRow.cellCount; col++) {
    const cell = cellText(keyRow.getCell(col));
    if (cell === '') continue;
    if (!cell || !keys.includes(cell) || [...columns.values()].includes(cell)) {
      header(2, keyRow.getCell(col).address.replace(/\d+$/, ''));
      continue;
    }
    columns.set(col, cell);
    if (cellText(sheet.getRow(1).getCell(col)) !== dataColumnLabel(cell))
      header(1, cell);
  }
  for (const key of keys) {
    if (![...columns.values()].includes(key)) header(2, key);
  }
  if (errors.length) return { rows, errors };
  sheet.eachRow((row, number) => {
    if (number <= 2) return;
    const cells: FileRow['cells'] = {};
    let hasData = false;
    row.eachCell((cell, col) => {
      const value = cellText(cell);
      if (value === '') return;
      hasData = true;
      const key = columns.get(col);
      if (key && value !== undefined && !value.includes('\0'))
        cells[key] = value;
      else
        errors.push({
          row: number,
          column: key ?? cell.address.replace(/\d+$/, ''),
          message: key
            ? 'نوع الخلية غير مدعوم.'
            : 'العمود مش موجود في النموذج.',
          fix: key
            ? 'اكتب القيمة مباشرة في الخلية.'
            : 'انقل القيمة لعمود من النموذج.',
        });
    });
    if (hasData) rows.push({ number, cells });
  });
  return { rows, errors };
}

export async function makeWorkbook(entity: DataEntity, rows: Cells[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(dataUi.entities[entity], {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 2 }],
  });
  const keys = dataColumns[entity];
  sheet.columns = keys.map((key) => ({
    width: Math.max(18, key.length + 4),
    style: { numFmt: '@' },
  }));
  sheet.addRow(keys.map(dataColumnLabel)).font = { bold: true };
  sheet.addRow([...keys]);
  for (const row of rows) sheet.addRow(keys.map((key) => row[key] ?? ''));
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function sendWorkbook(res: Response, filename: string, file: Buffer) {
  res.type(excelMime).attachment(filename).send(file);
}
