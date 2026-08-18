import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Храповик направления зависимости для HTTP-поверхности аналитики.
 *
 * 🔴 Cycle 04 P3. Кабинет перестал быть вторым владельцем бизнес-фактов:
 * теперь `HTTP → Business State → операционное вычисление`. Одного переезда
 * мало — обратный путь обязан быть закрыт механизмом, иначе первый же
 * «маленький локальный расчёт прямо в контроллере» вернёт вторую истину.
 *
 * Здесь четыре утверждения, и каждое проверяется по исходникам:
 *   1. канонический слой не знает про HTTP-край аналитики (нет цикла);
 *   2. удалённые владельцы кабинета не вернулись в сервис аналитики;
 *   3. контроллер не считает бизнес-факты и не читает обзор мимо канона;
 *   4. совместимость контракта живёт в презентере, а не в вычислении.
 */

const SRC = join(__dirname, '..');
const CONTROLLER = join(__dirname, 'operations-analytics.controller.ts');
const SERVICE = join(__dirname, 'operations-analytics.service.ts');
const STATE = join(SRC, 'business-state', 'business-state.service.ts');

function importedPaths(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [
    ...source.matchAll(
      /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm,
    ),
  ].map((match) => match[1]);
}

/**
 * Владельцы, удалённые из сервиса аналитики в P3.
 *
 * Список только РАСТЁТ. Возврат любого из этих методов означает, что кабинет
 * снова считает бизнес-факт сам — рядом с каноническим владельцем, но по
 * своим правилам. Именно так и появились два разных числа «выручки».
 */
const REMOVED_CABINET_OWNERS = [
  'getBusinessOverviewForCabinet',
  'getEmployeeOverviewForCabinet',
  'withLegacyNet',
  'withoutFactDiagnostics',
];

describe('граница HTTP-аналитики', () => {
  it('🔴 канонический слой не импортирует HTTP-край: цикла нет', () => {
    const offenders = importedPaths(STATE).filter((path) =>
      /analytics\/(operations-analytics\.controller|analytics-http\.module|cabinet-overview\.presenter)/.test(
        path,
      ),
    );

    expect(offenders).toEqual([]);
  });

  it('🔴 удалённые владельцы кабинета не вернулись в сервис аналитики', () => {
    const source = readFileSync(SERVICE, 'utf8');
    const returned = REMOVED_CABINET_OWNERS.filter((name) =>
      new RegExp(
        `^\\s*(private|public|protected)?\\s*(async\\s+)?${name}\\s*[<(]`,
        'm',
      ).test(source),
    );

    expect(returned).toEqual([]);
  });

  it('🔴 контроллер берёт факты только у канонического владельца', () => {
    const source = readFileSync(CONTROLLER, 'utf8');

    expect(source).toMatch(/businessState\.(business|employee)\(/);
    // Обзор мимо канона — это и есть второй владелец. Финансовая сводка
    // провайдера остаётся своим вызовом: это другой факт, другой источник.
    expect(source).not.toMatch(/analytics\.get(Business|Employee)Overview/);
    expect(source).not.toMatch(/analytics\.getBusinessOperationalOverview/);
  });

  it('совместимость контракта живёт в презентере, а не в вычислении', () => {
    const presenter = readFileSync(
      join(__dirname, 'cabinet-overview.presenter.ts'),
      'utf8',
    );

    for (const name of ['withLegacyNet', 'withoutFactDiagnostics']) {
      expect(presenter).toMatch(new RegExp(`export function ${name}\\b`));
    }
    // Презентер не имеет права ходить в базу или к провайдеру: он переименовывает
    // уже посчитанное. Иначе «совместимость» снова станет вычислением.
    expect(
      importedPaths(join(__dirname, 'cabinet-overview.presenter.ts')),
    ).toEqual([]);
  });
});
