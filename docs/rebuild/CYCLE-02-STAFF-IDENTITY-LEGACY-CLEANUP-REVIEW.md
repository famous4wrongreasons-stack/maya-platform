# STAFF IDENTITY — LEGACY CLEANUP REVIEW

> Только обзор. Код, схема и боевая база не изменены. Ничего не удалено.
>
> Состояние на релиз `20260817-c02-staff-identity-b2-cutover`.

---

## Сводка

| Элемент | Удалить сейчас | Почему |
|---|---|---|
| `CrmStaffAccess.externalStaffId` | **НЕТ** | публичный URL, легаси-payload бота, AI-срез, `employee.provider_id` |
| `Appointment.staffExternalId` | **НЕТ** | пишется на каждой брони, уходит на провод, фильтрует внутренний календарь |
| `InternalProvider` | **НЕТ** | три таблицы расписания на составных FK; `/staff`, квоты, брендинг |
| `staff_external_id` в HTTP/аналитике | **НЕТ** | кабинет соединяет по нему зарплату и результативность |
| Прямые чтения внешнего id | **частично** — 3 позиции | см. §5 |

Единственное, что безопасно убрать прямо сейчас, — **устаревшее имя переменной**
и **одна мёртвая выборка**. Обе правки косметические, нулевого риска.

---

## 1. `CrmStaffAccess.externalStaffId`

### Кто ещё читает

| Читатель | Зачем | Природа |
|---|---|---|
| `crm-integration.controller.ts:431, 467` | параметр публичного URL `PATCH team-access/:externalStaffId` и `/claim-owner` | **wire contract** |
| `users.service.ts` (совместимый lookup) | `provider + externalId → StaffProviderLink → StaffId` | **compatibility boundary** |
| `users.service.ts:687, 731, 802, 846` | `external_staff_id` в ответах онбординга, списка команды и `/me` | **wire contract** |
| `users.service.ts` (provisioning) | вход API: владелец присылает состав команды с внешними id | **wire contract** |
| `inbox.service.ts:391` | адресация уведомлений по payload легаси-бота | **wire contract** (чужой) |
| `ai-tool-handler.service.ts` | срез «мои визиты» для мастера в AI-слое | **business logic** |
| `analytics/operations-analytics.service.ts` | `employee.provider_id` в `/analytics/me` | **wire contract** |
| `crm.service.ts` (сверка) | `knownIds` — какие внешние карточки уже известны | **business logic** |

### Участвует ли в решениях о доступе

**Нет.** После B2 — ни одного. Барьерный тест `domain/boundary.spec.ts` запрещает
чтение в `auth/`, `guards/`, `tenancy/`, `appointments/`.

### Что должно произойти до удаления

1. Публичный `PATCH team-access/:externalStaffId` → `:staffId`, согласованно с PWA.
2. Контракт входа онбординга: состав команды приходит с внешними id — их всё
   равно надо принимать, но колонку заменит `StaffProviderLink.externalId`.
3. AI-срез мастера переходит на `StaffId`.
4. `employee.provider_id` в `/analytics/me` → `staff_id`, с фронтом.
5. Легаси-бот перестаёт слать `staff_external_id` в payload inbox.

### Куда

**Глава 5 (`crm.integration`)** — п. 1–3, 5. **Глава 4 (аналитика)** — п. 4.

---

## 2. `Appointment.staffExternalId`

### Кто ещё читает

| Читатель | Зачем | Природа |
|---|---|---|
| `appointments.service.ts:204, 254, 457, 810, 874` | **запись** на каждой брони, переносе и синхронизации | business logic |
| `appointments.service.ts:746` | `dto.staffId ?? appointment.staffExternalId` — мастер по умолчанию при переносе | **business logic** |
| `appointments.service.ts:1260` | поиск мастера в каталоге `/staff` для показа имени | **business logic** |
| `appointments.service.ts:1295` | `staff_external_id` в ответе API | **wire contract** |
| `appointments.service.ts:1321-1323` | объект `staff: { id }` в ответе, когда каталог не нашёл | **wire contract** |
| `appointments.service.ts:633, 983, 1035, 1053` | адресация уведомлений | wire (чужой) |
| `internal-calendar.service.ts:220, 267-268` | фильтр журнала и подстановка мастера | **business logic** |
| `internal-calendar.service.ts:765` | **запись** `staffExternalId = provider.id` | business logic |
| `analytics` | ключ агрегации разреза мастеров | business logic |

### Участвует ли в решениях о доступе

