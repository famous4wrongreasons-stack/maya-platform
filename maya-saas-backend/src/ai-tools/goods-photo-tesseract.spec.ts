// Handcrafted TSV unit fixtures only, NOT actual OCR/image/model acceptance.
// No worker invocation or child-process/decoder mocks. Parent owns pixel proof.
import { ServiceUnavailableException } from '@nestjs/common';
import {
  GoodsPhotoOcrRowsError,
  structureGoodsPhotoOcrRows,
} from './goods-photo-ocr-rows';
import { tesseractWords } from './goods-photo-tesseract';

const HEADER =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const WIDTH = 2000;
const HEIGHT = 1000;
interface Token {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  score?: number;
  line?: number;
}
function page(width = WIDTH, height = HEIGHT): string {
  return [1, 1, 0, 0, 0, 0, 0, 0, width, height, -1, ''].join('\t');
}
function token(value: Token, index = 0): string {
  return [
    5,
    1,
    1,
    1,
    value.line ?? 1,
    index + 1,
    value.left,
    value.top,
    value.width,
    value.height,
    value.score ?? 93,
    value.text,
  ].join('\t');
}
function tsv(records: readonly string[]): string {
  return [HEADER, ...records, ''].join('\n');
}
function document(words: readonly Token[]): string {
  return tsv([page(), ...words.map(token)]);
}
function field(record: string, index: number, value: string): string {
  const fields = record.split('\t');
  fields[index] = value;
  return fields.join('\t');
}
const measured = (): Token => ({
  text: 'Шампунь',
  left: 500,
  top: 125,
  width: 250,
  height: 50,
  score: 87.5,
});
function projectionRefused(
  input: string,
  width = WIDTH,
  height = HEIGHT,
): void {
  let failure: unknown;
  try {
    tesseractWords(input, width, height);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ServiceUnavailableException);
  expect((failure as ServiceUnavailableException).getResponse()).toEqual({
    message: 'goods_photo_ocr_output_invalid',
    error: 'Service Unavailable',
    statusCode: 503,
  });
}
function structuringRefused(input: unknown, code: string): void {
  let failure: unknown;
  try {
    structureGoodsPhotoOcrRows(input);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(GoodsPhotoOcrRowsError);
  expect((failure as GoodsPhotoOcrRowsError).code).toBe(code);
  expect((failure as GoodsPhotoOcrRowsError).message).toBe(code);
}

function table(): Token[] {
  const labels = ['Товар', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
  const values = ['Шампунь', '2', 'шт', '300.00', '950.00'];
  return [
    ...labels.map((text, index) => ({
      text,
      left: [100, 940, 1240, 1480, 1760][index],
      top: 180,
      width: [420, 180, 90, 160, 180][index],
      height: 20,
      score: 93,
      line: 1,
    })),
    ...values.map((text, index) => ({
      text,
      left: [100, 980, 1260, 1510, 1790][index],
      top: 240,
      width: [250, 100, 80, 140, 140][index],
      height: 20,
      score: 93,
      line: 2,
    })),
    {
      text: 'Кедр',
      left: 370,
      top: 240,
      width: 140,
      height: 20,
      score: 93,
      line: 2,
    },
  ];
}
function rows(words = table()) {
  return structureGoodsPhotoOcrRows(
    tesseractWords(document(words), WIDTH, HEIGHT),
  );
}

describe('Tesseract measured TSV projection (synthetic unit records)', () => {
  it('normalizes actual supplied pixel boxes and scores without splitting or inventing geometry', () => {
    const raw = document([{ ...measured(), text: 'Шампунь Кедр' }]);
    expect(tesseractWords(raw, WIDTH, HEIGHT)).toEqual({
      contract: 'maya.tesseract.words/1',
      image_width: WIDTH,
      image_height: HEIGHT,
      revision: 1,
      languages: ['rus', 'eng'],
      words: [
        {
          text: 'Шампунь Кедр',
          left: 0.25,
          top: 0.125,
          width: 0.125,
          height: 0.05,
          confidence: 0.875,
        },
      ],
    });
  });

  it('accepts standard hierarchy records and CRLF transport without exposing them as words', () => {
    const hierarchy = [2, 3, 4].map((level) =>
      [
        level,
        1,
        1,
        level >= 3 ? 1 : 0,
        level === 4 ? 1 : 0,
        0,
        500,
        125,
        250,
        50,
        -1,
        '',
      ].join('\t'),
    );
    const raw = tsv([page(), ...hierarchy, token(measured())]);
    expect(tesseractWords(raw.replaceAll('\n', '\r\n'), WIDTH, HEIGHT)).toEqual(
      tesseractWords(document([measured()]), WIDTH, HEIGHT),
    );
  });

  it('accepts a blank page as measured zero words, while the table owner refuses absent rows', () => {
    const projection = tesseractWords(tsv([page()]), WIDTH, HEIGHT);
    expect(projection).toEqual({
      contract: 'maya.tesseract.words/1',
      image_width: WIDTH,
      image_height: HEIGHT,
      revision: 1,
      languages: ['rus', 'eng'],
      words: [],
    });
    structuringRefused(projection, 'goods_photo_ocr_rows_unavailable');
  });

  it.each([0, 100])(
    'preserves measured confidence boundary %s without making it a row probability',
    (score) => {
      expect(
        tesseractWords(document([{ ...measured(), score }]), WIDTH, HEIGHT),
      ).toMatchObject({ words: [{ confidence: score / 100 }] });
    },
  );

  it('rejects missing or changed header, missing page, multiple pages and words before the page', () => {
    const word = token(measured());
    for (const raw of [
      tsv([page(), word]).replace(HEADER, HEADER.toUpperCase()),
      tsv([word]),
      tsv([page(), page(), word]),
      tsv([page(), field(page(), 1, '2'), word]),
      tsv([page(), field(word, 1, '2')]),
      tsv([word, page()]),
    ])
      projectionRefused(raw);
  });

  it.each<[string, number, string]>([
    ['nonzero page block', 2, '1'],
    ['nonzero page paragraph', 3, '1'],
    ['nonzero page line', 4, '1'],
    ['nonzero page word', 5, '1'],
    ['nonzero page origin', 6, '1'],
    ['page dimensions mismatch', 8, '1999'],
    ['hierarchy confidence', 10, '90'],
    ['hierarchy text', 11, 'PRIVATE_SYNTHETIC'],
  ])('rejects malformed page metadata: %s', (_label, index, value) => {
    projectionRefused(tsv([field(page(), index, value)]));
  });

  it.each<[string, number, string]>([
    ['unsupported level', 0, '6'],
    ['zero block', 2, '0'],
    ['zero paragraph', 3, '0'],
    ['zero line', 4, '0'],
    ['zero word index', 5, '0'],
    ['negative coordinate', 6, '-1'],
    ['fractional pixel coordinate', 6, '0.5'],
    ['unsafe coordinate spelling', 6, '0001'],
    ['horizontal overflow', 6, '1900'],
    ['vertical overflow', 7, '990'],
    ['zero word width', 8, '0'],
    ['zero word height', 9, '0'],
  ])('rejects malformed word geometry/index: %s', (_label, index, value) => {
    projectionRefused(tsv([page(), field(token(measured()), index, value)]));
  });

  it.each([
    '-1',
    '100.1',
    'NaN',
    'Infinity',
    '1e2',
    '.5',
    '70,5',
    '70.123456789',
  ])('rejects invalid measured score %s', (score) => {
    projectionRefused(tsv([page(), field(token(measured()), 10, score)]));
  });

  it.each([
    'PRIVATE\u0000TEXT',
    'PRIVATE\u001bTEXT',
    '\u000bPRIVATE',
    'PRIVATE\u000c',
    'PRIVATE\u202eTEXT',
    'PRIVATE\u2066TEXT',
    'PRIVATE\tTEXT',
    'PRIVATE\nTEXT',
    '',
    '   ',
    'Я'.repeat(257),
  ])(
    'rejects unsafe, empty or overlong TSV text %# with a sanitized error',
    (text) => {
      projectionRefused(document([{ ...measured(), text }]));
    },
  );

  it('rejects extra TSV columns and never silently discards trailing data', () => {
    projectionRefused(tsv([page(), token(measured()) + '\tPRIVATE_EXTRA']));
    projectionRefused(tsv([page(), token(measured())]) + 'PRIVATE_EXTRA\n');
  });

  it.each<[number, number]>([
    [0, HEIGHT],
    [WIDTH, 0],
    [-1, HEIGHT],
    [1.5, HEIGHT],
    [Number.NaN, HEIGHT],
    [Number.POSITIVE_INFINITY, HEIGHT],
    [Number.MAX_SAFE_INTEGER + 1, 1],
    [4001, 3000],
  ])(
    'rejects invalid dimensions or pixel overflow %s × %s',
    (width, height) => {
      projectionRefused(tsv([page()]), width, height);
    },
  );

  it('rejects output-byte, hierarchy-record and word-count overflow instead of truncating', () => {
    projectionRefused(tsv([page(), 'X'.repeat(256 * 1024)]));
    const block = [2, 1, 1, 0, 0, 0, 0, 0, 1, 1, -1, ''].join('\t');
    projectionRefused(tsv([page(), ...Array<string>(6000).fill(block)]));
    const smallWord = token({
      text: 'Я',
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    });
    projectionRefused(tsv([page(), ...Array<string>(4001).fill(smallWord)]));
  });
});

describe('Tesseract TSV through the existing table owner (uncalibrated score policy)', () => {
  it('preserves exact cells, names with spaces and inconsistent printed totals without arithmetic or meaning inference', () => {
    expect(rows()).toEqual({
      lines: [
        {
          name: 'Шампунь Кедр',
          quantity: '2',
          unit_label: 'шт',
          unit_price: '300.00',
          line_total: '950.00',
          price_kind: null,
          confidence: null,
        },
      ],
    });
  });

  it.each<[number, 'quantity' | 'unit_price' | 'line_total']>([
    [6, 'quantity'],
    [8, 'unit_price'],
    [9, 'line_total'],
  ])(
    'keeps weak numeric token %s unknown without filling it from the other two cells',
    (index, key) => {
      const words = table();
      words[index].score = 69.999;
      expect(rows(words).lines[0]).toEqual({
        name: 'Шампунь Кедр',
        quantity: '2',
        unit_label: 'шт',
        unit_price: '300.00',
        line_total: '950.00',
        price_kind: null,
        confidence: null,
        [key]: null,
      });
    },
  );

  it('accepts the exact numeric cutoff only as provisional text and never aggregates a row score', () => {
    const words = table();
    for (const index of [6, 8, 9]) words[index].score = 70;
    expect(rows(words).lines[0]).toMatchObject({
      quantity: '2',
      unit_price: '300.00',
      line_total: '950.00',
      price_kind: null,
      confidence: null,
    });
  });

  it.each([5, 10])(
    'refuses any weak name token %s instead of dropping it from the name',
    (index) => {
      const words = table();
      words[index].score = 49.999;
      structuringRefused(
        tesseractWords(document(words), WIDTH, HEIGHT),
        'goods_photo_ocr_rows_unavailable',
      );
    },
  );

  it.each([0, 1, 2, 3, 4])(
    'refuses weak header column %s instead of guessing the column layout',
    (index) => {
      const words = table();
      words[index].score = 49.999;
      structuringRefused(
        tesseractWords(document(words), WIDTH, HEIGHT),
        'goods_photo_ocr_table_unsupported',
      );
    },
  );

  it('keeps a weak unit unknown without changing the other cells', () => {
    const words = table();
    words[7].score = 49.999;
    expect(rows(words).lines[0]).toMatchObject({
      name: 'Шампунь Кедр',
      quantity: '2',
      unit_label: null,
      unit_price: '300.00',
      line_total: '950.00',
      price_kind: null,
      confidence: null,
    });
  });

  it.each(['n', 'Kr', 'коробка', 'кr'])(
    'leaves an unrecognized unit %s unknown even at high OCR score',
    (literal) => {
      const words = table();
      words[7].text = literal;
      words[7].score = 100;
      expect(rows(words).lines[0]).toMatchObject({
        unit_label: null,
        quantity: '2',
        unit_price: '300.00',
        line_total: '950.00',
      });
    },
  );

  it.each(['л', 'кг', 'PCS', 'шт.'])(
    'preserves recognized unit literal %s without conversion or catalog matching',
    (literal) => {
      const words = table();
      words[7].text = literal;
      expect(rows(words).lines[0].unit_label).toBe(literal);
    },
  );

  it('keeps exact name/header/unit cutoff text provisional with no new authority fields', () => {
    const words = table();
    for (const index of [0, 1, 2, 3, 4, 5, 7, 10]) words[index].score = 50;
    expect(rows(words)).toEqual(rows());
    expect(Object.keys(rows(words).lines[0]).sort()).toEqual([
      'confidence',
      'line_total',
      'name',
      'price_kind',
      'quantity',
      'unit_label',
      'unit_price',
    ]);
  });

  it('normalizes explicit decimal comma but leaves ambiguous or OCR-confused digits null even at high score', () => {
    const words = table();
    words[6].text = '0,25';
    words[8].text = 'O.50';
    words[9].text = '1,250';
    for (const index of [6, 8, 9]) words[index].score = 100;
    expect(rows(words).lines[0]).toMatchObject({
      quantity: '0.25',
      unit_price: null,
      line_total: null,
      price_kind: null,
      confidence: null,
    });
  });

  it('requires the exact Tesseract discriminator, revision and ordered languages', () => {
    const raw = tesseractWords(document(table()), WIDTH, HEIGHT) as Record<
      string,
      unknown
    >;
    for (const changed of [
      { ...raw, contract: 'maya.tesseract.words/2' },
      { ...raw, revision: 3 },
      { ...raw, languages: ['eng', 'rus'] },
      { ...raw, languages: ['ru-RU', 'en-US'] },
      { ...raw, provider_trusted: true },
    ])
      structuringRefused(changed, 'goods_photo_ocr_words_invalid');
  });
});
