import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateRuntimeConfig } from './config/runtime-config';

/**
 * Проводка валидатора конфигурации, а не сам валидатор.
 *
 * 🔴 `runtime-config.spec.ts` и `security-config.spec.ts` дёргают чистые
 * функции напрямую, поэтому ПОДКЛЮЧЕНИЕ валидатора к приложению не проверял
 * никто. Удалить строку `validate: validateRuntimeConfig` из `app.module.ts` —
 * и весь набор тестов остался бы зелёным, смоук тоже (он идёт под
 * NODE_ENV=test), а боевой инстанс спокойно поднялся бы с пустым
 * CORS-allowlist и dev-секретами. Требование спецификации «критически неверная
 * production-конфигурация обязана падать явной ошибкой» держалось на одной
 * непокрытой строке.
 *
 * Проверка идёт по исходнику намеренно. Честный вариант — импортировать модуль
 * под негодным боевым окружением и ждать падения — тянет за собой всё
 * приложение и роняет воркер jest ещё до того, как ошибку успевает поймать
 * ожидание. Здесь нужна ровно защита от удаления строки, и она её даёт.
 */
describe('AppModule configuration wiring', () => {
  const source = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

  it('hands the runtime validator to ConfigModule', () => {
    expect(source).toContain('validate: validateRuntimeConfig');
  });

  it('keeps configuration global so every module sees validated values', () => {
    expect(source).toMatch(/ConfigModule\.forRoot\(\{[\s\S]*?isGlobal:\s*true/);
  });

  it('rejects the production config the wiring is there to catch', () => {
    // Тот самый отказ, который перестал бы происходить вместе со строкой.
    expect(() =>
      validateRuntimeConfig({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: '',
      }),
    ).toThrow('CORS_ALLOWED_ORIGINS is required in production');
  });
});
