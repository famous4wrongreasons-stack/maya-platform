/**
 * Deterministic, deliberately narrow OCR structurer. Input is measured top-left
 * normalized local OCR word boxes, never an LLM answer or prebuilt invoice rows.
 *
 * Supported scope: one horizontal five-column header, 1..20 single-line item
 * rows and an optional final Итого/Total footer. Text above the header is ignored.
 * Wrapped names, extra columns, multiple tables, content below the footer and
 * ambiguous geometry are refused. This is not a general invoice parser.
 *
 * Decimal punctuation may be normalized from comma to dot; digits and precision
 * are preserved. No arithmetic, guessed currency, purchase/sale meaning, goods
 * ID, unit conversion or matching is performed. Owner review remains mandatory.
 */
export type GoodsPhotoOcrRowsErrorCode =
  | 'goods_photo_ocr_words_invalid'
  | 'goods_photo_ocr_table_unsupported'
  | 'goods_photo_ocr_table_ambiguous'
  | 'goods_photo_ocr_rows_unavailable';

export class GoodsPhotoOcrRowsError extends Error {
  constructor(readonly code: GoodsPhotoOcrRowsErrorCode) {
    super(code);
    this.name = 'GoodsPhotoOcrRowsError';
  }
}

export interface GoodsPhotoOcrRow {
  readonly name: string;
  readonly quantity: string | null;
  readonly unit_label: string | null;
  readonly unit_price: string | null;
  readonly line_total: string | null;
  readonly price_kind: null;
  /** Engines measure words, not a complete row. No derived probability. */
  readonly confidence: null;
}
export interface GoodsPhotoOcrRowsResult {
  readonly lines: readonly GoodsPhotoOcrRow[];
}

interface Word {
  readonly text: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly confidence: number;
}
interface GeometryLine {
  readonly center: number;
  readonly height: number;
  readonly words: Word[];
}
const MAX_WORDS = 4000;
const MAX_TEXT = 256;
const MAX_ROWS = 20;
// Literal transcription only. Unrecognized abbreviations remain unknown: never
// repair Latin n/Kr into Cyrillic л/кг or infer a catalog unit/conversion.
const TESSERACT_UNIT_LABELS = new Set([
  'шт',
  'шт.',
  'л',
  'мл',
  'кг',
  'г',
  'pcs',
  'pc',
  'l',
  'ml',
  'kg',
  'g',
]);
const MAX_GEOMETRY_LINES = 128;
const EPSILON = 1e-9;
const CONTROL = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;
const ROOT_KEYS = [
  'contract',
  'image_width',
  'image_height',
  'revision',
  'languages',
  'words',
];
const WORD_KEYS = ['text', 'left', 'top', 'width', 'height', 'confidence'];
const HEADERS: readonly (readonly string[])[] = [
  ['название', 'наименование', 'товар', 'item', 'description'],
  ['кол-во', 'количество', 'qty'],
  ['ед', 'ед.', 'unit', 'unit.'],
  ['цена', 'price'],
  ['сумма', 'amount', 'total'],
];
function fail(code: GoodsPhotoOcrRowsErrorCode): never {
  throw new GoodsPhotoOcrRowsError(code);
}
function invalid(): never {
  fail('goods_photo_ocr_words_invalid');
}

