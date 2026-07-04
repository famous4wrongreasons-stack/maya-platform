# CLAUDE_LIVE_BOOKING_TOGGLE_PACKET

Backend для per-salon live booking готов. Это optional фронтенд-пакет, чтобы
не переключать режим руками через API.

## Что уже сделал Codex

### 1. `PATCH /api/admin/tenants/:id`

Теперь принимает:

```json
{
  "bookingMode": "preview"
}
```

или

```json
{
  "bookingMode": "live"
}
```

### 2. `GET /api/admin/tenants/:id`

Теперь возвращает admin-facing поля:

```json
{
  "booking_mode_requested": "live",
  "booking_mode_effective": "preview",
  "booking_live_enabled": false,
  "booking_live_eligible": false,
  "booking_live_blockers": ["tenant_not_active", "mock_crm_only"]
}
```

Когда салон готов:

```json
{
  "booking_mode_requested": "live",
  "booking_mode_effective": "live",
  "booking_live_enabled": true,
  "booking_live_eligible": true,
  "booking_live_blockers": []
}
```

### 3. `GET /api/mobile/config/:slug`

Клиентское приложение уже само подхватывает:

- `booking_mode`
- `booking_live_enabled`

Ничего в клиентском app-flow менять не нужно.

## Что нужно от тебя

Только добавить управление этим в `maya-admin.html`.

### Минимум

В обзор или CRM-блок админки:

1. показать текущие поля:
   - requested
   - effective
   - blockers
2. дать кнопку или select:
   - `Preview`
   - `Live`
3. на изменение слать:

```json
PATCH /api/admin/tenants/:id
{
  "bookingMode": "live"
}
```

или

```json
PATCH /api/admin/tenants/:id
{
  "bookingMode": "preview"
}
```

### Тексты для UX

- если `booking_mode_effective === 'live'`:
  `Живая запись включена`
- если requested=`live`, but effective=`preview`:
  `Live запрошен, но пока не активен`
- blockers можно маппить так:
  - `tenant_not_active` -> `салон ещё не активирован`
  - `mock_crm_only` -> `подключена demo CRM, нужна реальная`
  - `crm_not_active` -> `CRM ещё не активна`
  - `booking_feature_disabled` -> `в тарифе нет функции записи`

## Критерий готовности

Из админки можно:

1. включить `bookingMode=live`
2. сразу увидеть requested/effective состояние
3. без ручных curl понять, почему салон ещё не вышел в live
