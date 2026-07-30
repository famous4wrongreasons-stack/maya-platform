# MAYA Multi-tenant Security Audit

Дата среза: 17 июля 2026 года. Область проверки: NestJS/Prisma backend из
`MAYA_OS_BACKEND_MULTI_TENANT_2026-07-17_a653cddc.zip` с последующими
изменениями ветки `codex/maya-os-crm-integration-final`.

## Итог

Backend готов к изолированному staging-тестированию нескольких бизнесов.
Авторизация больше не использует tenant, роль или филиал из запроса либо из
legacy-полей `User`: полномочия подтверждаются активной `Membership`. Новая
миграция дополнительно закрепляет эту границу составными внешними ключами в
PostgreSQL.

Это пока не разрешение на коммерческий production rollout. Перед ним нужны
staging-прогон миграции на копии реальных данных, инфраструктурные меры из
runbook и закрытие явно перечисленных остаточных рисков.

## Состояние целевой архитектуры

| Контур             | Статус               | Подтверждение                                                                       |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------- |
| JWT + Membership   | Реализован           | JWT-поля не считаются полномочиями без активной Membership                          |
| TenantContext      | Реализован           | AsyncLocalStorage, конфликтующие сигналы закрываются с 403                          |
| Анонимный tenant   | Реализован           | Только host/subdomain или публичный route slug                                      |
| Изоляция записей   | Реализована          | Repository-фильтры и FK `(clientId, tenantId)`                                      |
| Изоляция филиалов  | Реализована          | Составные FK `(branchId, tenantId)`                                                 |
| Строгие enum       | Реализованы          | TenantStatus, UserRole, UserStatus, MembershipStatus, CalendarSource                |
| PAST_DUE           | Реализован           | Фиксированный grace period 3 дня, затем HTTP 402                                    |
| Тарифные квоты     | Реализованы частично | Локальные филиалы и сотрудники блокируются мягко                                    |
| White-label        | Реализован           | Полная настройка только business_plus; logo/appName доступны базово                 |
| CRM ACL            | Реализован           | Внутренний CRMAdapter и нормализованные модели                                      |
| YooKassa ACL       | Частично             | Провайдер изолирован сервисом, но BillingService зависит от concrete class          |
| Clean Architecture | Частично             | Auth/appointments имеют repositories; ряд services всё ещё вызывает Prisma напрямую |

## Закрытые находки

### 1. Два источника tenant-полномочий

Как было в архиве: `User.tenantId`, `User.branchId` и `User.role` могли
расходиться с `Membership`.

Как исправлено: `JwtStrategy`, session refresh, social auth, customer lookup и
AI approvals получают tenant/role/branch из активной `Membership`. Тесты явно
проверяют, что устаревший `User.tenantId` не используется как fallback.
Физические legacy-поля пока сохранены только для совместимой миграции.

### 2. Подмена tenant клиентом

Как было потенциально опасно: tenant мог бы прийти из `X-Tenant-Id`, body или
route без сопоставления с пользователем.

Как исправлено: в контроллерах нет доверия к `X-Tenant-Id`. Для обычного
пользователя `TenantAccessGuard` принимает только tenant активной Membership.
Tenant в route допустим для platform owner либо обязан совпасть с Membership.
Одновременное разрешение разных tenant через host, route и JWT завершается 403.

### 3. Изоляция только на уровне application-кода

Как было: часть таблиц ссылалась на глобальный `User.id` или `Branch.id`, и
ошибка в `where` могла создать связь между разными tenant.

Как исправлено миграцией
`20260717235900_strict_tenant_relations`:

- AuthIdentity и tenant AuthSession требуют `(userId, tenantId)` из Membership;
- CustomerProfile и LoyaltyAccount требуют Membership того же tenant;
- Appointment требует Membership клиента и Branch того же tenant;
- InternalProvider требует Membership пользователя и Branch того же tenant;
- legacy User.branchId также ограничен собственным tenant;
- historical actor-ссылки остаются на глобальный User, но companion tenant
  защищён CHECK constraint;
- миграция атомарна и сначала выполняет fail-fast проверку данных.

### 4. Произвольные статусы и роли

Как было: критичные значения хранились в `String`.

