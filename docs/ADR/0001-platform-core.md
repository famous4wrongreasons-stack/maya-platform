# ADR 0001 - Maya OS Platform Core

Дата: 2026-07-08
Статус: accepted

## Контекст

MAYA уже работает как production vertical для одного салона: PWA, Telegram,
YClients, AI chat, voice, owner tools and operational automations. Параллельно
существует NestJS/Prisma/PostgreSQL backend для SaaS.

Новый product direction требует Maya OS: universal AI Operating System для
множества сервисных бизнесов и вертикалей.

## Решение

Разделить мышление на два контура:

1. Current Production Vertical - боевой адаптер и источник проверенных сценариев.
2. Maya OS Platform Core - multi-tenant ядро, которое не наследует барбершоповые
   hardcodes и строится вокруг универсальных entities/tools/events.

NestJS/PostgreSQL backend становится кандидатом на platform core. Python
production contour остается стабильным vertical runtime до управляемого cutover.

## Последствия

Плюсы:

- меньше риска сломать текущий салон;
- проще строить tenant isolation;
- проще подключать billing, onboarding, CRM adapters;
- текущий продукт продолжает приносить реальные сценарии.

Минусы:

- временно два контура;
- требуется disciplined migration;
- часть логики придется переносить из Python в platform core.

## Альтернативы

1. Продолжать превращать Python monolith в SaaS. Отклонено: высокий риск,
   global config, SQLite/ad-hoc migrations, сложная tenant isolation.
2. Переписать все сразу. Отклонено: высокий риск для production и слишком большой
   blast radius.

## Guardrails

- Любой перенос должен иметь rollback.
- Platform core не копирует secrets/global CRM assumptions.
- New features first target platform abstractions, then vertical adapter if needed.
