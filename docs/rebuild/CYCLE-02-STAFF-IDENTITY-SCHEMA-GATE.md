# STAFF IDENTITY SCHEMA GATE

> Предложение. Ничего не применено: схема, база и код не изменены.
>
> **Главный инвариант:** внешний идентификатор провайдера НИКОГДА не участвует
> самостоятельно в решении об аутентификации, авторизации или владении сессией.

---

## 0. Решение, на котором держится вся миграция

`Staff` заводится новой таблицей, но строки для внутренних мастеров
backfill'ятся **с сохранением `InternalProvider.id` дословно**.

Следствие: `Appointment.staffExternalId` у внутренних записей уже содержит
`InternalProvider.id`, а значит **автоматически становится валидным
`Staff.id`**. Перенос внутренних визитов — тождественное присваивание, без
сопоставления и без риска. Переименования таблицы не требуется, шаг ADD не
удаляет ничего.

Различитель пространств после миграции — **не поле, а структура**:

```
внутренний мастер = Staff, у которого НЕТ ни одной StaffProviderLink
мастер из CRM     = Staff, у которого есть активная StaffProviderLink
```

---

## 1. `Staff` — идентичность мастера в Maya

```prisma
/// Мастер салона глазами Maya.
///
/// 🔴 Идентичность НЕ зависит ни от подключённой CRM, ни от наличия аккаунта.
/// До этой модели она существовала дважды: InternalProvider для внутреннего
/// календаря и CrmStaffAccess.externalStaffId для CRM. Здесь они сходятся.
model Staff {
  id                   String   @id @default(cuid())
  tenantId             String
  /// Аккаунт Maya, если человек им обзавёлся. У мастера, которого только
  /// пригласили, его нет — как не было у CrmStaffAccess.pending_contact.
  userId               String?
  branchId             String?
  /// Имя шифруется всегда. InternalProvider хранил его открытым, CrmStaffAccess
  /// — зашифрованным; объединение поднимает планку до строгой из двух.
  encryptedDisplayName String
  title                String?
  specialization       String?
  avatarUrl            String?
  active               Boolean  @default(true)
  /// Шаг сетки записи. Свойство внутреннего календаря; у мастера из CRM
  /// не используется, значение по умолчанию безвредно.
  slotIntervalMinutes  Int      @default(30)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  tenant       Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user         User?               @relation(fields: [userId], references: [id], onDelete: SetNull)
  membership   Membership?         @relation("StaffMembership", fields: [userId, tenantId], references: [userId, tenantId], onDelete: Cascade)
  branch       Branch?             @relation(fields: [branchId, tenantId], references: [id, tenantId], onDelete: Restrict)
  providerLinks StaffProviderLink[]
  accessGrant  CrmStaffAccess?
  appointments Appointment[]

  /// 🔴 Цель составных внешних ключей. Без него ссылка на мастера могла бы
  /// указать на мастера ЧУЖОГО арендатора.
  @@unique([id, tenantId])
  /// Один аккаунт — один мастер внутри арендатора.
  @@unique([tenantId, userId])
  @@index([tenantId, active])
  @@index([branchId])
}
```

**`onDelete: SetNull` у `user`, а не Cascade.** У `InternalProvider` сегодня
стоит `Cascade` — удаление пользователя уносило бы мастера вместе с его
историей. Идентичность мастера переживает удаление аккаунта, как `Client.userId`
в P2.

---

## 2. `StaffProviderLink` — связь с внешней системой

