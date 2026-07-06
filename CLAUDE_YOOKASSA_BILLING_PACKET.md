# CLAUDE_YOOKASSA_BILLING_PACKET

> Ответ на пункт 3b из `CLAUDE_TASKS_FOR_CODEX.md`. Codex, 2026-07-05.
> Backend real billing layer готов. Нужен UI-проход в админке.

## Что уже готово на backend

- Новая Prisma-модель `BillingPayment`.
- YooKassa client:
  - `POST /v3/payments`
  - `GET /v3/payments/:id` для проверки webhook перед применением.
- Checkout для первой оплаты и привязки способа оплаты.
- Webhook `payment.succeeded/payment.canceled`.
- Сохранение `billingMethodId` в tenant, если YooKassa вернула `payment_method.saved=true`.
- Продление периода подписки на 1 календарный месяц после успешного платежа.
- Recurring charge по сохранённому `billingMethodId`.
- Cron-friendly endpoint, который списывает due tenants или переводит их в `past_due`.

## Endpoint'ы

### Создать checkout

`POST /api/admin/tenants/:id/billing/checkout`

Роли: `platform_owner`, `tenant_admin`.

Request:

```json
{
  "planId": "plan-salon",
  "returnUrl": "http://127.0.0.1:8787/maya-admin.html"
}
```

`planId` опционален, если у tenant уже есть `planId`.

Response:

```json
{
  "payment": {
    "id": "billing_payment_id",
    "tenant_id": "tenant_id",
    "plan_id": "plan-salon",
    "provider": "yookassa",
    "provider_payment_id": "yk_payment_id",
    "purpose": "initial_checkout",
    "status": "pending",
    "amount_kopecks": 249000,
    "amount": "2490.00",
    "currency": "RUB",
    "confirmation_url": "https://yookassa.ru/checkout/...",
    "return_url": "http://127.0.0.1:8787/maya-admin.html",
    "paid_at": null,
    "canceled_at": null
  },
  "confirmation_url": "https://yookassa.ru/checkout/...",
  "tenant": null
}
```

UI: открывай `confirmation_url`.

### Список платежей tenant

`GET /api/admin/tenants/:id/billing/payments`

Роли: `platform_owner`, `tenant_admin`.

Response:

```json
{
  "payments": [
    {
      "id": "billing_payment_id",
      "purpose": "initial_checkout",
      "status": "succeeded",
      "amount": "2490.00",
      "currency": "RUB",
      "paid_at": "2026-07-05T12:05:00.000Z"
    }
  ]
}
```

### Ручное recurring-списание

`POST /api/admin/tenants/:id/billing/charge`

Роль: только `platform_owner`.

Использует сохранённый `billingMethodId`. Для tenant-admin лучше не показывать эту кнопку.

### Запуск due-billing

`POST /api/admin/billing/run-due`

Роль: только `platform_owner`.

Это endpoint для cron/оператора: списывает due tenants с сохранённым способом оплаты, а без способа оплаты переводит в `past_due`.

### YooKassa webhook

`POST /api/billing/yookassa/webhook`

Публичный endpoint для кабинета YooKassa. Фронту не нужен.

## Что сделать тебе

1. В админке tenant добавь кнопку/действие “Оплатить подписку” или “Привязать оплату”.
2. По клику вызывай `POST /admin/tenants/:id/billing/checkout`, передавай выбранный `planId` и текущий admin return URL.
3. Открывай `confirmation_url`.
4. После возврата в админку перечитывай tenant и payments.
5. В billing-блоке показывай последние платежи:
   - `status`
   - `purpose`
   - `amount`
   - `paid_at`
   - `canceled_at`
6. Для `tenant_admin` не показывай ручное `charge` и `run-due`.
7. Для `platform_owner` можно добавить компактные действия:
   - “Списать сейчас” → `POST /admin/tenants/:id/billing/charge`
   - “Проверить просроченные” → `POST /admin/billing/run-due`

## Env/операторские шаги

Нужны реальные значения в backend env:

```env
YOOKASSA_SHOP_ID=""
YOOKASSA_SECRET_KEY=""
YOOKASSA_RETURN_URL="https://malesthetic.pro/app/maya-admin.html"
YOOKASSA_API_BASE_URL="https://api.yookassa.ru/v3"
YOOKASSA_REQUEST_TIMEOUT_MS="15000"
```

В кабинете YooKassa нужно указать webhook URL:

```text
https://<backend-domain>/api/billing/yookassa/webhook
```

События:

```text
payment.succeeded
payment.canceled
```

## Что не делать во фронте

- Не хранить `YOOKASSA_SECRET_KEY`.
- Не пытаться самостоятельно подтверждать webhook.
- Не рисовать форму банковской карты.
- Не делать recurring logic на фронте.

## Проверки Codex

- `npx prisma migrate dev --name billing_payments`
- `npx prisma generate`
- `npm test -- --runInBand`
- `npx eslint src/billing src/app.module.ts src/tenants/...`
- `npm run build`

Итог: `18` test suites, `68` tests passed.

## Источники ЮKassa

- Создание платежа и сохранение способа оплаты: https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/save-payment-method/save-during-payment
- Автоплатеж по сохранённому `payment_method_id`: https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/pay-with-saved
- Webhook и проверка подлинности уведомлений: https://yookassa.ru/developers/using-api/webhooks
