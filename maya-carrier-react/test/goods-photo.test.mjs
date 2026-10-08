// Synthetic presentation checks; no OCR, network, document storage or receipt effect.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { findAll, parse, textOf } from './html.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(here, '.goods-photo-'));
let m;
try {
  const bundle = path.join(scratch, 'presentation.mjs');
  await esbuild.build({ stdin: { contents: `export { GoodsPhotoPanel } from '../src/chat/GoodsPhotoPanel.tsx';
    export { GoodsPhotoPicker } from '../src/chat/GoodsPhotoPicker.tsx';
    export { tokens } from '../src/identity/tokens.ts'; export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir: here, loader: 'tsx' },
    bundle: true, format: 'esm', platform: 'node', target: 'node22', jsx: 'automatic', outfile: bundle, logLevel: 'warning',
    external: ['react', 'react-dom/server', 'react/jsx-runtime'] });
  m = await import(pathToFileURL(bundle).href);
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
const review = { storeId: '', quantity: '', unitId: '', unitCost: '', currency: '', receivedAt: '', priceKind: '' };
const line = { sourceLine: 1, name: 'Тестовый товар', quantity: '1.25', unitLabel: 'шт', unitPrice: '990', lineTotal: '1237.5', priceKind: 'sale_unit', parserConfidence: 0.99 };
const item = { id: '12', name: 'Тестовый товар', article: null, barcode: null, asOf: '2026-10-08T12:00:00Z', currency: 'RUB', itemKind: 'physical', salePrice: '99999', costPrice: '88888', unitCostPrice: '77777', saleUnitId: '2', saleUnitLabel: 'шт', writeOffUnitId: '2', writeOffUnitLabel: 'шт', unitRatio: '1', stock: { status: 'observed', rows: [{ storeId: '7', quantity: '5' }], unitBasis: 'not_provided', exhaustive: false } };
function panel(extra = {}) {
  const calls = [];
  const port = Object.fromEntries(['open', 'upload', 'selectLine', 'editQuery', 'search', 'selectItem', 'editReview', 'review', 'abort'].map(name => [name, (...args) => calls.push({ name, args })]));
  const view = { phase: 'photo', busy: null, localEpoch: 0, failure: null, lines: [], selectedLine: null, query: '', matches: [], mayHaveMore: false, item: null, review: { ...review }, reviewStatus: null, ...extra };
  const tree = m.GoodsPhotoPanel({ view, port, disabled: false, t: m.tokens(true) });
  const root = parse(m.renderToStaticMarkup(tree));
  const buttons = [];
  const visit = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(visit); return; } if (node.type === 'button') buttons.push(node); visit(node.props?.children); };
  visit(tree);
  return { calls, root, text: textOf(root), buttons, press(label) { const b = buttons.find(b => b.props.children === label); assert.ok(b, label); assert.notEqual(b.props.disabled, true); b.props.onClick(); } };
}
test('unconfigured recognition is explicit and rendering dispatches nothing', () => {
  const p = panel({ failure: 'recognition_unavailable' });
  assert.match(p.text, /Распознавание фото пока не подключено/);
  assert.match(p.text, /Фото не сохраняется/);
  assert.deepEqual(p.calls, []);
});
test('high confidence or sale price cannot fill reviewed receipt values', () => {
  const p = panel({ phase: 'detail', lines: [line], selectedLine: 1, item });
  assert.match(p.text, /Цена продажи \(не закупочная\)/);
  assert.doesNotMatch(p.text, /99999|88888|77777|0\.99/);
  assert.ok(findAll(p.root, e => e.tag === 'input').every(e => !e.attrs.value));
  assert.equal(p.buttons.filter(b => String(b.props.children).includes('единица №')).length, 1, 'same catalog unit is a single explicit choice');
  assert.equal(p.buttons.find(b => b.props.children === 'Подготовить предложение прихода').props.disabled, true);
  assert.deepEqual(p.calls, []);
});
test('category cannot be selected as an existing item; selected item requires an explicit gesture', () => {
  const p = panel({ phase: 'matches', lines: [line], selectedLine: 1, query: 'Тест', matches: [{ kind: 'category', id: '6', title: 'Тест категория' }, { kind: 'item', id: '12', title: 'Тест товар' }] });
  assert.match(p.text, /Тест категория — категория/);
  assert.equal(p.buttons.some(b => String(b.props.children).includes('категория')), false);
  assert.deepEqual(p.calls, []);
  const candidate = p.buttons.find(b => Array.isArray(b.props.children) && b.props.children.includes('12'));
  assert.ok(candidate); candidate.props.onClick();
  assert.deepEqual(p.calls, [{ name: 'selectItem', args: ['12'] }]);
});
test('uncertain preparation blocks repeat dispatch but permits clearing ephemeral fields', () => {
  const p = panel({ phase: 'uncertain', failure: 'unknown', lines: [line], selectedLine: 1, item, review: { ...review, priceKind: 'receipt_purchase_unit' } });
  assert.match(p.text, /повторная отправка отключена/);
  assert.ok(p.buttons.filter(b => b.props.children !== 'Закрыть и очистить поля фото').every(b => b.props.disabled));
  p.press('Закрыть и очистить поля фото');
  assert.deepEqual(p.calls, [{ name: 'abort', args: [] }]);
});
test('failed source is never shown as an empty successful search', () => {
  const p = panel({ phase: 'matches', lines: [line], selectedLine: 1, failure: 'source_unavailable' });
  assert.match(p.text, /данные YCLIENTS недоступны/);
  assert.doesNotMatch(p.text, /Совпадений в этом поиске нет/);
});
test('known completed or held review has no preparation or correction controls', () => {
  for (const reviewStatus of ['held', 'completed']) {
    const p = panel({ phase: 'reviewed', reviewStatus, lines: [line], selectedLine: 1, item, review: { ...review, priceKind: 'receipt_purchase_unit' } });
    assert.ok(p.buttons.filter(b => b.props.children !== 'Закрыть и очистить поля фото').every(b => b.props.disabled));
    assert.deepEqual(p.calls, []);
  }
});
test('ambiguous total keeps both extracted fields separate without deriving a unit cost', () => {
  const p = panel({ phase: 'preview', lines: [{ ...line, priceKind: 'line_total', unitPrice: '5', lineTotal: '20' }] });
  assert.match(p.text, /Поле цены: 5/);
  assert.match(p.text, /Отдельное поле суммы строки: 20/);
  assert.deepEqual(p.calls, []);
});
test('picker clears DOM filename and FileList reference before passing a single file', () => {
  const selected = [];
  const tree = m.GoodsPhotoPicker({ disabled: false, select: photo => selected.push(photo), t: m.tokens(false) });
  const input = tree.props.children.find(child => child?.type === 'input');
  const photo = new Blob(['synthetic'], { type: 'image/png' });
  const currentTarget = { value: 'synthetic.png', files: { item: index => index === 0 ? photo : null } };
  input.props.onChange({ currentTarget });
  assert.equal(currentTarget.value, ''); assert.deepEqual(selected, [photo]);
  assert.equal(input.props.multiple, undefined); assert.equal(input.props.accept, 'image/png,image/jpeg,image/webp');
});
test('OCR busy and failed states describe extraction rather than YCLIENTS and never dispatch on render', () => {
  for (const [failure, message] of [
    [
      'recognition_busy',
      'Распознавание фото сейчас занято. Строки не извлечены.',
    ],
    ['recognition_failed', 'Не удалось распознать фото. Строки не извлечены.'],
  ]) {
    const p = panel({ failure });
    assert.ok(p.text.includes(message));
    assert.doesNotMatch(
      p.text,
      /данные YCLIENTS недоступны|Сопоставление не завершено|повтор|успешно|Предварительные строки/,
    );
    assert.deepEqual(p.calls, []);
    assert.equal(
      p.buttons.some(
        (b) => b.props.children === 'Подготовить предложение прихода',
      ),
      false,
    );
  }
});
test('unsupported table explains the exact five-header scope without inventing extraction or a retry', () => {
  const p = panel({ failure: 'unsupported_table' });
  assert.ok(
    p.text.includes(
      'Поддерживается только простая таблица с пятью заголовками: «Наименование», «Количество», «Ед.», «Цена», «Сумма». Строки не извлечены.',
    ),
  );
  assert.doesNotMatch(
    p.text,
    /данные YCLIENTS недоступны|Сопоставление не завершено|повтор|Предварительные строки/,
  );
  assert.deepEqual(p.calls, []);
  assert.equal(
    p.buttons.some(
      (b) => b.props.children === 'Подготовить предложение прихода',
    ),
    false,
  );
});