/** Closed own data fields. Accessors and inherited values never become OCR facts. */
function closedRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const names = Reflect.ownKeys(value);
  if (
    names.length !== keys.length ||
    names.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    invalid();
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) invalid();
    out[key] = descriptor.value;
  }
  return out;
}
function fraction(value: unknown, positive = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1 ||
    (positive && value === 0)
  )
    invalid();
  return value;
}
function closedArray(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value)) invalid();
  const size = Object.getOwnPropertyDescriptor(value, 'length');
  const length: unknown = size && 'value' in size ? size.value : undefined;
  if (
    typeof length !== 'number' ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > max ||
    Reflect.ownKeys(value).length !== length + 1
  )
    invalid();
  const values: unknown[] = [];
  for (let i = 0; i < length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor)) invalid();
    values.push(descriptor.value);
  }
  return values;
}
function measuredWords(input: unknown): { words: Word[]; tesseract: boolean } {
  const root = closedRecord(input, ROOT_KEYS);
  const languages = closedArray(root.languages, 2),
    words = closedArray(root.words, MAX_WORDS);
  const supportedEngine =
    (root.contract === 'maya.local-vision.words/1' &&
      root.revision === 3 &&
      languages[0] === 'ru-RU' &&
      languages[1] === 'en-US') ||
    (root.contract === 'maya.tesseract.words/1' &&
      root.revision === 1 &&
      languages[0] === 'rus' &&
      languages[1] === 'eng');
  if (
    !supportedEngine ||
    !Number.isSafeInteger(root.image_width) ||
    Number(root.image_width) <= 0 ||
    !Number.isSafeInteger(root.image_height) ||
    Number(root.image_height) <= 0 ||
    languages.length !== 2
  )
    invalid();
  const projected = words.map((value) => {
    const row = closedRecord(value, WORD_KEYS);
    if (
      typeof row.text !== 'string' ||
      row.text.length > MAX_TEXT ||
      !row.text.trim() ||
      CONTROL.test(row.text)
    )
      invalid();
    const word: Word = {
      text: row.text.trim(),
      left: fraction(row.left),
      top: fraction(row.top),
      width: fraction(row.width, true),
      height: fraction(row.height, true),
      confidence: fraction(row.confidence),
    };
    if (
      word.left + word.width > 1 + EPSILON ||
      word.top + word.height > 1 + EPSILON
    )
      invalid();
    return word;
  });
  return {
    words: projected,
    tesseract: root.contract === 'maya.tesseract.words/1',
  };
}
const centerX = (word: Word): number => word.left + word.width / 2;
const centerY = (word: Word): number => word.top + word.height / 2;
const label = (words: readonly Word[]): string =>
  words
    .map((word) => word.text)
    .join(' ')
    .replace(/[ \u00a0\u202f]+/gu, ' ')
    .trim();
const headerColumn = (word: Word): number =>
  HEADERS.findIndex((aliases) => aliases.includes(word.text.toLowerCase()));

function geometryLines(words: readonly Word[]): GeometryLine[] {
  const lines: GeometryLine[] = [];
  for (const word of [...words].sort(
    (a, b) => centerY(a) - centerY(b) || a.left - b.left,
  )) {
    // An anchored line cannot grow through a chain of progressively lower words.
    const candidates = lines.filter(
      (line) =>
        Math.abs(centerY(word) - line.center) <=
        Math.min(word.height, line.height) * 0.5 + EPSILON,
    );
    if (candidates.length > 1) fail('goods_photo_ocr_table_ambiguous');
    if (candidates.length === 1) candidates[0].words.push(word);
    else {
      if (lines.length >= MAX_GEOMETRY_LINES)
        fail('goods_photo_ocr_table_unsupported');
      lines.push({ center: centerY(word), height: word.height, words: [word] });
    }
  }
  for (const line of lines)
    line.words.sort((a, b) => a.left - b.left || a.width - b.width);
  return lines.sort((a, b) => a.center - b.center);
}
function horizontalOrder(words: readonly Word[]): void {
  for (let i = 1; i < words.length; i += 1) {
    const previous = words[i - 1],
      current = words[i];
    if (
      previous.left + previous.width - current.left >
      Math.min(previous.width, current.width) * 0.2 + EPSILON
    )
      fail('goods_photo_ocr_table_ambiguous');
  }
}
function tableBoundaries(header: GeometryLine): number[] {
  horizontalOrder(header.words);
  const words = header.words;
  const gap = words[1].left - (words[0].left + words[0].width);
  if (gap <= 0) fail('goods_photo_ocr_table_ambiguous');
  // The name column is wide and left-aligned. Numeric columns begin at the
  // quantity header; a center midpoint with the short name header would cut names.
  const first = words[1].left - Math.min(words[1].height, gap / 4);
  const boundaries = [
    0,
    first,
    (centerX(words[1]) + centerX(words[2])) / 2,
    (centerX(words[2]) + centerX(words[3])) / 2,
    (centerX(words[3]) + centerX(words[4])) / 2,
    1,
  ];
  if (
    boundaries.some(
      (value, index) => index > 0 && value <= boundaries[index - 1],
    )
  )
    fail('goods_photo_ocr_table_ambiguous');
  for (let i = 0; i < words.length; i += 1) {
    if (
      words[i].left < boundaries[i] - EPSILON ||
      words[i].left + words[i].width > boundaries[i + 1] + EPSILON
    )
      fail('goods_photo_ocr_table_ambiguous');
  }
  return boundaries;
}
function cells(line: GeometryLine, boundaries: readonly number[]): Word[][] {
  horizontalOrder(line.words);
  const out: Word[][] = [[], [], [], [], []];
  for (const word of line.words) {
    const column =
      boundaries.findIndex(
        (right, index) => index > 0 && centerX(word) < right,
      ) - 1;
    if (
      column < 0 ||
      word.left < boundaries[column] - EPSILON ||
      word.left + word.width > boundaries[column + 1] + EPSILON
    )
      fail('goods_photo_ocr_table_ambiguous');
    out[column].push(word);
  }
  return out;
}
function decimal(words: readonly Word[]): string | null {
  const raw = label(words);
  // Spaces, currency signs, thousands separators, signs and OCR confusions remain
  // unknown. Never turn O into 0, infer a missing decimal, or calculate a total.
  // Mixed RU/EN input cannot disambiguate 1,250 as decimal vs grouped thousands.
  if (/^[1-9]\d{0,2},\d{3}$/.test(raw)) return null;
  return /^(0|[1-9]\d{0,11})(?:[.,]\d{1,6})?$/.test(raw)
    ? raw.replace(',', '.')
    : null;
}
function footer(line: GeometryLine): boolean {
  const first = line.words[0].text.toLowerCase().replace(/:$/, '');
  if (first !== 'итого' && first !== 'total') return false;
  // Avoid interpreting a footer or the beginning of a second section as a good.
  // Additional alphabetic text makes this narrow layout unsupported, not a guess.
  if (line.words.slice(1).some((word) => /\p{L}/u.test(word.text)))
    fail('goods_photo_ocr_table_unsupported');
  return true;
}