**Нет.** Строка 746 — выбор мастера по умолчанию, а не проверка права: право
проверяет `assertJournalStaffWritable`, уже переведённый на `StaffId`.

### Что должно произойти до удаления

1. Каталог `/staff` начинает отдавать `staff_id`, и поиск на 1260 переходит на него.
2. `staff_external_id` и `staff.id` уходят из ответа API — согласованно с PWA
   (кабинет читает `a.staff_external_id || a.staff.id`, `index.html:11171, 16435, 37302`).
3. Внутренний календарь переходит на `staffId` (см. §3).
4. Аналитика агрегирует по `staffId`.

### Куда

**Глава 4** — п. 1, 2, 4. **Глава 6 (внутренний календарь)** — п. 3.

---

## 3. `InternalProvider`

### Кто ещё читает

| Читатель | Зачем |
|---|---|
| `internal-calendar.service.ts` (7 обращений) | создание, список, доступность, журнал |
| `users.service.ts` | `/me` для внутреннего мастера, обновление |
| `owner-reports.service.ts:242` | получатели брифов среди внутренних мастеров |
| `analytics` | имена мастеров и `employee.provider_id` |
| `branding.service.ts` | аватар мастера |
| `quota.service.ts` | счётчик персонала |

### 🔴 Что держит крепче всего

Три таблицы на **составных внешних ключах** к `InternalProvider(id, tenantId)`:

```
InternalProviderService        @@id([tenantId, providerId, serviceId])
InternalAvailabilityRule       @@unique([tenantId, providerId, weekday, startMinute, endMinute])
InternalAvailabilityException  @@index([tenantId, providerId, startAt, endAt])
```

Это расписание, услуги и отпуска. Их перевод на `staffId` — миграция схемы, а не
правка кода.

### Природа

**Business logic** целиком. Проводного контракта у самой таблицы нет.

### Что должно произойти до удаления

1. Три зависимые таблицы получают `staffId` и переключаются (миграция, фаза
   ADD → BACKFILL → CUTOVER, как в B1/B2).
2. `internal-calendar.service` читает `Staff` вместо `InternalProvider`.
3. `/me`, отчёты, аналитика, брендинг и квоты переходят на `Staff`.
4. **Только потом** таблица снимается.

**Backfill уже сделан:** `Staff.id` для внутренних мастеров равен
`InternalProvider.id` дословно, поэтому перевод зависимых таблиц —
тождественное присваивание. В проде их 0 строк.

### Куда

**Отдельный пакет «Internal calendar → Staff»**, по образцу B1/B2. Не глава — это
своя миграция со своим гейтом.

---

## 4. `staff_external_id` в HTTP и аналитике

### Кто читает — вне репозитория бэкенда

| Место | Что делает |
|---|---|
| `maya-os-site/index.html:12199` | 🔴 соединяет результативность из `/analytics/business` с **зарплатой** из `/analytics/business/finance`, где ключ — `staff_id` **YCLIENTS** |
| `index.html:31151, 31203` | соединяет аналитику со списком `/staff` по `member.id` |
| `index.html:31201` | запасной путь: **показывает внешний id пользователю** («Сотрудник 1461615») |
| `index.html:11171, 16435, 37302` | `a.staff_external_id \|\| a.staff.id` в записях |
| `app.html` | 7 вхождений |

### 🔴 Почему это самый жёсткий узел

Правая половина соединения на 12199 — **чужой id YCLIENTS** из финансового
контура CRM (`CrmRevenueStaffBreakdown.staff_id`, `CrmStaffPayroll.staff_id`).
Его нельзя перевести на идентичность Maya в принципе: это ответ чужой системы.

Значит либо бэкенд начинает сам сшивать зарплату с `staff_id` (перенос
соединения внутрь), либо `staff_external_id` живёт, пока жив внешний финансовый
контур.

### Природа

**Wire contract**, причём двусторонний: и на выход, и как ключ соединения у
клиента.

### Что должно произойти до удаления

1. Бэкенд сшивает `revenue.by_staff` и `payroll.staff` с `staff_id` **на сервере**,
   через `StaffProviderLink`.
2. Кабинет переходит на `staff_id` во всех соединениях.
3. Запасной путь `index.html:31201` перестаёт показывать внешний id человеку.

### Куда

**Глава 4 (аналитика и деньги)**. До этого — не трогать.

---

## 5. Оставшиеся прямые чтения внешнего id мастера

Барьерный тест разрешает ровно четыре файла. Разбор:

| Файл | Что | Оправдано |
|---|---|---|
| `crm/crm.service.ts` | разрешатель связи + сверка команды | **да** — это и есть граница интеграции |
| `crm/crm-integration.controller.ts` | публичный URL | **да** — контракт заморожен вашим решением |
| `users/users.service.ts` | совместимый lookup + вход онбординга + `/me` | **да** |
| `appointments/appointments.service.ts` | адресация уведомлений | **нет по существу** — известный дефект, исключён вами из этапа |

### Безопасно убрать сейчас (косметика, нулевой риск)

1. **`owner-reports.service.ts:122-135`** — переменная называется
   `externalStaffId`, но значение туда приходит уже как `staffId` (я переименовал
   источник в B2, а промежуточное имя осталось). Ложный след для следующего
   читателя. Чистое переименование.
2. **`crm.service.ts` — выборка `externalStaffId` в сверке** используется только
   для `knownIds`; после перехода сверки на связи она осталась как дубль
   источника. Требует проверки, что `knownIds` можно строить из связей.

Обе — **правки читаемости, а не поведения**. Ни одна не удаляет колонку.

---

## Отдельные проверки

### Адресация уведомлений

`inbox.service.ts:320-333` читает из payload ключи `staff_id`,
`staff_external_id`, `new_staff_id`, `old_staff_id`. Payload приходит **извне**,
от легаси-бота, через `POST /api/inbox/internal/ingest`.

**Нельзя переводить раньше, чем сменится контракт бота.** Промах даёт пустой
список получателей, и уведомление уходит владельцам через `fanoutOwners` —
тихо, без ошибки.

### Соединения зарплаты и аналитики на фронте

Разобрано в §4. **Самый жёсткий узел всей уборки.**

### `/staff`

`staff.service.ts:9` → `crmService.getStaff` → `StaffMember.id` — это внешний id
CRM либо `InternalProvider.id`. Ответ уходит **дословно, без DTO**. Кабинет
соединяет по нему аналитику. Удалять нечего, но пока `/staff` отдаёт внешний id,
и §2, и §4 заблокированы.

### `/me`

Отдаёт **оба**: `staff_id` (добавлен в B2, есть у обоих источников) и
`external_staff_id` (только у CRM). Первое поле уже можно потреблять фронтом —
это самый дешёвый шаг миграции.

### Владение бронью

Решения о доступе переведены на `StaffId` (B2). `staffExternalId` остаётся
**значением по умолчанию** при переносе (`:746`) и **ключом каталога** для показа
имени (`:1260`) — ни то, ни другое не является проверкой права.

### Отключение и переподключение CRM

Политика B2: связи отвязываются, гранты гасятся, сессии отзываются, владелец и
администратор защищены. Зафиксировано четырьмя регрессионными тестами.

`externalStaffId` в этом пути **не читается** — отбор идёт по `role` и `userId`.
Удалению колонки политика не мешает.

### Внутренний календарь

Пишет и читает `Appointment.staffExternalId = InternalProvider.id`
(`:220, 267-268, 765`). Свои типы уже канонические (P3), но идентичность ещё
своя. Разблокируется только пакетом «Internal calendar → Staff» (§3).

---

## Порядок, в котором уборка вообще возможна

```
1. Кабинет читает staff_id из /me                     ← можно начинать сегодня
2. /staff отдаёт staff_id рядом с id
3. Аналитика: сшивание зарплаты на сервере            ← разблокирует §4
4. Кабинет переходит на staff_id во всех соединениях
5. Пакет «Internal calendar → Staff»                  ← разблокирует §3
6. Публичный URL team-access → :staffId
7. Контракт легаси-бота для inbox
8. ТОЛЬКО ПОСЛЕ ЭТОГО — снятие колонок
```

Шаги 1–2 аддитивны и ничего не ломают. Шаг 3 — самый ценный: он снимает
зависимость кабинета от чужого id YCLIENTS.

---

```
LEGACY CLEANUP REVIEW COMPLETE
SAFE TO DELETE NOW: ничего из перечисленного. Безопасны только две
  косметические правки читаемости — устаревшее имя переменной в
  owner-reports.service.ts:122-135 и дублирующая выборка в сверке команды.
DEFERRED: CrmStaffAccess.externalStaffId (глава 5), Appointment.staffExternalId
  (глава 4), InternalProvider (отдельный пакет «Internal calendar → Staff»),
  staff_external_id в HTTP и аналитике (глава 4), адресация inbox (контракт
  легаси-бота), публичный URL team-access (согласованно с PWA).
WAITING FOR APPROVAL
```