```prisma
/// Связь мастера Maya с его карточкой у провайдера.
/// Зеркало CrmClientLink: тот же паттерн, те же инварианты.
model StaffProviderLink {
  id         String    @id @default(cuid())
  tenantId   String
  staffId    String
  /// 🔴 Провайдер входит в ключ намеренно. Без него смена CRM отдала бы права
  /// нового человека старому — при совпадении числового id.
  provider   String
  externalId String
  /// Когда карточку в последний раз видели живой в составе команды.
  syncedAt   DateTime  @default(now())
  /// Карточка исчезла у провайдера или CRM отключили. Строка ОСТАЁТСЯ:
  /// история Maya не должна пропадать вместе с записью чужой системы.
  unlinkedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  /// Составной ключ: связь не может указывать на мастера другого арендатора.
  staff  Staff  @relation(fields: [staffId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@unique([tenantId, provider, externalId])
  @@index([tenantId, staffId])
  @@index([tenantId, provider, syncedAt])
  /// Горячий путь совместимости: provider + externalId → staff.
  @@index([tenantId, provider, externalId, unlinkedAt])
}
```

---

## 3. Новая форма `CrmStaffAccess` — только грант доступа

```prisma
model CrmStaffAccess {
  id                   String               @id @default(cuid())
  tenantId             String

  /// 🔴 НОВЫЙ ключ. Грант принадлежит мастеру Maya, а не внешнему id.
  staffId              String?              // nullable в фазе ADD, обязателен на CUTOVER

  role                 UserRole
  status               CrmStaffAccessStatus @default(pending_contact)
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt

  // ── НАСЛЕДИЕ: сохраняется до фазы REMOVE LEGACY, не удаляется сейчас ──
  /// Больше НЕ идентичность. Остаётся только ради совместимого URL
  /// `PATCH team-access/:externalStaffId`, и читается ИСКЛЮЧИТЕЛЬНО через
  /// StaffProviderLink — см. §5.
  externalStaffId      String
  userId               String?
  encryptedDisplayName String
  title                String?

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)
  staff  Staff? @relation(fields: [staffId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@unique([tenantId, staffId])          // ← новая идентичность гранта
  @@unique([tenantId, externalStaffId])  // ← наследие, снимается на CUTOVER
  @@unique([tenantId, userId])           // ← наследие, снимается на CUTOVER
  @@index([tenantId, role, status])
  @@index([staffId])
}
```

**Имя таблицы не меняется в этом гейте.** После REMOVE LEGACY она перестаёт
быть «CRM»-специфичной (внутренним мастерам гранты нужны так же), и
переименование в `StaffAccessGrant` предлагается **отдельным шагом** — оно
затрагивает ~30 мест и не должно ехать вместе с миграцией идентичности.

---

## 4. Связь `Appointment → Staff`

```prisma
model Appointment {
  id              String  @id @default(cuid())
  tenantId        String
  ...
  /// 🔴 Однозначная идентичность мастера внутри Maya.
  staffId         String?          // nullable в фазе ADD, обязателен на CUTOVER

  /// НАСЛЕДИЕ: см. §5. Не источник истины.
  staffExternalId String
  source          String  @default("external")

  staff Staff? @relation(fields: [staffId, tenantId], references: [id, tenantId], onDelete: Restrict)

  @@index([tenantId, staffId, startAt])           // новый горячий путь сетки
  @@index([tenantId, staffExternalId, startAt])   // наследие, снимается позже
}
```

`onDelete: Restrict` — визит не должен исчезать вместе с мастером; удаление
мастера с историей обязано провалиться, а не тихо унести записи.

---

## 5. Судьба `staffExternalId` в период совместимости

Правило, которое не даёт ему стать вторым источником истины:

| Фаза | Кто пишет `staffExternalId` | Кто его читает |
|---|---|---|
| ADD | как сегодня | как сегодня |
| BACKFILL | как сегодня | как сегодня |
| DUAL | пишется вместе с `staffId` | **читается только при `staffId IS NULL`** |
| VERIFY | то же | то же, счётчик расхождений обязан быть 0 |
| CUTOVER | **производное**: выводится из активной `StaffProviderLink`, самостоятельного значения не имеет | **не читается никем** |
| REMOVE LEGACY | колонка снята | — |

**Ни в одной фазе `staffExternalId` не участвует в решении о доступе.** Уже на
шаге CUTOVER `journalStaffBinding` возвращает `staffId`, а не внешний id.

