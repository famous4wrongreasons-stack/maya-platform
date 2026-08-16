# CYCLE 02 · P2 — SCHEMA GATE: Client Identity

> Предложение. **Схема и база не изменены.** Ни одной миграции не применено.
> Ожидает отдельного approval.

---

## 1. Что решаем

У Maya **нет собственной идентичности клиента**. Внешний `external_client_id`
вычисляется адаптером (`yclients-crm.adapter.ts:2017`) и выбрасывается — пять
вхождений в коде, ни одного потребителя, ни одного поля в схеме. Единственный
ключ сопоставления — последние десять цифр телефона
(`phone.util.ts:77 phoneMatchKey`).

Три следствия, каждое подтверждено кодом:

1. **Смена телефона рвёт историю.** Атрибуция строит псевдоним
   `subjectRef = HMAC(phone)` (`recovery.service.ts:25`). Новый номер — новый
   субъект, прошлые касания клиенту больше не принадлежат.
2. **Дубли карточек в CRM — не гипотеза, а разобранный боевой случай**
   (комментарий в `yclients-crm.adapter.ts:2107`). Баланс собирается по всем
   дублям, визиты — только по первой карточке.
3. **Смена CRM обнуляет связь с прошлым**: `CrmIntegration` имеет уникальный
   ключ по `tenantId` и перезаписывается без следа.

---

## 2. Почему две таблицы, а не одна

Требование «один Maya-клиент → несколько провайдеров» делает строку связи
непригодной в роли идентичности: две связи означали бы две личности.

Поэтому:

| Таблица | Что это |
|---|---|
| `Client` | **Идентичность Maya.** Тонкий якорь: свой `cuid`, арендатор, хеш телефона, необязательная связь с аккаунтом. Профиля и ПД не несёт |
| `CrmClientLink` | **Привязка к карточке провайдера.** `provider` + `externalId` → `clientId` |

`Client` намеренно почти пустой. Имя, визиты, суммы, прайс остаются в CRM —
второй CRM внутри Maya не строим.

---

## 3. Prisma schema

```prisma
/// Идентичность клиента внутри Maya.
///
/// Якорь, который переживает смену телефона, дубли карточек в CRM и смену
/// самой CRM. Профиля не несёт: имя, визиты и суммы остаются во внешней
/// системе. Существует и для человека без аккаунта в Maya — большинство гостей
/// салона именно такие.
model Client {
  id                String     @id @default(cuid())
  tenantId          String
  /// Аккаунт Maya, если человек им обзавёлся. Гость салона живёт без него.
  userId            String?
  /// HMAC от последних десяти цифр номера — того же ключа, по которому сегодня
  /// идёт всё сопоставление (phone.util.ts:77). Сам номер здесь не хранится.
  /// Меняется при смене телефона; идентичность и история остаются прежними.
  phoneHash         String?
  /// Терминальное состояние погашенного дубля. Обратно не переводится —
  /// та же конвенция, что у UserStatus.merged.
  mergedIntoClientId String?
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  tenant            Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user              User?      @relation(fields: [userId], references: [id], onDelete: SetNull)
  mergedInto        Client?    @relation("ClientMerge", fields: [mergedIntoClientId], references: [id], onDelete: SetNull)
  mergedFrom        Client[]   @relation("ClientMerge")
  crmLinks          CrmClientLink[]

  @@unique([id, tenantId])
  @@index([tenantId, phoneHash])
  @@index([tenantId, userId])
}

/// Привязка карточки внешней CRM к идентичности Maya.
///
/// Ключ включает провайдера: без него смена CRM отдала бы историю чужой
/// карточке с совпавшим номером.
model CrmClientLink {
  id             String    @id @default(cuid())
  tenantId       String
  clientId       String
  provider       String
  externalId     String
  /// Когда карточку в последний раз видели живой в CRM.
  syncedAt       DateTime  @default(now())
  /// Карточка исчезла или заархивирована во внешней системе. Строка остаётся:
  /// история Maya не должна пропадать вместе с записью провайдера.
  unlinkedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  tenant         Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  client         Client    @relation(fields: [clientId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@unique([tenantId, provider, externalId])
  @@index([tenantId, clientId])
  @@index([tenantId, provider, syncedAt])
}
```

