# IDENTITY SCHEMA GATE — ANALYSIS

> Только анализ. Prisma, схема, база и код приложения НЕ изменены.
> Цель главы 2: внутренняя идентичность Maya не смешивается с внешней
> идентичностью провайдера.

---

## 1. Текущая модель `CrmStaffAccess`

```prisma
model CrmStaffAccess {
  id                   String               @id @default(cuid())
  tenantId             String
  externalStaffId      String               // ← id мастера в чужой системе
  userId               String?
  encryptedDisplayName String
  title                String?
  role                 UserRole             // ← РОЛЬ ДОСТУПА
  status               CrmStaffAccessStatus // pending_contact | active | disabled
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt
  tenant               Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user                 User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([tenantId, externalStaffId])   // ← идентичность = внешний id
  @@unique([tenantId, userId])
  @@index([tenantId, role, status])
  @@index([userId])
}
```

Модель совмещает **три разные вещи**: идентичность мастера, связь с провайдером
и грант доступа (роль + статус). Колонки `provider` **нет вообще**.

## 2. Текущая модель `Appointment.staffExternalId`

```prisma
model Appointment {
  id              String  @id @default(cuid())
  tenantId        String
  crmExternalId   String?                      // id ЗАПИСИ у провайдера
  source          String  @default("external") // internal | external
  staffExternalId String                       // ← id МАСТЕРА, обязательный
  ...
  @@index([tenantId, staffExternalId, startAt])
}
```

Ни внешнего ключа, ни ограничения, ни квалификатора провайдера. Тип — голая
строка.

### Полный перечень колонок внешней идентичности в схеме

| Модель | Колонка | Что означает | Строк в проде |
|---|---|---|---|
| `CrmStaffAccess` | `externalStaffId` | мастер | 6 |
| `Appointment` | `staffExternalId` | мастер | 18 |
| `Appointment` | `crmExternalId` | запись | 18 из 18 |
| `RecoveryConversion` | `crmExternalId` | запись | 0 |
| `BusinessReview` | `staffExternalId` | мастер | 0 |

---

## 3. Места записи и чтения

### `CrmStaffAccess.externalStaffId`

| Где | Что |
|---|---|
| `users.service.ts:675-685` | **создание** строки доступа: `tx.crmStaffAccess.create({ externalStaffId, userId, role, status })` |
| `users.service.ts:514, 535-543` | дедупликация состава команды по `externalStaffId`, запрет повторного назначения |
| `users.service.ts:616` | привязка владельца: `externalStaffId: ownerExternalStaffId` |
| `users.service.ts:687, 731` | **выход в HTTP**: `external_staff_id` |
| `users.service.ts:988-997` | **отзыв сессий** при смене роли/контакта |
| `users.service.ts:1002-1004` | поиск строки в снимке по `external_staff_id` |
| `crm.service.ts:1145-1155` | **`journalStaffBinding`** — актор → внешний id мастера |
| `crm.service.ts:1873-1935` | **`reconcileCrmTeamAccess`** — сверка с составом команды провайдера |
| `crm.service.ts:1960` | `externalStaffId: String(member.id)` — id из ответа провайдера |
| `crm-integration.controller.ts:421` | **публичный URL** `@Patch('team-access/:externalStaffId')` |
| `crm-integration.controller.ts:457` | `.../claim-owner` |
| `inbox.service.ts:386-397` | **адресация уведомлений**: `crmStaffAccess.findMany({ externalStaffId: { in: staffIds } })`, где `staffIds` собраны из нетипизированного payload |
| `owner-reports.service.ts:240-256` | **одна `Map<userId, string>` на два пространства** (проверено лично, см. ниже) |
| `owner-reports.service.ts:186-200` | матч получателя против `overview.staff[].staff_external_id` |

#### Проверенный пример смешения в одной переменной

```ts
const recipients = new Map<string, string>();
for (const link of crmLinks)      recipients.set(link.userId, link.externalStaffId); // ← внешний id
for (const link of internalLinks) if (!recipients.has(link.userId))
                                  recipients.set(link.userId, link.id);             // ← внутренний cuid
```