export function structureGoodsPhotoOcrRows(
  input: unknown,
): GoodsPhotoOcrRowsResult {
  const { words, tesseract } = measuredWords(input);
  // Tesseract scores are uncalibrated OCR measurements, never success probabilities.
  // Weak cells remain unknown; this does not certify the remaining text as correct.
  const numeric = (cell: readonly Word[]) =>
    tesseract && cell.some((word) => word.confidence < 0.7)
      ? null
      : decimal(cell);
  if (words.length === 0) fail('goods_photo_ocr_rows_unavailable');
  const lines = geometryLines(words);
  const candidates = lines
    .map((line, index) => ({
      line,
      index,
      columns: line.words.map(headerColumn),
    }))
    .filter(
      (candidate) =>
        candidate.columns.filter((column) => column >= 0).length >= 3,
    );
  if (candidates.length > 1) fail('goods_photo_ocr_table_ambiguous');
  if (candidates.length !== 1) fail('goods_photo_ocr_table_unsupported');
  const header = candidates[0];
  if (
    header.columns.length !== 5 ||
    header.columns.some((column, index) => column !== index)
  )
    fail('goods_photo_ocr_table_unsupported');
  if (tesseract && header.line.words.some((word) => word.confidence < 0.5))
    fail('goods_photo_ocr_table_unsupported');
  const boundaries = tableBoundaries(header.line),
    rows: GoodsPhotoOcrRow[] = [];
  let ended = false;
  for (const line of lines.slice(header.index + 1)) {
    if (ended) fail('goods_photo_ocr_table_unsupported');
    if (footer(line)) {
      ended = true;
      continue;
    }
    const columns = cells(line, boundaries),
      name = label(columns[0]),
      unit = label(columns[2]);
    if (
      !name ||
      (tesseract && columns[0].some((word) => word.confidence < 0.5)) ||
      name.length > 240 ||
      !/\p{L}/u.test(name) ||
      unit.length > 240 ||
      columns.slice(1).every((column) => column.length === 0)
    )
      fail('goods_photo_ocr_rows_unavailable');
    if (rows.length >= MAX_ROWS) fail('goods_photo_ocr_table_unsupported');
    rows.push({
      name,
      quantity: numeric(columns[1]),
      unit_label:
        tesseract &&
        (columns[2].some((word) => word.confidence < 0.5) ||
          !TESSERACT_UNIT_LABELS.has(unit.toLowerCase()))
          ? null
          : unit || null,
      unit_price: numeric(columns[3]),
      line_total: numeric(columns[4]),
      price_kind: null,
      confidence: null,
    });
  }
  if (rows.length === 0) fail('goods_photo_ocr_rows_unavailable');
  return { lines: rows };
}