К `Tenant` и `User` добавляются обратные связи `clients` и `crmClientLinks` —
одна строка на модель, поведения не меняет.

---

## 4. SQL migration

```sql
CREATE TABLE "Client" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "userId"             TEXT,
    "phoneHash"          TEXT,
    "mergedIntoClientId" TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_id_tenantId_key" ON "Client"("id", "tenantId");
CREATE INDEX "Client_tenantId_phoneHash_idx" ON "Client"("tenantId", "phoneHash");
CREATE INDEX "Client_tenantId_userId_idx"    ON "Client"("tenantId", "userId");

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "Client_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "Client_mergedIntoClientId_fkey"
  FOREIGN KEY ("mergedIntoClientId") REFERENCES "Client"("id") ON DELETE SET NULL;

-- Слияние не может указывать на самого себя: это молчаливый цикл, из которого
-- разрешение дубля никогда не выходит.
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_merge_not_self_check"
  CHECK ("mergedIntoClientId" IS NULL OR "mergedIntoClientId" <> "id");

CREATE TABLE "CrmClientLink" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "clientId"   TEXT NOT NULL,
    "provider"   TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "syncedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmClientLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmClientLink_tenantId_provider_externalId_key"
    ON "CrmClientLink"("tenantId", "provider", "externalId");
CREATE INDEX "CrmClientLink_tenantId_clientId_idx"
    ON "CrmClientLink"("tenantId", "clientId");
CREATE INDEX "CrmClientLink_tenantId_provider_syncedAt_idx"
    ON "CrmClientLink"("tenantId", "provider", "syncedAt");

ALTER TABLE "CrmClientLink"
  ADD CONSTRAINT "CrmClientLink_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  -- 🔴 СОСТАВНОЙ ключ, а не одноколоночный: строка связи не может указывать на
  -- клиента другого арендатора. Это то самое правило, которое ввела миграция
  -- 20260717235900_strict_tenant_relations и от которого отошли модели августа.
  ADD CONSTRAINT "CrmClientLink_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE CASCADE;
```

Только создание. Ни одной существующей таблицы миграция не трогает.

---

## 5. Инварианты уникальности

**Асимметрия — главное решение этой схемы.**

| Инвариант | Держит |
|---|---|
| `(tenantId, provider, externalId)` уникален | Одна карточка провайдера принадлежит **не более чем одному** клиенту Maya |
| `clientId` **не** уникален | Один клиент Maya владеет **сколькими угодно** карточками |
| `(clientId, tenantId)` → `Client(id, tenantId)` | Связь не может указывать на клиента другого арендатора |
| `mergedIntoClientId <> id` | Слияние не зацикливается на себе |

Обратный ключ на `clientId` намеренно **не ставится**: дубли карточек в
YClients — задокументированный боевой случай, и адаптер уже сегодня собирает
баланс по всем дублям.

---

## 6. Поведение по сценариям

| Сценарий | Поведение |
|---|---|
| **Дубликат внешнего id** | Нарушение уникальности → конфликт, а не молчаливая перезапись. Повторная привязка той же пары `(provider, externalId)` к другому клиенту требует явного слияния |
| **Один внешний клиент → несколько Maya-клиентов** | **Запрещено.** Иначе непонятно, кому принадлежат визиты и деньги этой карточки. Разрешается только через слияние: одна из личностей становится погашенной |
| **Один Maya-клиент → несколько провайдеров** | **Разрешено.** Несколько строк связи с одним `clientId`. Так же работает и случай нескольких карточек одного провайдера |
| **Переподключение той же CRM** | Та же пара `(provider, externalId)` → **та же строка**: обновляется `syncedAt`, `unlinkedAt` снимается. История не рвётся |
| **Смена CRM** | Строки прежнего провайдера получают `unlinkedAt` и остаются. Новый провайдер заводит свои строки с тем же `clientId`, когда клиент опознан. Личность и история Maya переживают переезд |
| **Удаление/архивация карточки во внешней системе** | `unlinkedAt`, строка **не удаляется**. История Maya не должна исчезать вместе с записью провайдера |
| **Смена телефона** | `Client.phoneHash` обновляется, `Client.id` тот же. Именно ради этого случая идентичность и заводится: сегодня смена номера порождает нового субъекта атрибуции |
| **Слияние дублей** | Погашенный получает `mergedIntoClientId`, его связи переносятся на выжившего. Состояние терминальное, обратного перевода нет |

