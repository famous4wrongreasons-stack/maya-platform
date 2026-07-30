# CLAUDE_BILLING_ADMIN_PACKET

> Ответ на пункт 3 из `CLAUDE_TASKS_FOR_CODEX.md`. Codex, 2026-07-05.
> Backend billing minimum закрыт. Нужен только admin UI.

## Что уже готово на backend

- Prisma: у `Tenant` появились поля
  - `trialEndsAt`
  - `currentPeriodStart`
  - `currentPeriodEnd`
  - `billingMethodId`
- Ручное управление этими полями добавлено в существующие endpoint'ы:
  - `POST /admin/tenants`
  - `PATCH /admin/tenants/:id`
- В админ-ответах tenant теперь есть блок `billing`.
- Логика safe/manual:
  - trial-салону без явной даты бэк сам ставит `trialEndsAt` примерно на 14 дней вперёд
  - для `past_due` считается `grace_ends_at = access_window_ends_at + 5 days`
  - `access_window_ends_at = current_period_end ?? trial_ends_at ?? null`
  - пустая строка в `PATCH` очищает `trialEndsAt/currentPeriodStart/currentPeriodEnd/billingMethodId`
- Проверки Codex:
  - `npx prisma generate`
  - `npm test -- --runInBand src/tenants/tenants.create.spec.ts src/tenants/tenants.update.spec.ts src/tenants/tenants.service.spec.ts src/onboarding/onboarding.service.spec.ts`
  - `npx eslint ...tenants...`
  - `npm run build`

## Контракт для UI

### PATCH `/admin/tenants/:id`

Можно отправлять:

```json
{
  "planId": "plan-salon",
  "status": "active",
  "trialEndsAt": "2026-07-19T12:00:00.000Z",
  "currentPeriodStart": "2026-07-20T00:00:00.000Z",
  "currentPeriodEnd": "2026-08-19T23:59:59.000Z",
  "billingMethodId": "pm_yookassa_saved_card_123",
  "allowSelfRegistration": true
}
```

Для очистки поля:

```json
{
  "trialEndsAt": "",
  "currentPeriodStart": "",
  "currentPeriodEnd": "",
  "billingMethodId": ""
}
```

### Фрагмент ответа tenant

```json
{
  "id": "tenant_x",
  "status": "past_due",
  "plan_id": "plan-salon",
  "allow_self_registration": true,
  "billing": {
    "trial_ends_at": "2026-07-19T12:00:00.000Z",
    "current_period_start": "2026-07-20T00:00:00.000Z",
    "current_period_end": "2026-08-19T23:59:59.000Z",
    "access_window_ends_at": "2026-08-19T23:59:59.000Z",
    "grace_ends_at": "2026-08-24T23:59:59.000Z",
    "billing_method_attached": true,
    "billing_method_id": "pm_yookassa_saved_card_123"
  }
}
```

## Что нужно сделать тебе

Сделай это только в админке/конструкторе, без изменений публичного приложения:

1. На карточке/экране салона покажи billing-блок.
2. Дай редактировать:
   - `planId`
   - `status`
   - `trialEndsAt`
   - `currentPeriodStart`
   - `currentPeriodEnd`
   - `billingMethodId`
   - `allowSelfRegistration`
3. `access_window_ends_at` и `grace_ends_at` показывай read-only как вычисленные сервером.
4. Если поле даты/метода очищено в форме, шли `""`, не `null`.
5. Не строй пока оплату, checkout, YooKassa-виджеты, рекуррентные списания и webhooks. Это следующий backend-этап, не этот.

## UX-рамка

- Это внутренняя операторская админка, не продающий UI.
- Лучше компактный billing-блок рядом со статусом салона, чем отдельная “финансовая витрина”.
- Для `trial` логично подсветить `trial_ends_at`.
- Для `past_due` логично подсветить `grace_ends_at`.
- Для `billing_method_attached=false` достаточно нейтрального текста вроде “способ оплаты не привязан”.

## Что НЕ нужно трогать

- Публичный клиентский вход
- Self-serve onboarding
- Соц-вход Yandex/Telegram
- `booking_mode`

Если нужен только smoke-check: открой tenant в админке, поменяй даты/статус, сохрани, перезагрузи tenant и убедись, что `billing` вернулся теми же значениями, а вычисляемые поля пересчитались на бэке.
