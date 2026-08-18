import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Храповик границы сводок владельца.
 *
 * 🔴 Cycle 04 P4. `Briefing/Report → BusinessStateService → Business Facts`.
 * Обратного пути нет и обходного тоже: отчёт не имеет права снова пойти в
 * аналитику, к провайдеру или в базу за бизнес-фактом. Одного переезда мало —
 * без механизма первая же «маленькая правка» вернёт второго владельца истины.
 *
 * Проверяется по исходникам, а не обещанием.
 */

const DIR = __dirname;
const SERVICE = join(DIR, 'owner-reports.service.ts');
const COMPOSERS = join(DIR, 'owner-reports.composers.ts');
const FACTS = join(DIR, 'owner-reports.facts.ts');

function importedPaths(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [
    ...source.matchAll(
      /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm,
    ),
  ].map((match) => match[1]);
}

const sourceFiles = readdirSync(DIR).filter(
  (entry) => entry.endsWith('.ts') && !entry.endsWith('.spec.ts'),
);

describe('граница сводок владельца', () => {
  it('🔴 сводки не ходят в аналитику и к провайдеру напрямую', () => {
    const offenders: string[] = [];
    for (const entry of sourceFiles) {
      for (const path of importedPaths(join(DIR, entry))) {
        if (/analytics|crm\/|crm\.service|prisma\.service/.test(path)) {
          offenders.push(`${entry} → ${path}`);
        }
      }
    }

    // PrismaService остаётся: получатели и идемпотентность — не бизнес-факты.
    expect(offenders.filter((row) => !row.includes('prisma'))).toEqual([]);
  });

  it('🔴 сводки берут факты у канонического владельца', () => {
    expect(importedPaths(SERVICE)).toContain(
      '../business-state/business-state.service',
    );
    const source = readFileSync(SERVICE, 'utf8');
    expect(source).toMatch(/this\.businessState\.business\(/);
  });

  it('🔴 удалённые вычисления не вернулись в сводки', () => {
    const source = sourceFiles
      .map((entry) => readFileSync(join(DIR, entry), 'utf8'))
      .join('\n');

    /**
     * Каждая строка — вычисление, которое до P4 жило здесь и теперь
     * принадлежит каноническому владельцу. Список только РАСТЁТ.
     */
    const migrated = [
      // собственное чтение операционного обзора и финансов
      'getBusinessOperationalOverview',
      'getBusinessFinance',
      // сложение строк счетов в наличные и безнал
      'is_cash === true',
      'is_cash === false',
      // выбор строк расчёта зарплаты по величине начисления
      'accrued?.amount_kopecks || 0',
    ];

    expect(migrated.filter((name) => source.includes(name))).toEqual([]);
  });

  it('🔴 текст отчёта не считает деньги', () => {
    const composers = readFileSync(COMPOSERS, 'utf8');

    // Ни сложения, ни деления над денежными величинами: всё уже посчитано.
    expect(composers).not.toMatch(/reduce\(/);
    expect(composers).not.toMatch(/amount_kopecks/);
    expect(composers).not.toMatch(/[+\-*/]=\s/);
  });

  it('слой фактов ничего не измеряет — он только достаёт', () => {
    const facts = readFileSync(FACTS, 'utf8');

    // Единственный импорт — тип канонического состояния.
    expect(importedPaths(FACTS)).toEqual([
      '../business-state/business-state.service',
    ]);
    expect(facts).not.toMatch(/reduce\(|Math\.|\bfilter\(.*\+/);
  });

  it('запрет не шире задуманного: форматирование сводкам не запрещено', () => {
    const composers = readFileSync(COMPOSERS, 'utf8');

    expect(composers).toMatch(/formatRubFromKopecks/);
    expect(composers).toMatch(/displayDayRu/);
  });
});
