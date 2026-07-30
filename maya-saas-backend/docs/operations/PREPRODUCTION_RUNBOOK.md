# MAYA Pre-production Runbook

Этот runbook относится к backend multi-tenant блоку. Он не означает
автоматический deploy production и не заменяет проверку реальных CRM,
YooKassa, SMTP/SMS и OAuth credentials.

## 1. Подготовка

1. Собрать immutable Docker image в CI из нужного Git SHA.
2. Сделать encrypted backup PostgreSQL и проверить restore в отдельную БД.
3. Создать staging из свежей production-копии с закрытым внешним доступом.
4. Проверить, что staging secrets отличаются от production secrets.
5. Запланировать окно низкой нагрузки: enum conversion и новые FK берут locks.

Нельзя запускать `prisma migrate dev`, `db push` или собирать образ на VPS.

## 2. Проверка артефакта

В CI или staging-контейнере:

```bash
npm ci
npm run prisma:generate
npm run typecheck
npm run typecheck:scripts
npm run lint
npm test -- --runInBand
npm run build
npx prisma validate
```

Ожидаемый baseline этого среза: 76 test suites и 400 tests.

## 3. Предмиграционный аудит staging DB

С `DATABASE_URL` staging-копии:

```bash
npm run audit:membership-readiness
npx prisma migrate status
```

Условия продолжения:

- `ok: true`;
- каждый `migration_blockers[].count` равен нулю;
- нет failed/modified migrations;
- backup restore уже проверен, а не только создан.

При ненулевом blocker миграцию не запускать. Исправить данные отдельным
reviewed backfill и повторить аудит.

## 4. Применение на staging

```bash
npm run prisma:migrate:deploy
npm run audit:membership-readiness
npm run release:preflight -- --env .env.staging
npm run test:http
```

Затем выполнить минимум два tenant-сценария:

1. Tenant A не может прочитать/изменить branch, customer, appointment,
   loyalty, analytics или CRM config Tenant B.
2. Старый JWT после suspension Membership получает отказ.
3. Host/slug Tenant A вместе с JWT Tenant B получает 403.
4. Создание ресурса сверх квоты возвращает `quota_exceeded`, существующие
   данные остаются.
5. PAST_DUE работает в grace до 3 дней, затем коммерческий route возвращает
   402, а billing routes остаются доступны.
6. Webhook YooKassa повторно получает payment у провайдера и проверяет tenant
   metadata до изменения статуса.

Рекомендуемый soak staging: не менее 24 часов с логами 401/403/409/402,
latency и DB lock monitoring.

## 5. Production rollout

1. Manual approval по staging evidence и restore evidence.
2. Включить maintenance/снизить write traffic на время schema migration.
3. Ещё раз выполнить read-only membership audit.
4. Выполнить `prisma migrate deploy` из immutable release image.
5. Развернуть приложение по rolling/blue-green схеме.
6. Выполнить health, smoke и два synthetic tenant checks.
7. Наблюдать auth failures, cross-tenant 403, payment/webhook errors и DB locks.

`prisma:seed` не является обязательной частью обычного production rollout.
Он создаёт default/demo данные и запускается только при осознанном bootstrap.
При `NODE_ENV=production` для него обязательны явные безопасные seed
credentials и `CRM_ENCRYPTION_KEY`.

## 6. Rollback

Если ломается только новый app image, откатить image на предыдущий SHA. Старый
код совместим со строгими enum/FK, поэтому schema rollback обычно не нужен.

Если миграция не прошла, её атомарная транзакция должна откатить весь блок.
Проверить `_prisma_migrations`, исправить причину, не использовать
`migrate resolve --applied` без подтверждённого ручного состояния схемы.

Если после успешной миграции обнаружена порча данных, остановить writes и
восстановить проверенный backup в новую БД. Не писать импровизированный down
migration для удаления enum/FK в production.

## 7. Критерии допуска к коммерческому production

- staging audit и soak зелёные;
- managed PostgreSQL закрыт private network;
- ежедневные encrypted backups и внешний S3 по 3-2-1 проверены restore-тестом;
- Swagger выключен, CORS allowlist и trusted proxy заданы;
- production debug/fixed auth codes выключены;
- реальные SMTP/SMS, Yandex, Telegram, YooKassa webhook и CRM credentials
  проверены без вывода secrets;
- external CRM staff quota закрыта;
- alerting настроен на auth abuse, 5xx, billing failures и backup failures;
- owner подтвердил тарифы, юридические тексты, платежные реквизиты и 152-ФЗ
  процесс обработки данных.
