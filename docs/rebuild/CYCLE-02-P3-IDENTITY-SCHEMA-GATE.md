# CYCLE 02 P3 — SCHEMA GATE: провайдерская идентичность в модели данных

> Правило владельца: «если P3 потребует новую Prisma migration или изменение
> production data model — STOP и отдельный schema gate».
>
> Гейт сработал. Ниже — то, что **НЕ сделано** в P3 и ждёт отдельного решения.
> Миграции не написаны, схема не изменена, боевая база не тронута.

---

## Почему это вообще всплыло

Разведка P3 искала связность по импорту типов и нашла 10 файлов. Критик полноты
показал, что метод был дырявым: контракт пересекает границу **вторым путём,
невидимым для grep** — модуль внедряет `CrmService` и получает типы по выводу,
без единого импорта. Таких модулей ещё 14.

Именно на этом пути и нашлась самая дорогая утечка идентичности.

---

## G1. Внешний id мастера — это идентичность авторизации

```prisma
model CrmStaffAccess {
  tenantId        String
  externalStaffId String     // ← id из YCLIENTS
  userId          String?
  role            UserRole
  status          CrmStaffAccessStatus

  @@unique([tenantId, externalStaffId])
}
```

`externalStaffId` — не справочное поле, а **ключ выдачи доступа**:

| Что делает | Где |
|---|---|
| Дедупликация состава команды | `users.service.ts:514, 535-543` |
| Создание учётки и выдача роли | `users.service.ts:675-685` |
| **Отзыв сессий** при смене роли | `users.service.ts:988-997`, `revokeReason: 'crm_staff_role_changed'` |
| Публичный URL | `crm-integration.controller.ts:421` `@Patch('team-access/:externalStaffId')` |

### Одна колонка — два пространства идентификаторов

`Appointment.staffExternalId` хранит id YCLIENTS при внешнем календаре и
**собственный cuid** `InternalProvider.id` при внутреннем
(`internal-calendar.service.ts:762`). Дискриминатора нет.

**Цена ошибки здесь выше, чем где-либо ещё в P3: ломается не отчёт, а вход в
систему.** При смене провайдера или переходе на внутренний календарь совпадение
ключей — вопрос удачи.

---

## G2. Внешний id как долгоживущий ключ денежной атрибуции

```prisma
crmExternalId String?
@@index([tenantId, crmExternalId])
```

`recovery.service.ts:301-312` соединяет подтверждённую выручку с конверсиями
именно по нему, а `:344` кодирует его отсутствие причиной
`attributed_bookings_have_no_external_crm_record_id`.

## G3. `BusinessReview.staffExternalId` — идентичность без единой связи с CRM

`prisma/schema.prisma:589`. В модуле `src/business-content` **нет ни одного
импорта из `src/crm`**: провайдерская идентичность живёт там сама по себе.

---

## Почему это нельзя было починить внутри P3

Любое исправление означает ввод собственного идентификатора мастера и перевод
на него внешних ключей — то есть новую миграцию Prisma и перенос боевых данных
(6 строк `CrmStaffAccess`, 18 записей `Appointment`). Это ровно тот случай,
который правило владельца велит вынести в отдельный гейт.

---

## Что предлагается вынести в P4/P5 (решение за владельцем)

1. Собственный `StaffIdentity` внутри Maya, а `externalStaffId` — только
   ссылкой вида `(provider, externalId)`, как уже сделано для клиентов в P2
   (`CrmClientLink`).
2. Дискриминатор источника у `Appointment.staffExternalId` либо разделение
   колонок.
3. URL-путь `team-access/:externalStaffId` — публичный контракт; его смена
   требует согласованной правки фронта.

---

```
SCHEMA MIGRATION REQUIRED: YES — и поэтому НЕ выполнена
PRODUCTION DATA MODEL CHANGED: NO
PRISMA SCHEMA CHANGED: NO
WAITING FOR SEPARATE SCHEMA GATE APPROVAL
```