### Совместимый lookup для публичного URL

`PATCH team-access/:externalStaffId` остаётся как есть. Внутри — единственный
разрешённый путь чтения внешнего id:

```
provider (из CrmIntegration арендатора)
  + externalStaffId (из URL)
  → StaffProviderLink { tenantId, provider, externalId, unlinkedAt: null }
  → Staff
  → CrmStaffAccess (по staffId)
```

Обращение к `CrmStaffAccess.externalStaffId` напрямую после CUTOVER запрещено;
барьер — тест по образцу `domain/boundary.spec.ts`.

---

## 6. Составные ключи и уникальности, безопасные по арендатору

| Ограничение | Что запрещает |
|---|---|
| `Staff.@@unique([id, tenantId])` | цель составных FK |
| `Staff.@@unique([tenantId, userId])` | один аккаунт — два мастера одного салона |
| `StaffProviderLink.staff` → `(staffId, tenantId)` | связь на мастера чужого арендатора |
| `StaffProviderLink.@@unique([tenantId, provider, externalId])` | одна связь на внешнюю карточку; **у разных арендаторов id совпадать МОЖЕТ** |
| `CrmStaffAccess.staff` → `(staffId, tenantId)` | грант на мастера чужого арендатора |
| `Appointment.staff` → `(staffId, tenantId)` | визит на мастера чужого арендатора |
| `Staff.branch` → `(branchId, tenantId)` | филиал чужого арендатора |
| `Staff.membership` → `(userId, tenantId)` | членство в чужом арендаторе |

Все — по правилу миграции `20260717235900_strict_tenant_relations`. Схема
защищает от порчи данных, но `assertTenantId` на путях чтения остаётся
обязательным: это разные рубежи.

---

## 7. Квалификация провайдера

- Значение `provider` берётся из `CrmIntegration.provider` арендатора на момент
  создания связи и **фиксируется в строке** — оно не должно «переезжать» при
  смене интеграции.
- Внутренний мастер — `Staff` **без единой связи**. Не «связь с провайдером
  `internal`»: у него нет внешней системы, и заводить фиктивного провайдера
  значило бы вернуть смешение с другой стороны.
- `Staff` может иметь **несколько** связей (история смен CRM); активной
  считается связь с `unlinkedAt IS NULL`. Инвариант «активная связь на пару
  (арендатор, провайдер) не более одной» держится ключом
  `@@unique([tenantId, provider, externalId])` плюс правилом отвязки при смене.

---

## 8. Перенос шести существующих `CrmStaffAccess`

```sql
-- Шаг 1: идентичность
INSERT INTO "Staff" (id, "tenantId", "userId", "encryptedDisplayName", title, active, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."tenantId", a."userId", a."encryptedDisplayName", a.title,
       (a.status <> 'disabled'), a."createdAt", now()
FROM "CrmStaffAccess" a
WHERE NOT EXISTS (                             -- см. §12: тот же человек уже мог
  SELECT 1 FROM "Staff" s                      -- приехать из InternalProvider
  WHERE s."tenantId" = a."tenantId" AND s."userId" IS NOT NULL AND s."userId" = a."userId"
);

-- Шаг 2: связь с провайдером — берём провайдера арендатора
INSERT INTO "StaffProviderLink" (id, "tenantId", "staffId", provider, "externalId", "syncedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."tenantId", s.id, i.provider, a."externalStaffId", now(), now(), now()
FROM "CrmStaffAccess" a
JOIN "Staff" s ON s."tenantId" = a."tenantId" AND (s."userId" = a."userId" OR ...)
JOIN "CrmIntegration" i ON i."tenantId" = a."tenantId";

-- Шаг 3: грант указывает на мастера
UPDATE "CrmStaffAccess" a SET "staffId" = l."staffId"
FROM "StaffProviderLink" l
WHERE l."tenantId" = a."tenantId" AND l."externalId" = a."externalStaffId";
```

