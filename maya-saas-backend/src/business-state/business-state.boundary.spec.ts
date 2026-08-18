import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Храповик границы состояния бизнеса.
 *
 * 🔴 Зачем. Композиция бизнес-состояния уже была верной — и всё равно оказалась
 * в неправильном месте: внутри слоя, который разговаривает с моделью. Одного
 * переезда мало. Без механизма вычисление вернётся туда первым же удобным
 * `private businessSomething(...)`, и снова станет два источника истины.
 *
 * Здесь ровно три утверждения, и каждое проверяется по исходникам:
 *   1. слой состояния ничего не знает про AI;
 *   2. перенесённые вычисления не появились заново в слое инструментов;
 *   3. AI ходит за состоянием через каноническую границу, а не мимо.
 *
 * Запрещать AI-слою любую арифметику никто не собирается: считать проценты для
 * подписи или складывать два поля ответа — его работа. Запрещено именно то
 * вычисление бизнес-метрики, которым УЖЕ владеет канонический слой.
 */

const SRC = join(__dirname, '..');
const STATE_DIR = join(SRC, 'business-state');
const HANDLER = join(SRC, 'ai-tools', 'ai-tool-handler.service.ts');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
      continue;
    }
    if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Только настоящие импорты: упоминание пути в комментарии — не зависимость. */
function importedPaths(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [
    ...source.matchAll(
      /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm,
    ),
  ].map((match) => match[1]);
}

/**
 * Вычисления, переехавшие в канонический слой.
 *
 * Список только РАСТЁТ: каждая строка означает «эта метрика больше не считается
 * в слое инструментов». Появление такого метода обратно в обработчике — это
 * возврат второй копии истины, а не удобная локальная функция.
 */
const MIGRATED_COMPUTATIONS = [
  'readBusinessAnalytics',
  'readEmployeeAnalytics',
  'businessMetricSnapshot',
  'businessMetricChanges',
  'businessServiceChanges',
  'businessStaffChanges',
  'serviceChangeRows',
  'clientCohortMetrics',
  'attendanceMetrics',
  'clientCohortUnavailableMetrics',
  'attendanceUnavailableMetrics',
  'staffMoneyUnavailableMetrics',
  'personalCashUnavailableMetrics',
  'measurementLimitations',
  'comparisonLimitations',
  'publishAnalytics',
  'publishedFinance',
  'publishedStaffSalary',
  'staffConfirmedRevenue',
  'serviceConfirmedRevenue',
  'staffSalaryScope',
  'employeeSalaryScope',
  'withStaffSalary',
  'safeAnalytics',
  'staffRows',
  'staffServiceRows',
  'staffServiceMap',
  'businessOperationalAnalyticsVerified',
  'readCompletenessStatus',
  'percentageDelta',
];

describe('граница канонического состояния бизнеса', () => {
  it('🔴 слой состояния не знает ни про AI, ни про модель, ни про чат', () => {
    const offenders: string[] = [];

    for (const file of listTsFiles(STATE_DIR)) {
      // Спеки границы вправе импортировать обе стороны: они её и проверяют.
      if (file.endsWith('.spec.ts')) continue;
      for (const path of importedPaths(file)) {
        if (
          /ai-tools|ai-brain|conversation-intelligence|\bllm\b|prompt/i.test(
            path,
          )
        ) {
          offenders.push(`${file.slice(SRC.length + 1)} → ${path}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('🔴 слой состояния не форматирует ответ и не знает ролей', () => {
    const forbidden = [
      // Роль — решение вызывающего; сюда приезжает уже принятое решение.
      /\bUserRole\b/,
      // Презентация: подписи, склонения, тексты для человека.
      /formatRub|label_ru|displayDayRu/,
    ];
    const offenders: string[] = [];

    for (const file of listTsFiles(STATE_DIR)) {
      if (file.endsWith('.spec.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          offenders.push(`${file.slice(SRC.length + 1)} → ${String(pattern)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('🔴 перенесённые вычисления не вернулись в слой инструментов', () => {
    const source = readFileSync(HANDLER, 'utf8');
    const returned = MIGRATED_COMPUTATIONS.filter((name) =>
      new RegExp(
        `^\\s*(private|public|protected)?\\s*(async\\s+)?${name}\\s*[<(]`,
        'm',
      ).test(source),
    );

    expect(returned).toEqual([]);
  });

  it('🔴 AI ходит за состоянием через каноническую границу', () => {
    const paths = importedPaths(HANDLER);

    expect(
      paths.some((path) =>
        path.includes('business-state/business-state.service'),
      ),
    ).toBe(true);
  });

  it('обычная арифметика слою инструментов не запрещена', () => {
    // Не ловушка на любое число: подписи, проценты к плану и склонения — его
    // работа. Проверяем, что храповик не запрещает того, чего не собирался.
    const source = readFileSync(HANDLER, 'utf8');

    expect(source).toMatch(/Math\.round/);
    expect(source).toMatch(/target_progress_percent/);
  });
});
