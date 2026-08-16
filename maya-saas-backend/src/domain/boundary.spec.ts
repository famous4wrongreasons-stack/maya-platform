import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Барьер, который не даёт утечке вернуться.
 *
 * 🔴 Cycle 02 P3 разбирал последствия одной ошибки: канонический словарь Maya
 * лежал в файле границы CRM, и потому любой модуль, которому нужен тип услуги,
 * тянул за собой контракт адаптера YCLIENTS. Одного переезда мало — без
 * механизма всё вернётся первым же удобным импортом. Здесь этот механизм.
 *
 * Проверка «храповика»: список импортёров границы обязан только СОКРАЩАТЬСЯ.
 * Когда очередной потребитель мигрирует, число ниже уменьшают вручную — это
 * осознанное действие, а не автоматическое ослабление.
 */

const SRC = join(__dirname, '..');

/** Сколько боевых файлов вне `src/crm` ещё импортируют границу. Только вниз. */
const REMAINING_BOUNDARY_IMPORTERS = 9;

/** Сколько временных алиасов осталось в границе. Только вниз, до нуля. */
const REMAINING_LEGACY_ALIASES = 8;

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
  const matches = source.matchAll(
    /^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm,
  );
  return [...matches].map((match) => match[1]);
}

const allFiles = listTsFiles(SRC).filter((file) => !file.endsWith('.d.ts'));
const productionFiles = allFiles.filter((file) => !file.endsWith('.spec.ts'));
const rel = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, '/');

describe('граница канонического домена', () => {
  it('домен ни от чего не зависит: ни Nest, ни Prisma, ни соседних модулей', () => {
    const offenders: string[] = [];

    for (const file of allFiles.filter((f) => rel(f).startsWith('domain/'))) {
      for (const path of importedPaths(file)) {
        const isNodeBuiltin = path.startsWith('node:');
        const isInsideDomain = path.startsWith('./') || path === '..';
        if (isNodeBuiltin || isInsideDomain) continue;
        offenders.push(`${rel(file)} → ${path}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('внутренний календарь не знает границы CRM', () => {
    const offenders: string[] = [];

    for (const file of allFiles.filter((f) =>
      rel(f).startsWith('internal-calendar/'),
    )) {
      for (const path of importedPaths(file)) {
        if (path.includes('/crm/') || path.startsWith('../crm')) {
          offenders.push(`${rel(file)} → ${path}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('число импортёров границы CRM только сокращается', () => {
    const importers = productionFiles
      .filter((file) => !rel(file).startsWith('crm/'))
      .filter((file) =>
        importedPaths(file).some((path) =>
          path.includes('crm-adapter.interface'),
        ),
      )
      .map(rel)
      .sort();

    // Сообщение важнее числа: если тест упал вверх — кто-то завёл новую
    // зависимость от контракта адаптера вместо канонического домена.
    expect(importers.length).toBeLessThanOrEqual(REMAINING_BOUNDARY_IMPORTERS);
  });

  it('решения о доступе не читают внешний id провайдера', () => {
    // 🔴 Инвариант cutover: ни одно решение об авторизации, доступе или сессии
    // не зависит напрямую от externalStaffId. Внешний id допустим ровно на
    // границе интеграции: provider + externalId → StaffProviderLink → StaffId.
    //
    // Список разрешённых файлов — ХРАПОВИК: он только сокращается. Добавление
    // сюда нового файла означает, что внешний id снова попал в решение.
    const ALLOWED = new Set([
      'crm/crm.service.ts', // разрешатель связи + сверка команды
      'crm/crm-integration.controller.ts', // публичный URL, §12
      'users/users.service.ts', // совместимый lookup + выдача доступа
      'crm/client-identity.service.ts', // идентичность КЛИЕНТА, другой контур
      // 🔴 ИСКЛЮЧЕНИЕ С ПРИЧИНОЙ, а не ослабление правила.
      // appointments.service адресует УВЕДОМЛЕНИЯ по внешнему id — это не
      // решение о доступе. Там же живёт известный дефект: при внутреннем
      // календаре в это поле уходит cuid InternalProvider, совпадения быть не
      // может, и мастер не получает уведомления о собственной записи.
      // Исправление намеренно вынесено за рамки cutover решением владельца.
      // Строка убирается вместе с тем исправлением.
      'appointments/appointments.service.ts',
    ]);

    const DECISION_DIRS = ['auth/', 'guards/', 'tenancy/', 'appointments/'];
    const offenders: string[] = [];

    for (const file of productionFiles) {
      const name = rel(file);
      if (ALLOWED.has(name)) continue;
      if (!DECISION_DIRS.some((dir) => name.startsWith(dir))) continue;

      const source = readFileSync(file, 'utf8');
      if (/\bexternalStaffId\b/.test(source)) offenders.push(name);
    }

    expect(offenders).toEqual([]);
  });

  it('список временных алиасов границы только сокращается', () => {
    const source = readFileSync(
      join(SRC, 'crm', 'crm-adapter.interface.ts'),
      'utf8',
    );
    const aliases = [...source.matchAll(/^export type (\w+) = (\w+);$/gm)].map(
      (match) => match[1],
    );

    expect(aliases.length).toBeLessThanOrEqual(REMAINING_LEGACY_ALIASES);
  });
});