🔴 **Шаг 2 нельзя выполнять, если у арендатора нет `CrmIntegration`.** Такой
случай в проде есть: арендатор `maya-os` без интеграции и без строк доступа —
для него `JOIN` просто не даст строк, что верно. Но миграция обязана
**провалиться**, если строки доступа есть, а интеграции нет: провайдера неоткуда
взять, и молча подставить `'yclients'` нельзя.

Боевое ожидание: **6 строк → 6 `Staff` → 6 `StaffProviderLink`**, провайдер
`yclients`.

---

## 9. Перенос четырёх реально используемых идентичностей мастеров

В проде визиты ведут **4 различных мастера**, из них **2 не имеют строки
`CrmStaffAccess`**. Для них §8 не создаст ничего, и `Appointment.staffId`
остался бы пустым.

Правило:

1. Взять состав команды у провайдера (`getTeamMembers`) и создать `Staff` +
   `StaffProviderLink` для недостающих внешних id. Имя — из ответа провайдера,
   зашифрованное тем же сервисом, что и остальные.
2. Если провайдер недоступен или мастера в составе больше нет — создать `Staff`
   с техническим именем `«Мастер <provider>#<externalId>»`, `active = false` и
   связью с `unlinkedAt = now()`. **Выдумывать имя нельзя**, терять визит нельзя.
3. Ни в каком случае не сопоставлять по имени автоматически — то же правило,
   что и запрет на телефон как глобальную идентичность клиента в P2.

Этот шаг **не выражается чистым SQL** (нужен вызов провайдера и шифрование) и
выполняется backfill-скриптом приложения с отчётом: сколько создано из состава
команды, сколько техническими.

---

## 10. Перенос восемнадцати визитов

```sql
-- 10.1 внутренние: тождественно, потому что Staff.id сохранил InternalProvider.id
UPDATE "Appointment" a SET "staffId" = a."staffExternalId"
WHERE a.source = 'internal'
  AND EXISTS (SELECT 1 FROM "Staff" s WHERE s.id = a."staffExternalId" AND s."tenantId" = a."tenantId");

-- 10.2 внешние: через связь
UPDATE "Appointment" a SET "staffId" = l."staffId"
FROM "StaffProviderLink" l
WHERE l."tenantId" = a."tenantId" AND l."externalId" = a."staffExternalId" AND a.source = 'external';

-- 10.3 ГЕЙТ: незакрытых визитов быть не должно
DO $$
DECLARE orphan int;
BEGIN
  SELECT count(*) INTO orphan FROM "Appointment" WHERE "staffId" IS NULL;
  IF orphan > 0 THEN
    RAISE EXCEPTION 'staff identity backfill: % визитов без мастера Maya', orphan;
  END IF;
END $$;
```

Боевое ожидание: **18 из 18**, все по ветке 10.2.

---

## 11. Перенос `InternalProvider` — корректность при непустой таблице

В проде 0 строк, но миграция обязана быть верной для остальных установок.

```sql
-- 11.1 идентичность с СОХРАНЕНИЕМ id (см. §0)
INSERT INTO "Staff" (id, "tenantId", "userId", "branchId", "encryptedDisplayName",
                     title, specialization, "avatarUrl", active, "slotIntervalMinutes",
                     "createdAt", "updatedAt")
SELECT p.id, p."tenantId", p."userId", p."branchId",
       NULL,                      -- ← имя шифруется отдельно, см. ниже
       p.title, p.specialization, p."avatarUrl", p.active, p."slotIntervalMinutes",
       p."createdAt", now()
FROM "InternalProvider" p;

-- 11.2 расписание, услуги и исключения переезжают на staffId
ALTER TABLE "InternalProviderService"        ADD COLUMN "staffId" TEXT;
ALTER TABLE "InternalAvailabilityRule"       ADD COLUMN "staffId" TEXT;
ALTER TABLE "InternalAvailabilityException"  ADD COLUMN "staffId" TEXT;
UPDATE "InternalProviderService"       SET "staffId" = "providerId";
UPDATE "InternalAvailabilityRule"      SET "staffId" = "providerId";
UPDATE "InternalAvailabilityException" SET "staffId" = "providerId";
```

