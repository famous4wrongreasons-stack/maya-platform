# CYCLE 03 B3.3 — SCHEMA GATE

> Предложение. **Prisma, схема и боевая база не менялись. Доменных событий не
> создано.** Легаси-обработчик работает, потребителей с побочными действиями нет.

---

## 1. Каноническое присутствие: тип уже есть, менять его не нужно

Глава 2 завела словарь (`domain/visit-attendance.ts`):

```ts
type VisitAttendance = 'awaiting' | 'arrived' | 'no_show' | 'confirmed_by_client';
```

Коды провайдера отображаются полно и без потерь (`crm-attendance.ts`):

| Код | Канон Maya | Что можно утверждать |
|---|---|---|
| `1` | `arrived` | клиент пришёл |
| `-1` | `no_show` | клиент не пришёл |
| `0` | `awaiting` | ждём клиента |
| `2` | `confirmed_by_client` | клиент подтвердил |

**Новый тип не вводится.** В зеркало добавляется колонка того же канона.

---

## 2. 🔴 «Неизвестно» — это НЕ `awaiting`

Два разных состояния сегодня неразличимы:

| Состояние | Смысл |
|---|---|
| `awaiting` | провайдер **сказал**: отметки ещё нет |
| неизвестно | Maya **не спрашивала** или провайдер поля не прислал |

Первое — факт, второе — отсутствие факта. Смешав их, мы утверждали бы знание,
которого нет.

**Решение:** `Appointment.attendance` — **nullable**, и `NULL` означает
«не наблюдалось». Пятое значение в канон не добавляется: канон ездит на провод и
имеет обратное отображение в коды, а у «неизвестно» кода нет.

### Дефект, который это вскрывает

```ts
attendanceFromCode(code) {
  if (typeof code !== 'number') return 'awaiting';   // ← «не сказал» = «ждём»
  return CODE_TO_ATTENDANCE.get(code) ?? 'awaiting'; // ← неизвестный код = «ждём»
}
```

Функция превращает молчание провайдера в утверждение. Для presentation это
терпимо, для зеркала — нет. Писатель зеркала обязан различать «поля не было» и
«поле равно 0»; кодек при этом не трогаем, чтобы не менять уже выпущенный провод.

---

## 3. 🔴 Сегодня зеркалу нечего писать

`CrmJournalAppointment` — канонический элемент журнала, из которого наполняется
зеркало, — **не содержит присутствия вовсе**:

```
id · client · provider · branch · service_ids · services
start_at · end_at · status · notes · total_price · currency
```

Присутствие есть только в карточке одного визита (`CrmAppointmentDetail`), а
сырой записи провайдера — в поле `attendance`, которое маппер сворачивает в
`status`.

**Значит гейт включает не только колонку, но и расширение канонического
контракта журнала** — иначе колонка останется пустой навсегда.

| Изменение | Где |
|---|---|
| `attendance?: VisitAttendance \| null` | `CrmJournalAppointment` |
| заполнение из `record.attendance` с различением «поля нет» | адаптер YCLIENTS |
| запись в зеркало | `AppointmentMirrorService` |

---

## 4. Наполнение существующих 1940 визитов

**История присутствия не реконструируется.** Разрешено сохранить только текущее
наблюдаемое значение.

| Шаг | Что делает |
|---|---|
| миграция | `attendance = NULL` у всех 1940 строк |
| первый проход сверки после миграции | читает текущее значение у провайдера и записывает |

Почему не заполняем в самой миграции: значение берётся у провайдера, а миграция
к сети не ходит и ходить не должна — это правило держится с главы 2.

### Почему наполнение не создаёт исторических событий

🔴 **Переход из `NULL` событием не является.** Первое наблюдение — не изменение:
мы не видели «было так, стало иначе», мы впервые посмотрели.

```
NULL      → arrived   ⇒ событий нет (первое наблюдение)
awaiting  → arrived   ⇒ appointment.attendance_changed
arrived   → no_show   ⇒ appointment.attendance_changed
```

Тот же принцип, что уже доказан в B3.2: наполнение зеркала дало 1922 строки и
**ноль** событий.