Значение одной переменной приходит из двух несовместимых пространств. Дальше
`:189` ищет `overview.staff.find(row => row.staff_external_id === externalStaffId)`,
и промах даёт не ошибку, а `staff?.total ?? 0` — **мастер получает утренний
бриф с нулями вместо отказа**. Тихий отказ, который выглядит как «сегодня пусто».

### `Appointment.staffExternalId`

| Где | Что |
|---|---|
| `appointments.service.ts:204` | запись при клиентской брони: `staffExternalId: dto.staffId` |
| `appointments.service.ts` (пути переноса/админской записи) | то же значение из запроса |
| `internal-calendar.service.ts:762` | **чтение фильтром**: `staffExternalId: provider.id` — здесь это **внутренний cuid** |
| `crm.service.ts` | сравнение с `journalStaffBinding` в стражах доступа |
| индекс `[tenantId, staffExternalId, startAt]` | горячий путь сетки расписания |

**Дискриминатора нет.** Поле `source` рядом существует, но идентичность мастера
им квалифицируется **только внутри самого внутреннего календаря**
(`internal-calendar.service.ts:217, 764`). Все остальные потребители фильтруют
по голому `staffExternalId` без `source`: `operations-analytics.service.ts:2133`,
`appointments.service.ts:204, 254, 874`, `business-content.service.ts:245`.

### Строку доступа никто никогда не удаляет

Во всём `src` нет ни `crmStaffAccess.delete`, ни `deleteMany`, ни `upsert`.
Уход сотрудника выражается как `status: 'disabled'` (`crm.service.ts:1909`).
По смыслу это `unlinkedAt` из `CrmClientLink` — но смешанное с правом входа в
одной колонке.

---

## 4. Внутренняя идентичность мастера против CRM-идентичности

```prisma
model InternalProvider {
  id          String  @id @default(cuid())
  tenantId    String
  userId      String?
  branchId    String?
  displayName String
  ...
  @@unique([id, tenantId])      // ← tenant-safe составной
  @@unique([tenantId, userId])
}
```

| | Внутренний мастер | Мастер CRM |
|---|---|---|
| Где рождается | внутри Maya (`ensureProviderForUser`) | в чужой системе |
| Идентификатор | cuid, стабилен навсегда | число провайдера, чужое |
| Может исчезнуть | нет | **да**, вместе с карточкой |
| Связь с `User` | `@@unique([tenantId, userId])` | `CrmStaffAccess.userId` |
| Ссылочная целостность | составные FK | **никакой** |

**Оба пишутся в одну колонку `Appointment.staffExternalId`.** Способа по
значению понять, из какого пространства оно взято, **не существует**: cuid и
семизначное число различимы по форме, но код нигде этого не проверяет, а третий
провайдер вполне может выдавать cuid-подобные строки.

---

## 5. Как сейчас определяется провайдер

```prisma
model CrmIntegration {
  tenantId String @unique   // ← ОДНА интеграция на арендатора
  provider String
  ...
}
```

- `crm-adapter.factory.ts` — по строке `provider` выбирает адаптер; YCLIENTS и
  ALTEGIO обслуживает один и тот же класс, различие только в `baseUrl`.
- `CrmService.getAdapterForTenant` читает `CrmIntegration` арендатора.
- `Tenant.calendarSource` (`internal | external`) решает, идти ли в CRM вообще.

### 🔴 Отключение интеграции не трогает идентичность

```ts
async disconnectIntegration(tenantId: string) {
  const existing = await this.getStoredIntegration(scopedTenantId);
  await this.prisma.crmIntegration.delete({ where: { tenantId: scopedTenantId } });
  ...
}
```

Удаляется **только** `CrmIntegration`. Строки `CrmStaffAccess` остаются — со
старыми внешними id, с прежними ролями, с живыми сессиями пользователей.

---

## 6. Влияние на аутентификацию, авторизацию и отзыв сессий

### 6.1 Страж «свой визит / чужой визит» ключуется на внешнем id

```ts
private async journalStaffBinding(tenantId, actor): Promise<string | null> {
  if (JOURNAL_FULL_ACCESS_ROLES.has(actor.role)) return null;
  const access = await this.prisma.crmStaffAccess.findFirst({
    where: { tenantId, userId: actor.userId },
    select: { externalStaffId: true, status: true },
  });
  if (!access || access.status !== 'active') throw this.journalRecordForbidden();
  return access.externalStaffId;
}
```