Присваивание тождественное — ровно потому, что 11.1 сохранил `id`.

🔴 **`encryptedDisplayName` в SQL заполнить нельзя.** `InternalProvider.displayName`
хранится **открытым текстом**, `CrmStaffAccess.encryptedDisplayName` —
зашифрованным. Понижать планку до открытого текста недопустимо, а шифровать
средствами Postgres нечем: ключ у приложения.

Поэтому:
- колонка создаётся **nullable** в фазе ADD;
- backfill-скрипт приложения шифрует `displayName` и заполняет её;
- `NOT NULL` ставится только на CUTOVER, после проверки `count(*) WHERE
  encryptedDisplayName IS NULL = 0`;
- `InternalProvider.displayName` **не удаляется** до REMOVE LEGACY.

Сама таблица `InternalProvider` остаётся до REMOVE LEGACY и не переименовывается.

---

## 12. Дубли и коллизии

| Случай | Решение |
|---|---|
| Один человек и как `InternalProvider`, и как `CrmStaffAccess` | Определяется по общему `userId`. **Побеждает строка из `InternalProvider`** — её `id` уже стоит в визитах. CRM-грант привязывается к тому же `Staff`, связь заводится к нему же |
| Обе стороны без `userId` | Автоматически **не** сопоставляются. Два `Staff`, слияние — осознанное действие владельца. Сопоставление по имени запрещено |
| Два `CrmStaffAccess` с одним внешним id | Невозможно: `@@unique([tenantId, externalStaffId])` |
| Один внешний id у двух арендаторов | Разрешено и нормально: ключ связи включает `tenantId` |
| Провайдер переиспользовал внешний id для ДРУГОГО человека | 🔴 Не обнаруживается в принципе. Смягчение: связь с `unlinkedAt` не переиспользуется молча — повторная активация ранее отвязанной связи требует подтверждения владельца |

Слияния `Staff` в этом гейте **нет**: у мастера нет проблемы «семья на один
телефон», и вводить механизм слияния без потребности означало бы усложнить
модель ради симметрии.

---

## 13. Отключение и переподключение CRM

### Явная политика отключения (сегодня её нет вовсе)

Сегодня `disconnectIntegration` удаляет только `CrmIntegration`; гранты, роли и
сессии остаются жить со старыми внешними id. Предлагаемая политика:

| Действие | Что делает |
|---|---|
| 1 | все `StaffProviderLink` арендатора для этого провайдера → `unlinkedAt = now()` |
| 2 | `CrmStaffAccess.status = 'disabled'` для мастеров, чей грант держался на этом провайдере |
| 3 | отзыв сессий этих пользователей, `revokeReason: 'crm_disconnected'` |
| 4 | 🔴 **владельца не трогать.** Роли владельца и администратора не выдаются CRM и не должны ею отзываться — иначе отключение интеграции запирает владельца снаружи |
| 5 | `Staff`, визиты и история **сохраняются полностью** |

### Переподключение того же провайдера

Связь ищется по `(tenantId, provider, externalId)`. Найденная отвязанная связь
**не активируется молча** — владелец подтверждает восстановление доступа. Это
прямое следствие последней строки §12.

---

## 14. Смена CRM

| Шаг | Что происходит |
|---|---|
| 1 | Старый провайдер отключается по политике §13 |
| 2 | Новый провайдер подключается, состав команды читается заново |
| 3 | Для каждого члена команды заводится `Staff`+связь **или** предлагается сопоставление с существующим `Staff` |
| 4 | Сопоставление подтверждает владелец. Автоматического сопоставления по имени нет |

