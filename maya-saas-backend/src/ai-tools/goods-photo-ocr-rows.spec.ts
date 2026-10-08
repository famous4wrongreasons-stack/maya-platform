// Algorithm unit fixtures only: handcrafted geometry, NOT real OCR/model acceptance.
// Actual image → native Vision acceptance is a separate parent-owned proof.
import {
  GoodsPhotoOcrRowsError,
  structureGoodsPhotoOcrRows,
} from './goods-photo-ocr-rows';

function word(
  text: string,
  left: number,
  top: number,
  width = 0.06,
  height = 0.018,
) {
  return { text, left, top, width, height, confidence: 0.93 };
}
function header(
  labels = ['Товар', 'Кол-во', 'Ед.', 'Цена', 'Сумма'],
  top = 0.18,
) {
  return labels.map((text, i) =>
    word(
      text,
      [0.05, 0.47, 0.62, 0.74, 0.88][i],
      top,
      [0.21, 0.09, 0.045, 0.08, 0.09][i],
    ),
  );
}
function row(
  top = 0.24,
  values = ['Шампунь', '2.50', 'фл', '300.00', '750.00'],
) {
  return values.flatMap((text, i) =>
    text
      ? [
          word(
            text,
            [0.05, 0.49, 0.63, 0.755, 0.895][i],
            top,
            [0.16, 0.05, 0.04, 0.07, 0.07][i],
          ),
        ]
      : [],
  );
}
function document(words = [...header(), ...row()]) {
  return {
    contract: 'maya.local-vision.words/1',
    image_width: 1600,
    image_height: 900,
    revision: 3,
    languages: ['ru-RU', 'en-US'],
    words,
  };
}
function errorCode(input: unknown): string {
  try {
    structureGoodsPhotoOcrRows(input);
  } catch (error) {
    expect(error).toBeInstanceOf(GoodsPhotoOcrRowsError);
    const parsed = error as GoodsPhotoOcrRowsError;
    expect(parsed.message).toBe(parsed.code);
    expect(parsed.message).not.toContain('PRIVATE');
    return parsed.code;
  }
  throw new Error('Expected sanitized structuring refusal');
}