Возвращённое значение сравнивается с мастером визита. Это BOLA-страж: без него
мастер, подставив чужой id, читал бы карточку любого визита салона вместе с ПД
клиента и мог бы его отменить.

### 6.2 Выдача роли и создание учётной записи

`users.service.ts:675-685` — учётка и роль создаются под ключом
`externalStaffId`. То есть **право входа выдаётся на идентификатор из чужой
системы**.

### 6.3 Отзыв сессий

```ts
if (userId && (contactChanged || (priorRole && priorRole !== role))) {
  await tx.authSession.updateMany({
    where: { tenantId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: 'crm_staff_role_changed' },
  });
}
```

Отзыв запускается изменением строки, найденной по внешнему id.

### 6.4 🔴 Точная формулировка дыры

`reconcileCrmTeamAccess` сверяет состав команды **строковым равенством, без
квалификатора провайдера**:

```ts
const teamById = new Map(team.map((m) => [String(m.id), m]));
const present = activeIds.has(access.externalStaffId);
const nextStatus = present ? (access.userId ? 'active' : 'pending_contact') : 'disabled';
```

| Сценарий | Что произойдёт | Направление отказа |
|---|---|---|
| Смена провайдера, id **не совпали** | все строки → `disabled`, членства приостановлены, мастера теряют доступ | **fail-closed**, безопасно |
| Смена провайдера, id **совпал численно** | строка считается живой; **чужой человек сохраняет роль и активную сессию**, а `journalStaffBinding` отдаст его id — доступ к визитам другого мастера | **fail-open**, опасно |

Семизначные числовые id — не редкость у отраслевых CRM. Совпадение не
экзотика, а вопрос удачи.

### 6.5 🔴 Смешение УЖЕ даёт неверное поведение (проверено дословно)

`publishNewAppointmentInbox` вызывается **только** при внутреннем календаре:

```ts
if (calendarSource === CalendarSource.INTERNAL) {
  void this.publishNewAppointmentInbox({ ..., staffExternalId: dto.staffId, ... });
}
```
`appointments.service.ts:250-253`

а внутри ищет получателя в таблице ВНЕШНИХ идентификаторов:

```ts
const staffLink = await this.prisma.crmStaffAccess.findFirst({
  where: { tenantId, externalStaffId: String(input.staffExternalId),
           userId: { not: null }, status: 'active' },
});
```
`appointments.service.ts:1032-1039`

При внутреннем календаре `dto.staffId` — это cuid `InternalProvider`.
**Совпадения не может быть по построению.** `staffUserIds` остаётся пустым, и
карточка уходит только владельцам через `fanoutOwners`.

**Мастер внутреннего календаря не получает уведомление о собственной новой
записи.** То же у отмены и переноса (`publishAppointmentLifecycleInbox`,
вызовы на `:616` и `:862`). Дальше тот же cuid едет в payload как `staff_id`
(`:1053`) и вторично не находится в `inbox.service.ts:388`.

Это не гипотеза о будущем вреде, а уже написанный тихий отказ. В проде он не
проявляется только потому, что `InternalProvider` пуст.

### 6.6 Забор «бизнес-аккаунт» не видит внутреннего мастера

```ts
if (businessIdentity &&
    (this.isBusinessRole(businessIdentity.membershipRole as UserRole) ||
     businessIdentity.crmStaffAccess !== null)) {
  throw new ConflictException('social_business_access_suspended');
}
```
`social-auth.service.ts:554-558`

Проверка на `InternalProvider` отсутствует: `grep -c internalProvider` по
`social-auth.service.ts` и `auth-session.service.ts` даёт **0**. Мастер салона
на внутреннем календаре, не имеющий строки `CrmStaffAccess`, этим забором не
удерживается.

### 6.7 Асимметрия в `/me`

| Источник | Что в `staff_profile` |
|---|---|
| CRM | `{ linked, source: 'crm', title, external_staff_id }` (`users.service.ts:1466-1470`) |
| Внутренний | `{ linked, source: 'internal', title }` — **идентификатора нет вовсе** (`:1496-1502`) |