**Совпадение внешних id между провайдерами больше не может передать права:**
ключ связи включает `provider`, а старая связь уже отвязана. Права принадлежат
`Staff`, и передать их можно только явным сопоставлением, которое делает
человек.

Визиты не трогаются вовсе: они указывают на `staffId`, а не на внешний id.

---

## 15. Семантика отзыва сессий

Отзыв ключуется на `Staff.userId`, найденном по `staffId`. Внешний id в этом
пути не участвует ни на одном шаге.

| Событие | Причина | Примечание |
|---|---|---|
| Смена роли гранта | `crm_staff_role_changed` | строка существует, не меняем |
| Смена контакта входа | `crm_staff_login_changed` | существует |
| Грант отключён сверкой | `crm_staff_inactive` | существует |
| **Отключение CRM** | `crm_disconnected` | **новая**, сегодня события нет |

Существующие строки причин сохраняются дословно: они уже записаны в боевых
данных, и переименование испортило бы историю.

---

## 16. Целевое поведение `reconcileCrmTeamAccess`

```
для каждого члена команды провайдера:
    связь ← StaffProviderLink(tenantId, provider, externalId)
    если связи нет → создать Staff + связь, грант = pending_contact
    если связь отвязана → НЕ активировать молча, вынести на подтверждение
    иначе → syncedAt = now()

для каждой активной связи, которой НЕТ в составе команды:
    unlinkedAt = now()
    грант → disabled   (кроме ролей владельца/администратора)
    отозвать сессии, причина crm_staff_inactive
```

Ключевое отличие от сегодняшнего: сравнение идёт **по паре
(провайдер, внешний id)**, а не по голой строке. Именно это закрывает
сценарий fail-open из анализа §6.4.

---

## 17. Уведомления внутреннего календаря

Дефект из анализа §6.5 закрывается сменой ключа поиска получателя:

```ts
// было — искали cuid в таблице ВНЕШНИХ идентификаторов, совпадение невозможно
const staffLink = await this.prisma.crmStaffAccess.findFirst({
  where: { tenantId, externalStaffId: String(input.staffExternalId), ... },
});

// станет — идентичность Maya, одинаково для обоих источников
const staff = await this.prisma.staff.findFirst({
  where: { tenantId, id: input.staffId, active: true },
  select: { userId: true },
});
```

Это **изменение боевого поведения**: мастер внутреннего календаря начнёт
получать уведомления, которых сегодня не получает. Оно ожидаемо и желательно,
но должно ехать **отдельным шагом после CUTOVER** и быть названо в отчёте, а не
проскочить внутри миграции идентичности.

---

## 18. `/me` и `staff_profile`

```jsonc
// Провод в период совместимости — поле external_staff_id СОХРАНЯЕТСЯ
{
  "staff_profile": {
    "linked": true,
    "source": "crm",              // 'crm' | 'internal' — как сегодня
    "title": "...",
    "staff_id": "<Staff.id>",     // ← НОВОЕ, есть у обоих источников
    "external_staff_id": "..."    // ← только у CRM; наследие, снимается вместе с §5
  }
}
```

Добавление поля аддитивно и не ломает PWA. Оно закрывает асимметрию из анализа
§6.7: у внутреннего мастера появляется идентификатор, по которому кабинет
сможет отобрать «свои визиты» — сегодня это для него невозможно.

Смена самого фильтра в PWA на `staff_id` — часть **отдельной API-миграции**, как
вы и решили по публичному endpoint.

---

## 19. Откат по фазам

| Фаза | Откат | Обратимо |
|---|---|---|
| ADD | `DROP TABLE StaffProviderLink, Staff`; снять добавленные nullable-колонки | полностью |
| BACKFILL | `DELETE` из двух новых таблиц; `UPDATE ... SET staffId = NULL` | полностью |
| DUAL | вернуть релиз; старые колонки заполнены и актуальны | полностью |
| VERIFY | то же | полностью |
| CUTOVER | вернуть релиз; `staffExternalId` ещё на месте и актуален | полностью |
| REMOVE LEGACY | 🔴 **точка невозврата** — только восстановление из дампа | нет |