---

## 5. Контракты событий

Версия контракта — **1** для всех, номер живёт в колонке `version`, не в имени.

| Тип | Полезная нагрузка | Когда |
|---|---|---|
| `appointment.created` | `{ start_at, end_at, staff_external_id, service_ids }` | записи не было в зеркале, базовая линия установлена |
| `appointment.rescheduled` | `{ from: {start_at,end_at}, to: {start_at,end_at} }` | изменилось время |
| `appointment.staff_changed` | `{ from_staff_external_id, to_staff_external_id }` | изменился мастер |
| `appointment.services_changed` | `{ from: string[], to: string[] }` | изменился состав |
| `appointment.attendance_changed` | `{ from: VisitAttendance, to: VisitAttendance }` | изменилось присутствие, **и `from` не NULL** |
| `appointment.removed` | `{ previous_status }` | статус стал `canceled` |

**Переименование:** `appointment.cancelled` → `appointment.removed`;
`appointment.attendance_recorded` → `appointment.attendance_changed`.
Цена нулевая: в проде событий этих типов ноль, единственная строка —
`attendance_recorded` от пробы B2, и она остаётся как исторический след.

Ни имени, ни телефона в нагрузке нет: идентичности Maya у потребителя уже есть.

---

## 6. Входы компаратора

```
ПРЕЖНЕЕ (зеркало)              ТЕКУЩЕЕ (истина у источника)
  staffExternalId                staff_external_id
  staffId                        разрешённый Staff.id
  startAt, endAt                 start_at, end_at
  serviceIds (сортированные)     service_ids (сортированные)
  status                         status
  attendance                     attendance
  mayaClientId                   разрешённый Client.id
```

**Не входит:** сырое тело, `notes`, `providerPayload`, `totalPriceKopecks`,
`ingestionMethod`, `updatedAt`, время чтения.

Цена входит в зеркало, но не в сравнение: закрытие кассы не является изменением
визита. Деньги — предмет главы 4.

---

## 7. Детерминированный порядок переходов

Фиксированный порядок проверок, одинаковый в обоих путях:

```
1. removed              (если стал canceled — остальное не проверяем)
2. rescheduled
3. staff_changed
4. services_changed
5. attendance_changed
```

`removed` поглощает прочие: у снятой записи «перенос» смысла не имеет.
Остальные независимы и дают отдельные события с общим `occurredAt` и
возрастающим `entitySequence` в указанном порядке.

Порядок — часть контракта, а не деталь: он гарантирует, что вебхук и сверка,
увидев одно и то же, выпустят **одинаковую последовательность**.

---

## 8. Атомарность

```
BEGIN
  UPDATE "Appointment" SET ...        -- новое состояние зеркала
  INSERT INTO "DomainEvent" ...       -- все переходы разом
  INSERT INTO "ReconciliationRun" ... -- только для сверки
COMMIT
```

Разрыв между обновлением зеркала и записью событий недопустим в обе стороны:
обновить зеркало без события — потерять переход навсегда; записать событие без
зеркала — выпустить его повторно на следующем проходе.

Дедупликация остаётся вторым рубежом: `@@unique([tenantId, dedupFingerprint])`.

---

## 9. Состояние сверки — новая модель

`CrmIntegration.lastSyncAt` — одна метка без окна, полноты, счётчиков и ошибок
(на проде `2026-08-15`, пишется не сверкой). Недостаточно.

```prisma
model ReconciliationRun {
  id           String   @id @default(cuid())
  tenantId     String
  provider     String

  windowFrom   DateTime
  windowTo     DateTime
  startedAt    DateTime @default(now())
  finishedAt   DateTime?

  /// 'complete' | 'truncated' — контракт B3.0. Только complete двигает базовую
  /// линию и даёт право на выводы об отсутствии.
  completeness String?
  truncationReason String?

  fetched      Int      @default(0)
  created      Int      @default(0)
  updated      Int      @default(0)
  unchanged    Int      @default(0)
  eventsEmitted Int     @default(0)

  failureCode  String?
  failureMessage String?

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, startedAt])
  @@index([tenantId, completeness, finishedAt])
}
```