describe('bounded geometry table structurer (synthetic unit word boxes)', () => {
  it('reads source cells in geometry order, ignores preamble, excludes footer and preserves exact decimals', () => {
    const words = [
      word('Накладная', 0.06, 0.06, 0.19),
      ...header(),
      ...row(),
      word('мужской', 0.23, 0.242, 0.16),
      ...row(0.29, ['Conditioner', '1', 'шт', '110.20', '117.00']),
      word('Итого', 0.6, 0.34, 0.1),
      word('867.00', 0.895, 0.34, 0.07),
    ];
    const input = document([...words].reverse());
    const unchanged = JSON.stringify(input);
    expect(structureGoodsPhotoOcrRows(input)).toEqual({
      lines: [
        {
          name: 'Шампунь мужской',
          quantity: '2.50',
          unit_label: 'фл',
          unit_price: '300.00',
          line_total: '750.00',
          price_kind: null,
          confidence: null,
        },
        // Intentionally inconsistent arithmetic is retained as observed text.
        {
          name: 'Conditioner',
          quantity: '1',
          unit_label: 'шт',
          unit_price: '110.20',
          line_total: '117.00',
          price_kind: null,
          confidence: null,
        },
      ],
    });
    expect(JSON.stringify(input)).toBe(unchanged);
  });

  it.each([
    [0, 'Название'],
    [0, 'Наименование'],
    [0, 'Товар'],
    [0, 'Item'],
    [0, 'Description'],
    [1, 'Кол-во'],
    [1, 'Количество'],
    [1, 'Qty'],
    [2, 'Ед'],
    [2, 'Ед.'],
    [2, 'Unit'],
    [2, 'Unit.'],
    [3, 'Цена'],
    [3, 'Price'],
    [4, 'Сумма'],
    [4, 'Amount'],
    [4, 'Total'],
  ])('supports literal header alias column %s: %s', (column, alias) => {
    const labels = ['Товар', 'Кол-во', 'Ед', 'Цена', 'Сумма'];
    labels[Number(column)] = String(alias).toUpperCase();
    expect(
      structureGoodsPhotoOcrRows(document([...header(labels), ...row()]))
        .lines[0].name,
    ).toBe('Шампунь');
  });

  it('supports an English table with a final Total footer without inferring price meaning', () => {
    const input = document([
      ...header(['Description', 'Qty', 'Unit', 'Price', 'Amount']),
      ...row(0.24, ['Shampoo', '0.1250', 'bottle', '10.50', '1.3125']),
      word('Total:', 0.74, 0.3, 0.08),
      word('1.3125', 0.895, 0.3, 0.07),
    ]);
    const result = structureGoodsPhotoOcrRows(input);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      quantity: '0.1250',
      unit_price: '10.50',
      line_total: '1.3125',
      price_kind: null,
      confidence: null,
    });
    expect(Object.keys(result.lines[0]).sort()).toEqual([
      'confidence',
      'line_total',
      'name',
      'price_kind',
      'quantity',
      'unit_label',
      'unit_price',
    ]);
  });

  it('normalizes an explicit decimal comma without floating-point arithmetic or precision loss', () => {
    const result = structureGoodsPhotoOcrRows(
      document([
        ...header(),
        ...row(0.24, ['Шампунь', '0,1250', 'л', '10,50', '1,3125']),
      ]),
    );
    expect(result.lines[0]).toMatchObject({
      quantity: '0.1250',
      unit_price: '10.50',
      line_total: '1.3125',
    });
  });

  it.each([
    'O.50',
    '—',
    '1 250.00',
    '300₽',
    '-2',
    '1.2.3',
    '2,000.00',
    '1,250',
    '01.50',
    '1.1234567',
  ])('keeps unreadable numeric cell %s null and never guesses', (value) => {
    const result = structureGoodsPhotoOcrRows(
      document([
        ...header(),
        ...row(0.24, ['Шампунь', value, '', value, value]),
      ]),
    );
    expect(result.lines[0]).toMatchObject({
      name: 'Шампунь',
      quantity: null,
      unit_label: null,
      unit_price: null,
      line_total: null,
      price_kind: null,
    });
  });

  it('keeps genuinely absent numeric cells unknown without deriving them from other values', () => {
    const result = structureGoodsPhotoOcrRows(
      document([
        ...header(),
        ...row(0.24, ['Шампунь', '', 'шт', '10.00', '20.00']),
      ]),
    );
    expect(result.lines[0].quantity).toBeNull();
    expect(result.lines[0].unit_price).toBe('10.00');
    expect(result.lines[0].line_total).toBe('20.00');
  });

  it('refuses a missing, partial, reordered or unregistered header instead of guessing columns', () => {
    for (const words of [
      row(),
      [...header().slice(0, 4), ...row()],
      [...header(['Товар', 'Цена', 'Ед', 'Кол-во', 'Сумма']), ...row()],
      [
        ...header(['Товар', 'Кол-во', 'Ед', 'Закупочная цена', 'Сумма']),
        ...row(),
      ],
      [...header(['Товар', 'Кол-во', 'Ед..', 'Цена', 'Сумма']), ...row()],
    ]) {
      expect(errorCode(document(words))).toBe(
        'goods_photo_ocr_table_unsupported',
      );
    }
  });

  it('refuses repeated headers/multiple tables even when the first one looks complete', () => {
    expect(
      errorCode(
        document([
          ...header(),
          ...row(),
          ...header(undefined, 0.4),
          ...row(0.46),
        ]),
      ),
    ).toBe('goods_photo_ocr_table_ambiguous');
  });

  it('refuses an extra index column and overlapping words in the data line', () => {
    expect(
      errorCode(document([word('№', 0.01, 0.18, 0.02), ...header(), ...row()])),
    ).toBe('goods_photo_ocr_table_unsupported');
    expect(
      errorCode(
        document([
          ...header(),
          ...row(),
          word('PRIVATE_OVERLAP', 0.06, 0.24, 0.12),
        ]),
      ),
    ).toBe('goods_photo_ocr_table_ambiguous');
  });

  it('refuses a name spanning a column boundary instead of silently truncating it', () => {
    const data = row();
    data[0] = word('PRIVATE_WIDE_NAME', 0.05, 0.24, 0.45);
    expect(errorCode(document([...header(), ...data]))).toBe(
      'goods_photo_ocr_table_ambiguous',
    );
  });

  it('refuses missing names and wrapped-name continuation lines', () => {
    expect(
      errorCode(
        document([
          ...header(),
          ...row(0.24, ['', '2', 'шт', '10.00', '20.00']),
        ]),
      ),
    ).toBe('goods_photo_ocr_rows_unavailable');
    expect(
      errorCode(
        document([...header(), ...row(), word('перенос', 0.05, 0.28, 0.15)]),
      ),
    ).toBe('goods_photo_ocr_rows_unavailable');
    expect(
      errorCode(
        document([
          ...header(),
          ...row(0.24, ['12345', '2', 'шт', '10.00', '20.00']),
        ]),
      ),
    ).toBe('goods_photo_ocr_rows_unavailable');
  });

  it('never returns an Итого/Total footer as a good, and refuses content after it', () => {
    for (const label of ['Итого', 'Итого:', 'Total', 'Total:']) {
      const footer = [
        word(label, 0.05, 0.3, 0.1),
        word('750.00', 0.895, 0.3, 0.07),
      ];
      expect(
        structureGoodsPhotoOcrRows(document([...header(), ...row(), ...footer]))
          .lines,
      ).toHaveLength(1);
      expect(
        errorCode(document([...header(), ...row(), ...footer, ...row(0.36)])),
      ).toBe('goods_photo_ocr_table_unsupported');
    }
  });

  it('requires 1..20 rows and does not truncate a longer table', () => {
    const base = header(undefined, 0.05);
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(0.1 + i * 0.04),
    ).flat();
    expect(
      structureGoodsPhotoOcrRows(document([...base, ...rows])).lines,
    ).toHaveLength(20);
    expect(errorCode(document([...base, ...rows, ...row(0.9)]))).toBe(
      'goods_photo_ocr_table_unsupported',
    );
    expect(errorCode(document(header()))).toBe(
      'goods_photo_ocr_rows_unavailable',
    );
    expect(errorCode(document([]))).toBe('goods_photo_ocr_rows_unavailable');
  });

  it.each([
    { contract: 'different' },
    { revision: 2 },
    { languages: ['en-US', 'ru-RU'] },
    { image_width: 0 },
    { image_height: Infinity },
    { image_width: 2.5 },
    { ignored: 'PRIVATE_EXTRA' },
  ])('refuses invalid closed root fields %#', (patch) => {
    expect(errorCode({ ...document(), ...patch })).toBe(
      'goods_photo_ocr_words_invalid',
    );
  });

  it.each([
    { text: '' },
    { text: 'PRIVATE\nCONTROL' },
    { text: 'x'.repeat(257) },
    { left: -0.1 },
    { top: 1.1 },
    { width: 0 },
    { height: NaN },
    { width: 1 },
    { confidence: 1.01 },
    { confidence: null },
    { product_id: '42' },
  ])('refuses invalid closed word fields/coordinates %#', (patch) => {
    const words = [...header(), ...row()];
    words[5] = { ...words[5], ...patch } as (typeof words)[number];
    expect(errorCode(document(words))).toBe('goods_photo_ocr_words_invalid');
  });

  it('bounds word count and rejects sparse/accessor-backed data without invoking getters', () => {
    expect(
      errorCode(
        document(Array.from({ length: 4001 }, () => word('x', 0.1, 0.1))),
      ),
    ).toBe('goods_photo_ocr_words_invalid');
    const sparse = document();
    Reflect.deleteProperty(sparse.words, '2');
    expect(errorCode(sparse)).toBe('goods_photo_ocr_words_invalid');
    let invoked = false;
    const input = document();
    Object.defineProperty(input.words[0], 'text', {
      enumerable: true,
      get: () => {
        invoked = true;
        return 'PRIVATE_GETTER';
      },
    });
    expect(errorCode(input)).toBe('goods_photo_ocr_words_invalid');
    expect(invoked).toBe(false);
  });
});
