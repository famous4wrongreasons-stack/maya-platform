# ADR 0003 - Universal Domain Model

Дата: 2026-07-08
Статус: accepted

## Контекст

Первая вертикаль MAYA - beauty/barbershop. Но Maya OS должна работать для
fitness, clinics, education, repair, rental, consulting and other service
businesses.

## Решение

Не использовать beauty-specific core entities. Core model строится вокруг:

- tenant;
- location;
- resource;
- service;
- customer;
- appointment;
- order/payment;
- package/entitlement;
- campaign;
- task;
- event;
- tool invocation;
- approval request.

Вертикальные различия выражаются через taxonomy, metadata, templates, policies
and adapters.

## Последствия

Плюсы:

- new verticals do not require core rewrite;
- CRM adapters map to stable concepts;
- AI tools stay reusable;
- marketplace can target universal primitives.

Минусы:

- на старте модель кажется абстрактнее;
- frontend copy/templates должны учитывать vertical context;
- нужны хорошие adapter mappings.

## Альтернативы

1. Keep salon/barber/service-specific tables in core. Отклонено: будет блокировать
   другие отрасли.
2. Fully schema-less model. Отклонено: сложно обеспечить permissions, analytics
   and billing.

## Guardrails

- New entity must pass vertical portability review.
- If a field is only for one vertical, use metadata or extension table.
- Analytics definitions must use universal metrics first.