Курсор отдельной колонкой не вводится: окно сверки вычисляется от «сейчас»
(±7 дней), а последняя **полная** сверка находится запросом по этой же таблице.
Лишнее состояние, которое можно вывести, — лишний источник расхождения.

---

## 10. Встраивание полноты B3.0

| Исход прохода | `completeness` | Что разрешено |
|---|---|---|
| все окна полны | `complete` | события, в том числе `removed`; базовая линия двигается |
| хоть одно усечено | `truncated` | события об изменениях **да**, `removed` по отсутствию — **нет** |
| ошибка провайдера | строка не завершается, `failureCode` заполнен | ничего |

🔴 `removed` выпускается **только** по доказанному признаку `deleted` у самой
записи, а не по её отсутствию в выборке. Отсутствие в неполной выборке не
означает ничего.

---

## 11. Ограничения арендатора и индексы

| Что | Как |
|---|---|
| `ReconciliationRun.tenantId` | обязателен, каскад от арендатора |
| `Appointment.attendance` | колонка значения, связей не добавляет |
| индексы | `[tenantId, startedAt]`, `[tenantId, completeness, finishedAt]` |

Существующие индексы зеркала уже покрывают выборку по
`(tenantId, crmProvider, crmExternalId)` — уникальность из B1.

---

## 12. Миграция

```sql
-- 1. Присутствие в зеркале. NULL = не наблюдалось; это НЕ `awaiting`.
ALTER TABLE "Appointment" ADD COLUMN "attendance" TEXT;

-- 2. Состояние прогонов сверки.
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "completeness" TEXT,
    "truncationReason" TEXT,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "eventsEmitted" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationRun_tenantId_startedAt_idx"
  ON "ReconciliationRun"("tenantId", "startedAt");
CREATE INDEX "ReconciliationRun_tenantId_completeness_finishedAt_idx"
  ON "ReconciliationRun"("tenantId", "completeness", "finishedAt");

ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Значение присутствия допустимо только каноническое либо неизвестное.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_attendance_check"
  CHECK ("attendance" IS NULL OR "attendance" IN
    ('awaiting','arrived','no_show','confirmed_by_client'));
```

**Разрушающих операций нет:** ни `DROP`, ни `SET NOT NULL`, ни одного оператора
над существующими данными. Наполнение присутствия делает не миграция, а первый
проход сверки (§4).

---

## 13. Откат

| Объект | Откат | Безопасность |
|---|---|---|
| `Appointment.attendance` | `DROP COLUMN` | колонка nullable, потребителей до включения компаратора нет |
| `ReconciliationRun` | `DROP TABLE` | таблица новая |
| `Appointment_attendance_check` | `DROP CONSTRAINT` | данные не меняются |
| переименование типов событий | обратное переименование в коде | в проде событий этих типов **ноль** |

Точки невозврата в самой миграции нет: она только добавляет. Первая необратимая
вещь появится позже — при первом выпущенном событии перехода.

---

## 14. Безопасность боевой миграции

Порядок тот же, что доказан в B1 и B3.1:

```
1. чистая база из миграций
2. клон боевой базы НА САМОМ VPS (персональные данные его не покидают)
3. 1940 визитов целы, attendance = NULL у всех
4. CHECK отвергает мусорное значение
5. межарендаторная вставка ReconciliationRun отвергается внешним ключом
6. дрейф после миграции — ноль
7. строгий preflight
8. клон удаляется
```

---

## 15. Что гейт НЕ предлагает

- Не добавляет `unknown` в канон присутствия — «неизвестно» это `NULL` в зеркале.
- Не трогает кодек `attendanceFromCode` и провод: выпущенный PWA не ломаем.
- Не вводит курсор сверки отдельной колонкой.
- Не включает планировщик.
- Не включает потребителей событий.
- Не реконструирует историю присутствия.
- Не начинает главу 4.

---

```
B3.3 SCHEMA GATE READY
DATABASE CHANGED: NO
DOMAIN EVENTS CREATED: NO
WAITING FOR SCHEMA APPROVAL
```
