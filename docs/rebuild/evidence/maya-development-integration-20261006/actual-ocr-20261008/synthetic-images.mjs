// Synthetic table pixels only. No image/document inputs, external fonts or URLs.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire('/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend/package.json');
const sharp = require('sharp');
export const tables = Object.freeze({
  russian: {
    headers: ['Товар', 'Кол-во', 'Ед', 'Цена', 'Сумма'],
    rows: [['Шампунь Кедр', '2', 'шт', '350.00', '700.00'], ['Крем для рук', '1', 'шт', '125.50', '125.50']],
  },
  changed: {
    headers: ['Товар', 'Кол-во', 'Ед', 'Цена', 'Сумма'],
    rows: [['Шампунь Лес', '3', 'шт', '350.00', '1050.00'], ['Крем для рук', '1', 'шт', '125.50', '125.50']],
  },
  english: {
    headers: ['Description', 'Qty', 'Unit', 'Price', 'Amount'],
    rows: [['Cedar Shampoo', '2', 'pcs', '350.00', '700.00'], ['Hand Cream', '1', 'pcs', '125.50', '125.50']],
  },
});
const width = 1800, height = 440;
const positions = [60, 730, 960, 1170, 1460];
function svg(table) {
  const text = (values, y) => values.map((value, index) => {
    // All strings are finite literals above; no arbitrary XML or user content.
    const escaped = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return `<text x="${positions[index]}" y="${y}">${escaped}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><g fill="#000000" font-family="Arial" font-size="42">${text(table.headers, 100)}${text(table.rows[0], 230)}${text(table.rows[1], 360)}</g></svg>`;
}
export async function generateSyntheticImages(directory) {
  assertFreshDirectory(directory);
  fs.mkdirSync(directory, { mode: 0o700 });
  const fixtures = {};
  for (const [name, table] of Object.entries(tables)) {
    const source = svg(table);
    const png = await sharp(Buffer.from(source)).png().toBuffer();
    const svgPath = path.join(directory, name + '.svg');
    const pngPath = path.join(directory, name + '.png');
    fs.writeFileSync(svgPath, source, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(pngPath, png, { flag: 'wx', mode: 0o600 });
    fixtures[name] = { path: pngPath, sha256: digest(png), bytes: png.length, width, height, synthetic: true };
    png.fill(0);
  }
  const blank = await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const blankPath = path.join(directory, 'blank.png');
  fs.writeFileSync(blankPath, blank, { flag: 'wx', mode: 0o600 });
  fixtures.blank = { path: blankPath, sha256: digest(blank), bytes: blank.length, width, height, synthetic: true };
  blank.fill(0);
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ contract: 'maya.synthetic-ocr-images/1', generator: 'INSTALLED_SHARP_SVG_TEXT', fixtures }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return fixtures;
}
function assertFreshDirectory(directory) {
  if (!path.isAbsolute(directory) || fs.existsSync(directory)) throw new Error('New absolute synthetic fixture directory required');
}
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
