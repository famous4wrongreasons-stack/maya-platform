# MAYA OS Release Candidate

Дата: 2026-07-13. Ветка: `codex/maya-os-release-candidate`. База: `codex/human-onboarding-trial`. В `main` изменения не вносились, production не затрагивался.

## Что объединено

- multi-tenant backend, tenant isolation, auth/session security и internal calendar;
- AI onboarding и подтверждаемая регистрация 10-дневного trial;
- честный Feature Registry и CRM provider readiness;
- единый onboarding в каноничном чате MAYA для PWA и iOS;
- subscription fence, выбор тарифа, checkout-контракт и God Mode trial analytics;
- universal home без данных конкретного салона и без скрытых legacy-запросов.

## Проверки release candidate

- свежая PostgreSQL-база: успешно применены все 15 Prisma-миграций и seed;
- `npm audit --omit=dev --audit-level=high`: high/critical уязвимостей нет, остаются 3 moderate в Prisma dev toolchain;
- Prisma generate/validate, TypeScript typecheck, scripts typecheck и ESLint: успешно;
- NestJS unit: 52 suites, 232 tests; e2e: 1 test; HTTP smoke: успешно;
- NestJS build: успешно;
- legacy Python: compileall и 110 tests успешно;
- frontend bundles: 25 inline scripts успешно;
- PWA/iOS bundle: 22/22 скрипта в каждом, byte-identical после `npx cap sync ios`.

## Что остаётся до production

Требуются реальные OAuth/SMS/CRM/YooKassa credentials, production webhook и платёжные реквизиты, юридические тексты/согласия, backup/monitoring и управляемый rollout. Live CRM и платежи нужно проверить на выделенном тестовом tenant до включения пользователям. Staff AI, commerce и video analytics пока не являются tenant-aware universal-модулями и корректно скрыты readiness-гейтом.
