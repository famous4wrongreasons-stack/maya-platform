# User to Membership Migration

## Цель

`User` является глобальной учётной записью. Tenant, филиал, бизнес-роль и
статус участия принадлежат только `Membership`. У одного User могут быть
разные роли и филиалы в нескольких бизнесах.

## Что удалить или изменить в User

После завершения переходного периода:

- удалить поле `tenantId`;
- удалить поле `branchId`;
- удалить поле `role`;
- удалить relations `tenant` и `branch`;
- удалить `@@unique([id, tenantId])`;
- удалить `@@unique([tenantId, email])`;
- удалить `@@unique([tenantId, phone])`;
- удалить indexes по `tenantId` и `branchId`;
- сохранить глобальный account status, но переименовать `status` в
  `accountStatus`, чтобы его нельзя было спутать с `Membership.status`;
- сохранить `id`, identity/contact fields, password hash и timestamps.

Нельзя просто сделать `email @unique` или `phone @unique`: сначала нужно
проверить и объединить исторические дубли.

## Почему поля пока не удалены

1. `User.role=platform_owner` пока является источником platform-доступа для
   сессии без tenant.
2. Один человек мог быть создан отдельным User в нескольких tenant с одним
   email или телефоном.
3. Старый код и предыдущий образ должны оставаться совместимыми во время
   rollout новой Membership-модели.

Удаление сейчас было бы потенциально разрушающим. Runtime уже не доверяет этим
полям для tenant-авторизации, поэтому безопаснее завершить перенос по фазам.

## Фаза 0: уже выполнено

- Membership содержит `tenantId`, `userId`, `branchId`, role и status;
- JWT/session проверяют активную Membership при каждом входе и refresh;
- клиентские профили и loyalty стали per-tenant массивами у глобального User;
- tenant-сессии, identities, providers и appointments закреплены FK на
  Membership;
- `npm run audit:membership-readiness` показывает только aggregate counts.

## Фаза 1: аудит staging-копии production

Запустить до миграции и после неё:

```bash
npm run audit:membership-readiness
```

Любой ненулевой `migration_blockers` запрещает rollout. Блок
`legacy_user_cleanup_readiness` не мешает текущей строгой FK-миграции, но
показывает объём следующего identity merge.

Нельзя выводить email/телефоны в CI logs. Для разбора дублей нужен отдельный
restricted admin job с encrypted audit trail.

## Фаза 2: вынести platform roles

Добавить отдельную модель, например:

```prisma
enum PlatformRole {
  platform_owner
  platform_admin
}

model PlatformMembership {
  id        String           @id @default(cuid())
  userId    String           @unique
  role      PlatformRole
  status    MembershipStatus @default(active)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  user      User             @relation(fields: [userId], references: [id])
}
```

Backfill выполняется idempotent-вставкой из legacy platform roles. После
переключения `JwtStrategy` tenant-less session обязана проверять активную
PlatformMembership, а не `User.role`.

## Фаза 3: объединить дубли identity

1. Нормализовать email и phone отдельными versioned функциями.
2. Получить группы дублей без печати PII в общие logs.
3. Выбрать canonical User для каждой подтверждённой identity.
4. В транзакции перенести Membership, AuthIdentity, AuthSession и historical
   actor references на canonical User.
5. При конфликте `(userId, tenantId)` объединить только после проверки ролей,
   статусов и branch; автоматическое повышение роли запрещено.
6. Сохранить merge map и audit event, затем удалить duplicate User.
7. Добавить partial/global unique indexes только после нулевого отчёта дублей.

Автоматически объединять пользователей только по совпавшему неподтверждённому
email или телефону нельзя.

## Фаза 4: физически удалить legacy-поля

Предусловия:

- нет runtime-чтений `User.tenantId`, `User.branchId`, `User.role`;
- platform access переведён на PlatformMembership;
- migration audit и identity merge report зелёные;
- предыдущий production image проверен на совместимость или больше не нужен.

Удаление выполняется отдельной migration, не вместе с identity merge. Сначала
удаляются FK/index/unique constraints, затем relations/columns. `status`
переименовывается без drop/add, чтобы сохранить account suspension.

## Целевая семантика

- `User.accountStatus`: может ли глобальная учётная запись входить вообще;
- `Membership.status`: может ли User работать/быть клиентом в конкретном
  tenant;
- `Membership.role`: права только в конкретном tenant;
- `Membership.branchId`: ограничение конкретным филиалом;
- `PlatformMembership`: полномочия управления всей платформой.

JWT содержит выбранный tenant как session context, но сервер всегда повторно
проверяет Membership. Сам JWT не является источником актуальной роли.
