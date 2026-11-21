import type { ReportTable } from '@purchasing-plus/shared';
import ExcelJS from 'exceljs';

import { excelValue } from './tables.js';

export async function workbook(table: ReportTable): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(table.title.slice(0, 31), {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = table.columns.map(({ key, label, kind }) => ({
    key,
    header: label,
    width: Math.max(16, label.length + 4),
    style:
      kind === 'money'
        ? { numFmt: '#,##0.00' }
        : kind === 'percent'
          ? { numFmt: '0.00%' }
          : {},
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of table.rows)
    sheet.addRow(
      table.columns.map(({ key, kind }) => excelValue(row[key], kind)),
    );
  return Buffer.from(await book.xlsx.writeBuffer());
}
