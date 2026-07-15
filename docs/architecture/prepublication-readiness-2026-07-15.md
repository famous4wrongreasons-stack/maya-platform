# MAYA OS Pre-publication Readiness

Дата среза: 2026-07-15.

## Статус

Универсальный multi-tenant backend MAYA OS находится в состоянии локального
release candidate. Production «Мужской Эстетики», production PWA и установленная
iOS-сборка этим пакетом не изменялись.

Готово и проверено:

- tenant, membership, TenantContext и deny-by-default tenant isolation;
- plan, entitlement, Feature Registry, readiness и full-access trial;
- BrandingConfig, industry presets, tenant PWA manifest/icons;
- email/social/session auth, refresh rotation, revoke и abuse protection;
- универсальный AI onboarding, шаблоны услуг и семидневный график;
- customer portal, внутренний календарь, записи, перенос и отмена;
- authoritative loyalty, customers, expenses и role-scoped analytics;
- CRM preview/cutover safeguards и YClients/Altegio production path;
- YooKassa server flow, idempotency и webhook foundation;
- общий privacy-safe AI Core для native/web/Telegram/voice;
- role/feature-scoped AI tools и immutable approval workflow;
- staging compose, bootstrap/preflight/smoke/maintenance/release scripts;
- миграции с checksum-контролем и fresh-database проверкой.

## Последний кодовый gate

Backend не нужно переписывать. Перед общим тестированием требуется один
frontend-пакет:

- подключить обычный чат MAYA к `POST /api/ai/chat`;
- отрисовать approve/reject карточки AI-действий;
- завершить role-driven routing после email/social login;
- запретить public runtime использовать localhost/query tenant overrides;
- подключить operational API к правильным экранам;
- синхронизировать PWA и iOS web bundle;
- пройти мобильную acceptance matrix.

Точный контракт: `CLAUDE_PREPUBLICATION_FRONTEND_TASK.md`.

После результата Клода Codex должен выполнить финальное ревью diff, повторить
все проверки, собрать одну pre-publication iOS/PWA версию и только затем открыть
пользовательское тестирование.

## Доказательства проверки backend

- TypeScript typecheck: пройден.
- TypeScript scripts typecheck: пройден.
- ESLint: пройден.
- Unit: 70 suites, 341 tests пройдены.
- E2E: 1 test пройден.
- Build: пройден.
- Legacy Python: 141 tests пройдены.
- Frontend bundle parse: 26 inline scripts пройдены.
- Prisma validate/generate: пройдены.
- Fresh PostgreSQL: применены все 18 миграций.
- Release preflight: 18 migration checksums совпали.
- Fresh-database HTTP smoke: trial, onboarding, AI, approvals, tenant fence,
  auth rotation, CRM preview и internal booking пройдены.
- Secret scan: утечек не найдено.
- Production dependency audit: high/critical уязвимостей не найдено.

Три moderate advisory относятся к Prisma development toolchain. Автоматический
forced fix предлагает несовместимый downgrade, поэтому он намеренно не применён
и не является production runtime blocker.

## Не является launch blocker v1

Следующие пункты должны оставаться скрытыми или честно помеченными как planned,
но не задерживают первый закрытый запуск:

- DIKIDI, Whitelines и Salon Online до получения официальных API-доступов;
- custom domains;
- video analytics;
- расширенная commerce-автоматизация;
- функции, у которых Feature Registry сообщает только
  `current_runtime`/`planned`, но не `platform_backend`.

## Внешние launch gates

Код не может сам получить домены, реквизиты и provider credentials. Они вынесены
в `OWNER_PREPUBLICATION_CHECKLIST.md`. До их заполнения можно проводить локальное
и staging-тестирование, но нельзя считать коммерческий production запуск
завершённым.