Кабинет отбирает «свои визиты» по `external_staff_id`. У внутреннего мастера
этого поля нет, то есть для него та же функция недоступна.

---

## 7. Боевые значения (без ПД)

Имена не запрашивались; `encryptedDisplayName` не читался.

| Что | Значение |
|---|---|
| `CrmStaffAccess` | **6 строк**, все `externalStaffId` — числовые, длина 7 |
| — с аккаунтом | **1** (`tenant_admin`, `active`) |
| — без аккаунта | 5 (`pending_contact`) |
| `Appointment` | 18, все `source='external'` |
| — различных мастеров | **4**, все числовые длины 7 |
| — мастеров БЕЗ строки доступа | **2** |
| `InternalProvider` | **0** |
| `RecoveryConversion` / `BusinessReview` | 0 / 0 |
| `CrmIntegration` | 1 — `yclients`, `active` |
| Арендаторы | 2, оба `calendarSource=external` |
| `User` / `Membership` / активных сессий | 2 / 1 / 4 |

### Два вывода, которые меняют оценку

**Смешение пространств сегодня ЛАТЕНТНО.** `InternalProvider` пуст, все визиты
внешние. Ни одной строки с внутренним cuid в `staffExternalId` не существует.
Дефект схемы реален, но данных, требующих разбора, нет.

**Backfill упирается ровно в один случай:** 2 из 4 мастеров, ведущих визиты, не
имеют строки в `CrmStaffAccess`. Для них идентичность придётся создать из
состава команды провайдера, а не перенести из существующей строки.

---

## 8. Целевая модель идентичности

```
Maya Staff (внутренний id)
   ├── связь с User  (кто входит в систему)
   ├── грант доступа (роль, статус)
   └── StaffProviderLink (provider, externalId)  ← много во времени, одна активная
Appointment.staffId → Staff(id, tenantId)        ← составной FK
```

Правило: **ни одно решение о доступе не читает внешний id.** Внешний id
участвует только в сопоставлении при синхронизации с провайдером.

---

## 9. Нужна ли отдельная Maya `Staff` — и ответ на архитектурный вопрос

**Да, паттерн тот же, что у `Client`: `Maya Identity → Provider Link`. Но
работа другая по природе.**

Для клиента в P2 внутренней идентичности **не существовало** — её пришлось
завести. Для мастера она существует **дважды**:

| Сущность | Что в ней от идентичности мастера |
|---|---|
| `InternalProvider` | cuid, `userId`, имя, филиал, составные FK — полноценная внутренняя идентичность, но только для внутреннего календаря |
| `CrmStaffAccess` | внешний id как идентичность + роль + статус + `userId` |

Поэтому для Staff корректная работа — **объединение**, а не добавление. Завести
третью сущность рядом с этими двумя означало бы построить ровно ту параллельную
модель, которую вы запретили в P3.

### Где Staff действительно отличается от Client

| | Client | Staff |
|---|---|---|
| Участвует в решении о доступе | **нет** | **да** — роль, сессии, BOLA-страж |
| Внутренняя идентичность до этой работы | отсутствовала | **есть, но две** |
| Слияние дублей | нужно (семья на один номер) | не нужно, команда мала и администрируется |
| `phoneHash` как индекс кандидатов | нужен | не нужен: сопоставление идёт по составу команды |
| Одновременных провайдеров | несколько допустимо | один: `CrmIntegration.tenantId @unique` |

**Вывод:** паттерн тот же, поля другие. Доказанной причины использовать иную
модель нет — есть доказанная причина не плодить третью сущность.

---

## 10. Нужна ли таблица связей с провайдером

**Да, и это главный недостающий элемент.** `CrmClientLink` имеет
`@@unique([tenantId, provider, externalId])`; у мастера аналога нет вообще —
`CrmStaffAccess` квалифицирует внешний id только арендатором.

Таблица связей нужна ещё и потому, что она умеет то, чего нынешняя модель не
умеет: **пережить смену провайдера**. `unlinkedAt` сохраняет историю, как это
уже сделано для клиентов.

---

## 11. Предлагаемая схема Prisma

> Ничего не применено. Это предмет отдельного одобрения.