Как исправлено: добавлены PostgreSQL/Prisma enum. Миграция не заменяет столбцы
через drop/add и не теряет данные; используется `ALTER COLUMN ... TYPE ...
USING`, а неизвестное значение останавливает rollout до изменений.

### 5. Квоты и white-label

Как было: наличие плана не гарантировало соблюдение лимитов.

Как исправлено:

- `solo`: 1 филиал, 5 сотрудников, полный white-label выключен;
- `business`: 3 филиала, 25 сотрудников, полный white-label выключен;
- `business_plus`: 10 филиалов, 100 сотрудников, полный white-label включён;
- controller guard даёт ранний отказ, service повторяет проверку против обхода;
- существующие ресурсы не удаляются, новая запись получает `quota_exceeded`;
- basic logo/appName разрешены, расширенная тема требует business_plus.

### 6. Небезопасный production seed

Как было: локальные fallback-пароли и ключ шифрования могли использоваться при
неосторожном production seed.

Как исправлено: при `NODE_ENV=production` seed требует явные owner/demo
credentials и `CRM_ENCRYPTION_KEY`, проверяет минимальную длину и отклоняет
placeholder-значения. Значения секретов никогда не печатаются аудитом.

## Открытые риски

### P1. Legacy-поля User ещё существуют физически

Runtime-риск снят, но схема всё ещё содержит `tenantId`, `branchId` и `role`.
Нельзя удалять их одним шагом: platform owner пока хранится через `User.role`,
а одинаковые email/телефоны могут принадлежать нескольким историческим User.
Безопасный порядок описан в `USER_MEMBERSHIP_MIGRATION.md`.

### P1. Внешние сотрудники CRM не участвуют в локальном quota counter

Лимит защищает Membership staff и internal providers. YClients/Altegio staff
не копируются в PostgreSQL, поэтому подключение CRM с числом сотрудников выше
плана пока не блокируется. Перед коммерческим запуском activation должен
сравнивать `preview.staff.count` с `maxStaff` и возвращать upgrade-required,
не удаляя и не меняя данные CRM.

### P1. Нет универсального tenant repository boundary

Auth и Appointment уже используют repositories, но многие сервисы
(`InternalCalendarService`, `CustomersService`, `TenantsService`, analytics,
loyalty) обращаются к Prisma напрямую. Сейчас они вызывают
`TenantContext.assertTenantId()` и покрыты тестами, но новый разработчик всё
ещё может забыть tenant predicate при чтении.

Следующий архитектурный шаг: tenant-scoped repositories или Prisma extension,
которая требует TenantContext для tenant-моделей и автоматически добавляет
tenantId. До этого изменения review должен запрещать bare `findUnique({ id })`
для tenant-данных.

### P2. YooKassa зависит от concrete client

CRM соответствует ACL через `CRMAdapter`. В billing HTTP-клиент изолирован в
`YooKassaClientService`, но `BillingService` инъектирует именно этот класс.
Нужно ввести `PaymentGateway` token/interface и сделать YooKassa одной из
реализаций. Это не создаёт текущую tenant-утечку, но усложняет замену провайдера
и contract tests.

### P2. System tenant context является привилегированным API

`runAsSystemTenant()` нужен billing jobs, onboarding и platform admin. Он не
доступен клиенту по HTTP, но внутри backend обходит Membership. Его следует
держать только в system gateways/jobs и логировать каждое новое место вызова.

### P2. Clean Architecture внедрена не во всех модулях

Целевой путь `Controller -> Service -> Repository -> Prisma` соблюдён не
повсеместно. Это технический долг, а не причина переписывать приложение:
repositories нужно выделять по одному bounded context, сохраняя API contracts.

## Проверки выполненного блока

- `npm run typecheck`;
- `npm run typecheck:scripts`;
- `npm run lint`;
- `npm test -- --runInBand`: 76 suites, 400 tests;
- `npm run build`;
- `npx prisma validate`;
- все 23 миграции на чистой PostgreSQL;
- Prisma schema diff: empty migration;
- seed на изолированной БД;
- прямые негативные SQL-тесты cross-tenant User/Branch, Appointment,
  AuthSession и invalid enum.

Ни одна новая миграция из этого блока не применялась к production.
