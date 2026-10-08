// Source facts for SYNTHETIC PIXELS. These assertions are never parser input.
// No document, person, catalog ID, currency or real commercial transaction.
const ruHeaders = ['Товар', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
const enHeaders = ['Description', 'Qty', 'Unit', 'Price', 'Amount'];
const row = (name, quantity, unit_label, unit_price, line_total) => ({
  name, quantity, unit_label, unit_price, line_total,
  price_kind: null, confidence: null,
});
const baseCells = [
  ['Шампунь Кедр', '2.5', 'шт', '300.00', '750.00'],
  ['Маска для волос', '0.75', 'л', '480.00', '360.00'],
];
const baseExpected = [
  row('Шампунь Кедр', '2.5', 'шт', '300.00', '750.00'),
  row('Маска для волос', '0.75', 'л', '480.00', '360.00'),
];
export const CORPUS_CONTRACT = 'maya.synthetic-goods-photo-corpus/1';
export const CASES = [
  {
    key: 'ru-fractions-dot', format: 'png', expectation: 'exact',
    headers: ruHeaders, cells: baseCells, footer: ['Итого', '1110.00'],
    expectedLines: baseExpected,
    purpose: 'Cyrillic multiword names, fractional quantities and dot decimals.',
    manualReview: 'Verify every field, existing item, store, unit, date, currency and purchase-price meaning.',
  },
  {
    key: 'ru-changed-pixels', format: 'webp', expectation: 'exact',
    headers: ruHeaders,
    cells: [
      ['Шампунь Липа', '3.5', 'шт', '320.00', '1120.00'],
      ['Маска для волос', '0.75', 'л', '480.00', '360.00'],
    ], footer: ['Итого', '1480.00'],
    expectedLines: [
      row('Шампунь Липа', '3.5', 'шт', '320.00', '1120.00'),
      baseExpected[1],
    ],
    purpose: 'Actual changed name and digits must change observations; canned base rows must fail.',
    manualReview: 'Same mandatory owner review; changed pixels provide no catalog authority.',
  },
  {
    key: 'ru-fractions-comma', format: 'jpeg', expectation: 'exact',
    headers: ruHeaders,
    cells: [
      ['Бальзам Берёза', '1,5', 'л', '240,50', '360,75'],
      ['Крем для рук', '0,25', 'кг', '800,00', '200,00'],
    ], footer: ['Итого', '560,75'],
    expectedLines: [
      row('Бальзам Берёза', '1.5', 'л', '240.50', '360.75'),
      row('Крем для рук', '0.25', 'кг', '800.00', '200.00'),
    ],
    purpose: 'Only unambiguous comma-to-dot normalization; retain digits and decimal precision.',
    manualReview: 'Confirm decimal separator and units; no unit conversion or currency inference.',
  },
  {
    key: 'ru-ambiguous-comma', format: 'png', expectation: 'partial-or-refusal',
    headers: ruHeaders,
    cells: [['Сироп Мята', '1,250', 'л', '100,00', '125,00']],
    footer: ['Итого', '125,00'],
    expectedLines: [row('Сироп Мята', null, 'л', '100.00', '125.00')],
    purpose: '1,250 may be decimal or grouping: quantity must stay null, never 1.250 or 1250.',
    manualReview: 'Quantity requires an explicit human value; totals must not resolve punctuation ambiguity.',
  },
  {
    key: 'english-webp', format: 'webp', expectation: 'exact',
    headers: enHeaders,
    cells: [
      ['Cedar Shampoo', '2.5', 'pcs', '300.00', '750.00'],
      ['Hand Cream', '1', 'pcs', '125.50', '125.50'],
    ], footer: ['Total', '875.50'],
    expectedLines: [
      row('Cedar Shampoo', '2.5', 'pcs', '300.00', '750.00'),
      row('Hand Cream', '1', 'pcs', '125.50', '125.50'),
    ],
    purpose: 'English header aliases and names through real lossless WebP decoding.',
    manualReview: 'Generic Price does not establish purchase-price meaning; no catalog matching.',
  },
  {
    key: 'printed-total-disagrees', format: 'png', expectation: 'exact',
    headers: ruHeaders,
    cells: [['Шампунь Сосна', '2', 'шт', '300.00', '950.00']],
    footer: ['Итого', '950.00'],
    expectedLines: [row('Шампунь Сосна', '2', 'шт', '300.00', '950.00')],
    purpose: 'Preserve independently printed unit price and line total despite intentional arithmetic disagreement.',
    manualReview: 'Resolve the discrepancy manually. Never calculate 600.00, derive 475.00 or substitute footer total.',
  },
  {
    key: 'jpeg-exif-rotation', format: 'jpeg', expectation: 'exact',
    transform: 'rotate-pixels-90-exif-8',
    headers: ruHeaders, cells: baseCells, footer: ['Итого', '1110.00'],
    expectedLines: baseExpected,
    purpose: 'Stored pixels rotated 90 degrees, EXIF orientation 8; production decoder must restore upright table.',
    manualReview: 'EXIF rotation qualification only; arbitrary perspective, skew and wrapped rows remain unsupported.',
  },
  {
    key: 'occluded-price', format: 'png', expectation: 'partial-or-refusal',
    headers: ruHeaders,
    cells: [['Гель Ромашка', '2', 'шт', '300.00', '600.00']],
    occlude: { row: 0, column: 3 }, footer: ['Итого', '600.00'],
    expectedLines: [row('Гель Ромашка', '2', 'шт', null, '600.00')],
    purpose: 'Opaque rasterized cover hides the entire price cell: no visible digit supports a price value.',
    manualReview: 'Price is unreadable. Require explicit manual input or reject the table; never divide total by quantity.',
  },
  {
    key: 'missing-price', format: 'webp', expectation: 'partial-or-refusal',
    headers: ruHeaders,
    cells: [['Мыло Облако', '1.5', 'кг', '', '450.00']],
    footer: ['Итого', '450.00'],
    expectedLines: [row('Мыло Облако', '1.5', 'кг', null, '450.00')],
    purpose: 'A genuinely empty price cell remains null; explicit other fields remain provisional observations.',
    manualReview: 'Provide the missing purchase unit price manually; line total is not a substitute.',
  },
  {
    key: 'unsupported-price-header', format: 'jpeg', expectation: 'refusal',
    headers: ['Товар', 'Кол-во', 'Ед.', 'Закупочная цена', 'Сумма'],
    cells: [['Крем Облако', '1', 'шт', '250.00', '250.00']],
    footer: ['Итого', '250.00'], expectedLines: null,
    purpose: 'Current exact five-column grammar rejects a multiword price header; expose this concrete limitation.',
    manualReview: 'Use manual entry. Do not broaden header grammar or claim purchase-price authority in the proof.',
  },
];
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
freeze(CASES);

export const CORPUS_LIMITS = Object.freeze({
  fixtures: 10, width: 2200, height: 760, maxImageBytes: 2 * 1024 * 1024,
  syntheticPixelsOnly: true, manualReviewRequired: true,
  realDocumentAcceptance: false, providerWriteAcceptance: false,
  uncertainty: 'No inferred digits, row probabilities, currency, goods IDs, price kind, arithmetic or catalog matches.',
  scope: 'Single horizontal five-column table with single-line names. Not general invoice acceptance.',
});