```prisma
/// Мастер салона глазами Maya. Идентичность НЕ зависит от того, есть ли у
/// человека аккаунт и подключена ли вообще CRM.
model Staff {
  id          String   @id @default(cuid())
  tenantId    String
  /// Аккаунт Maya, если человек им обзавёлся. У мастера без входа его нет.
  userId      String?
  branchId    String?
  displayName String
  title       String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant   Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user     User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
  branch   Branch? @relation(fields: [branchId, tenantId], references: [id, tenantId], onDelete: Restrict)
  links    StaffProviderLink[]

  @@unique([id, tenantId])       // цель составных FK
  @@unique([tenantId, userId])   // один аккаунт — один мастер
  @@index([tenantId, active])
}

/// Связь мастера Maya с его карточкой у провайдера.
/// Зеркало CrmClientLink — тот же паттерн, те же инварианты.
model StaffProviderLink {
  id         String    @id @default(cuid())
  tenantId   String
  staffId    String
  provider   String    // ← которого сегодня нет в CrmStaffAccess
  externalId String
  syncedAt   DateTime  @default(now())
  /// Карточка исчезла у провайдера. Строка ОСТАЁТСЯ: история Maya не должна
  /// пропадать вместе с записью чужой системы.
  unlinkedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  /// 🔴 Составной ключ: связь не может указывать на мастера другого арендатора.
  staff  Staff  @relation(fields: [staffId, tenantId], references: [id, tenantId], onDelete: Cascade)

  @@unique([tenantId, provider, externalId])
  @@index([tenantId, staffId])
  @@index([tenantId, provider, syncedAt])
}
```

### Что становится с существующими моделями

```prisma
model CrmStaffAccess {
  // externalStaffId УХОДИТ из роли идентичности
  staffId String   // ← новый ключ
  role    UserRole
  status  CrmStaffAccessStatus
  ...
  staff   Staff @relation(fields: [staffId, tenantId], references: [id, tenantId], onDelete: Cascade)
  @@unique([tenantId, staffId])
}

model Appointment {
  staffId String   // ← вместо staffExternalId
  ...
  staff   Staff @relation(fields: [staffId, tenantId], references: [id, tenantId], onDelete: Restrict)
  @@index([tenantId, staffId, startAt])
}
```

`InternalProvider` **поглощается** `Staff`: расписание, услуги и исключения
переезжают на `staffId`. Это и есть объединение двух идентичностей в одну.

### Открытый вопрос, который я НЕ решаю сам

`@Patch('team-access/:externalStaffId')` — публичный URL. Его смена требует
согласованной правки PWA. Варианты: оставить внешний id в пути и разрешать его
внутрь через `StaffProviderLink`, либо перейти на `staffId` вместе с фронтом.
**Решение за вами.**

---

## 12. Миграция и перенос данных

Пять шагов, каждый обратимый:

| Шаг | Что | Риск |
|---|---|---|
| 1 | Создать `Staff` и `StaffProviderLink`, ничего не заполняя | нулевой |
| 2 | Backfill: строка `Staff` на каждый `CrmStaffAccess` (6) и на каждого мастера визитов без строки доступа (**2**); `StaffProviderLink` с `provider` из `CrmIntegration` (`yclients`); `InternalProvider` → `Staff` (0 строк) | низкий |
| 3 | Добавить `Appointment.staffId` **nullable**, заполнить по связи, проверить полноту | низкий |
| 4 | Двойная запись: код пишет обе колонки, читает новую | средний — требует выката |
| 5 | Сделать `staffId` обязательным, снять старые колонки | средний |

**Опора на факт:** переносить нужно 6 + 2 = **8 идентичностей** и 18 визитов.
Внутренних мастеров нет вовсе.

Шаг 2 нельзя выполнить вслепую: для 2 мастеров без строки доступа имя придётся
взять из состава команды провайдера, а если провайдер недоступен — создать
`Staff` с техническим именем и пометкой, а не выдумывать.

---

## 13. Инварианты изоляции арендатора

1. Все FK — **составные** `(id, tenantId)`, по правилу миграции
   `20260717235900_strict_tenant_relations`. Одноколоночный FK позволил бы
   связать мастера с чужим арендатором — ровно та дыра, которую я допустил в
   собственном предложении P2 и исправлял.