**Изоляция арендаторов:** `tenantId` — первая колонка каждого ключа и каждого
индекса; составной внешний ключ делает межарендную строку невозможной **на
уровне базы**, а не соглашения. Проверка будет такой же, как для инварианта
аудита в главе 1: попытка вставки клиента чужого арендатора отвергается базой.

---

## 7. Хеш телефона

`phoneHash = HMAC-SHA256(секрет, phoneMatchKey(номер))`, где `phoneMatchKey` —
существующая функция (последние десять цифр). Сам номер в таблицу не попадает.

Ключ **не уникален**: семья на один номер — обычное дело, и склеивать таких
людей нельзя. Это индекс для поиска кандидатов, а не идентичность.

Секрет — уже существующий `AUTH_SESSION_METADATA_SECRET` либо отдельный.
**Требует вашего решения:** отдельный секрет чище, но добавляет обязательную
переменную в production-валидатор.

---

## 8. Засыпка для боевого арендатора

Здесь главное — **честный отрицательный ответ**. Снято прямым запросом к
боевой базе:

| | |
|---|---|
| Пользователей с ролью клиента | **0** |
| `CustomerProfile` | 1 |
| `LoyaltyAccount` | 1 |
| `Appointment` (все с `crmExternalId`) | 18 |

**Засыпать нечего, и внешних идентификаторов клиента в базе Maya нет ни
одного.** `Appointment.crmExternalId` — это id ЗАПИСИ, не клиента.
`LoyaltyAccount.externalReference` — id КАРТЫ лояльности, не клиента.

Поэтому:

- `Client` — можно создать по одной строке на существующего клиента с
  телефоном. Сегодня таких нет; строк будет **ноль**.
- `CrmClientLink` — засыпать **невозможно** и не нужно: таблица наполняется
  лениво, при первом же чтении клиента из CRM.

Обратная сторона: пока связи не наполнены, ни один потребитель на них
опираться не может. Отсюда следующий пункт.

---

## 9. Порядок внедрения и откат

**P2 — только запись.** Таблицы создаются и наполняются, но **ни один
потребитель на них не переключается**. Поиск клиента, лояльность, атрибуция и
«Мои записи» продолжают работать по телефону ровно как сегодня.

Перевод потребителей — отдельный пакет после того, как на боевых данных будет
видно, что связи наполняются верно. Это прямо соответствует правилу цикла:
`existing contract → canonical contract → migrate consumers → remove obsolete`.

**Откат:**

```sql
DROP TABLE "CrmClientLink";
DROP TABLE "Client";
```

Безопасен именно потому, что P2 не имеет читающих потребителей: удаление
таблиц не меняет ни одного пользовательского сценария.

---

## 10. Что этот пакет НЕ делает

- Не трогает `CrmStaffAccess` (провайдер в ключе доступа мастера — отдельный
  вопрос того же пакета, выношу в решение ниже).
- Не добавляет уникальность `Appointment.crmExternalId`.
- Не мигрирует лояльность и не меняет её владельца.
- Не переводит атрибуцию с `subjectRef` на `Client`.
- Не создаёт `Employee`, `Service`, `Location` — их владелец остаётся CRM.

---

## 11. Открытые вопросы к вам

1. **Секрет для `phoneHash`** — переиспользовать существующий или завести
   отдельный (плюс обязательная переменная в production-валидаторе)?
2. **`CrmStaffAccess.provider`** — из плана Phase A он входил в P2. Это
   изменение СУЩЕСТВУЮЩЕЙ таблицы с заменой уникального ключа, то есть иной
   класс риска, чем две новые таблицы. Предлагаю вынести его отдельным
   подпакетом со своим schema gate. Подтвердите или поправьте.
3. **Объём P2** — согласны ли, что P2 ограничивается созданием таблиц и
   наполнением, без перевода потребителей.

---

## Статус

```
SCHEMA PROPOSED
SCHEMA APPLIED: NO
DATABASE CHANGED: NO
APPLICATION CODE CHANGED: NO
```
