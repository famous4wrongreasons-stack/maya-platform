import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Храповик границы пользовательских поверхностей MAYA.
 *
 * 🔴 Cycle 04 P5. Текст ответа и карточки чата — ПРЕЗЕНТАЦИЯ. Им можно
 * выбирать факт, форматировать, подписывать и объяснять. Нельзя: подставлять
 * ноль вместо неизвестного, заменять выручку стоимостью записанного, выводить
 * присутствие из статуса записи и заново складывать деньги.
 *
 * Храповик намеренно УЗКИЙ: он ловит именно те приёмы, которыми поверхности
 * врали, и не запрещает обычную арифметику презентации — проценты от готовых
 * сопоставимых величин, склонения, выбор строки.
 */

const CARD = join(__dirname, 'chat-report-card.ts');
const CORE = join(__dirname, 'ai-core.service.ts');

/**
 * Исходник без комментариев: описание убранного дефекта не должно ловиться
 * как сам дефект. Иначе храповик запретил бы объяснять, что было исправлено.
 */
const read = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('граница пользовательских поверхностей', () => {
  it('🔴 стоимость записанного не подставляется вместо заработка и выручки', () => {
    const card = read(CARD);

    // Именно эти подстановки и были дефектами P5: одно поле, два факта.
    expect(card).not.toMatch(/earned\s*\?\?\s*booked/);
    expect(card).not.toMatch(/earned_rub:\s*[^,\n]*\?\?\s*booked/);
    expect(card).not.toMatch(
      /revenueIsConfirmed\s*\?\s*confirmedRevenue\s*:\s*bookedValue/,
    );
    // Оба факта обязаны существовать в карточке ОТДЕЛЬНЫМИ полями.
    expect(card).toMatch(/booked_value_rub/);
    expect(card).toMatch(/revenue_rub/);
  });

  it('🔴 пустая денежная величина не превращается в «0 ₽»', () => {
    const core = read(CORE);
    const formatter = core.slice(
      core.indexOf('private formatMoneyEntries'),
      core.indexOf('private formatVerifiedMoneyEntries'),
    );

    expect(formatter).toMatch(/return null;/);
    expect(formatter).not.toMatch(/return '0 ₽'/);
  });

  it('🔴 присутствие в тексте не берётся из провайдерского статуса', () => {
    const core = read(CORE);
    const journalReply = core.slice(
      core.indexOf('private deterministicOperationsJournalReply'),
      core.indexOf('private deterministicClientRetentionReply'),
    );

    // Ответ про день обязан читать блок присутствия инструмента...
    expect(journalReply).toMatch(/data\.attendance/);
    // ...и не выдавать статусную корзину за неявки.
    expect(journalReply).not.toMatch(/неявок \$\{[^}]*noShow\}/);
    expect(journalReply).not.toMatch(/неявок: \$\{row\.noShow\}/);
  });

  it('🔴 вопрос «сколько не пришло» отвечает наблюдение, а не статус', () => {
    const core = read(CORE);

    expect(core).toMatch(/metric\('attendance_no_show'\)/);
    // Статусная корзина остаётся доступной, но называется своим именем.
    expect(core).toMatch(/со статусом «не пришёл»/);
  });

  it('🔴 карточки не складывают деньги сами', () => {
    const card = read(CARD);

    // `reduce` по денежным строкам — это и был второй сумматор фонда зарплаты.
    expect(card).not.toMatch(/reduce\(/);
    expect(card).not.toMatch(/amount_kopecks\s*:\s*0/);
  });

  it('обычная презентация не запрещена', () => {
    const card = read(CARD);
    const core = read(CORE);

    // Форматирование, склонения и выбор строки — работа этих файлов.
    expect(card).toMatch(/moneyRubFromKopecks/);
    expect(core).toMatch(/pluralize|formatMetricNumber/);
    // Проценты от уже готовых сопоставимых величин остаются презентацией.
    expect(core).toMatch(/formatSignedPercent/);
  });
});