2. `@@unique([tenantId, provider, externalId])` — внешний id уникален **внутри
   арендатора и провайдера**, а не глобально. Числовой id мастера у двух салонов
   совпадёт неизбежно.
3. `@@unique([tenantId, userId])` на `Staff` — один аккаунт не может быть двумя
   мастерами одного салона.
4. `assertTenantId` остаётся обязательным на всех путях чтения: схема защищает
   от порчи данных, но не заменяет проверку владения.

---

## 14. Переподключение и смена CRM

| Событие | Сегодня | В целевой модели |
|---|---|---|
| Переподключение того же провайдера | строки доступа уцелели, id совпадают — работает | связи находятся по `(provider, externalId)`, `syncedAt` обновляется |
| Смена провайдера, id не совпали | всё → `disabled`, мастера теряют доступ | старые связи → `unlinkedAt`; `Staff`, роли и история **сохраняются**; новые связи заводятся сопоставлением по имени с подтверждением владельца |
| Смена провайдера, **id совпал** | 🔴 **чужой человек наследует роль и сессию** | невозможно: связь квалифицирована `provider`, и старая уже отвязана |
| Переход на внутренний календарь | `staffExternalId` начинает хранить cuid в той же колонке | `staffId` не меняется вовсе — идентичность не зависела от CRM |

Последняя строка — главный приз: **при отключении CRM идентичность мастера
перестаёт зависеть от неё вообще.**

---

## 15. Откат

| Шаг | Откат |
|---|---|
| 1 | `DROP TABLE` двух пустых таблиц |
| 2 | `DELETE` из них; исходные таблицы не тронуты |
| 3 | `Appointment.staffId` nullable — снять колонку |
| 4 | Вернуть релиз: старые колонки заполнены двойной записью и актуальны |
| 5 | 🔴 **Точка невозврата.** До снятия старых колонок откат — это откат релиза; после — восстановление из дампа |

Практическое правило: шаг 5 выполняется отдельным выкатом, не раньше чем через
неделю после шага 4, и до него снимается дамп.

---

## 16. Производственный риск

| Фактор | Оценка |
|---|---|
| Объём данных | **8 идентичностей, 18 визитов, 2 арендатора** — минимальный |
| Внутренних мастеров | 0 — самая опасная половина смешения пуста |
| Уже написанные тихие отказы | §6.5, §6.6, §6.7 — сработают, как только появится первый внутренний мастер |
| Активных сессий | 4; шаг 4 их не трогает |
| Что ломается при ошибке | вход мастера в кабинет и BOLA-страж журнала |
| Обратимость до шага 5 | полная |
| Окно | выполнимо целиком, salon-hours риск низкий из-за объёма |

**Главный риск не технический, а в сопоставлении:** для 2 мастеров без строки
доступа связь придётся установить решением человека, а не запросом.

---

## Ответ на архитектурный вопрос

> Должны ли `Client` и `Staff` следовать одному паттерну
> `Maya Identity → Provider Link`, или для Staff есть доказанная причина
> использовать другую модель?

**Один и тот же паттерн. Доказанной причины для другой модели нет.**

Отличия Staff от Client реальны — участие в авторизации, отсутствие слияния
дублей, один провайдер одновременно — но все они влияют на **поля и на
строгость**, а не на форму. Форма одна: внутренняя идентичность, живущая
независимо от провайдера, плюс таблица связей, квалифицированная провайдером.

Единственное содержательное отличие в **объёме работы**: для клиента P2
добавлял недостающую идентичность, для мастера предстоит **объединить две
существующие** — `InternalProvider` и `CrmStaffAccess`. Пропустить это
объединение и просто добавить третью сущность значило бы построить параллельную
модель.

И одно следствие, которого у Client не было: поскольку Staff участвует в выдаче
роли и отзыве сессий, инварианты здесь должны быть **строже**, а не мягче —
включая явный запрет читать внешний id в любом решении о доступе.

---

```
ANALYSIS COMPLETE
PRISMA SCHEMA CHANGED: NO
DATABASE CHANGED: NO
APPLICATION CODE CHANGED: NO
MIGRATION CREATED: NO
WAITING FOR APPROVAL
```