Правило: REMOVE LEGACY выполняется **отдельным выкатом, не ранее чем через
неделю** после CUTOVER, и непосредственно перед ним снимается дамп.

---

## 20. Стратегия выката

| # | Фаза | Что едет | Гейт перехода |
|---|---|---|---|
| 1 | **ADD** | миграция: 2 таблицы + nullable-колонки `Staff.encryptedDisplayName`, `CrmStaffAccess.staffId`, `Appointment.staffId`, `staffId` у трёх таблиц расписания. Кода нет | `release:preflight` зелёный, структура прода = структура из репозитория |
| 2 | **BACKFILL** | скрипт приложения: §8, §9, §11. Идемпотентный, с отчётом | 0 визитов без `staffId`; 0 `Staff` без имени; число связей = числу грантов |
| 3 | **DUAL** | код пишет `staffId` и `staffExternalId`, читает `staffId` с откатом на старое поле | сутки без ошибок; счётчик расхождений 0 |
| 4 | **VERIFY** | только измерение: сверка обоих путей на боевых данных | расхождений 0 |
| 5 | **CUTOVER** | `NOT NULL` на `staffId`; чтение только по `staffId`; `journalStaffBinding` отдаёт `staffId`; совместимый lookup §5 для публичного URL | смоук: вход мастера, журнал дня, отметка присутствия, отчёт владельца |
| 6 | **позже** | §17 (уведомления), снятие legacy-колонок, переименование `CrmStaffAccess` | отдельные одобрения |

Фаза 3 существует ровно один переход и **не является долгоживущей двойной
записью**: `staffExternalId` в ней уже производное, а не второй источник истины.

---

## Соответствие обязательным инвариантам

| Инвариант | Чем обеспечен |
|---|---|
| `(tenantId, provider, externalId)` однозначно определяет связь | `@@unique` на `StaffProviderLink` |
| Связь принадлежит ровно одному `Staff` | `staffId` NOT NULL + составной FK |
| `Staff` может иметь несколько связей | `providerLinks StaffProviderLink[]`, активная — с `unlinkedAt IS NULL` |
| Межарендные связи невозможны на уровне БД | составные FK `(id, tenantId)` во всех четырёх местах |
| Грант принадлежит `Staff`, а не внешнему id | `CrmStaffAccess.staffId` + `@@unique([tenantId, staffId])` |
| Смена CRM не передаёт права из-за совпадения id | `provider` в ключе связи + отвязка при отключении + подтверждение владельца |
| Отключение гасит доступ и сессии по явной политике | §13, включая защиту владельца |
| Внутренний и CRM-мастер — одна модель | `Staff` одна; различие в наличии связей, а не в отдельной таблице |
| У визита однозначная идентичность мастера Maya | `Appointment.staffId` NOT NULL после CUTOVER + FK `Restrict` |
| `staffExternalId` не становится вторым источником истины | §5: производное с фазы CUTOVER, не читается в решениях |
| Внешний id не участвует в решениях о доступе | `journalStaffBinding` → `staffId`; отзыв сессий → `Staff.userId`; чтение внешнего id только в совместимом lookup |

## Что этот гейт сознательно НЕ решает

- Переименование `CrmStaffAccess` → `StaffAccessGrant`.
- Смена публичного URL `team-access/:externalStaffId` — по вашему решению.
- `BusinessReview.staffExternalId` (0 строк) — переводится на `staffId` вместе с
  REMOVE LEGACY.
- Слияние двух `Staff`, оказавшихся одним человеком без общего `userId`.
- `quota.service.ts` складывает три счётчика персонала — после объединения
  идентичности расчёт станет проще, но это отдельная правка.

---

```
STAFF IDENTITY SCHEMA PROPOSED
SCHEMA APPLIED: NO
DATABASE CHANGED: NO
WAITING FOR APPROVAL
```
