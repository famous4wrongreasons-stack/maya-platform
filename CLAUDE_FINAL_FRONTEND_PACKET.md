# CLAUDE_FINAL_FRONTEND_PACKET

> Финальный пакет от Codex для следующего фронтенд-прохода.
> Дата: 2026-07-04.
> Бэкенд: готов и проверен локально на свежем процессе.

## 1. Что Codex уже закрыл на backend

- `POST /api/onboarding/trial` теперь существует.
  Он создаёт self-serve `trial`-салон без platform-owner логина:
  tenant + default branch + mock CRM + owner `tenant_admin` + JWT.
- `GET /api/mobile/config/:tenantSlug` теперь явно возвращает:
  - `tenant_status`
  - `allow_self_registration`
  - `client_registration_enabled`
  - `booking_mode`
  - `booking_live_enabled`
- Safe/live логика больше не должна угадываться фронтом.
- Старые backend-контракты уже на месте и живые:
  - `POST /api/appointments/preview`
  - `POST /api/appointments`
  - `GET /api/appointments/my`
  - `POST /api/appointments/:id/cancel`
  - `POST /api/appointments/:id/reschedule`
  - `GET /api/available-days`
  - `POST /api/auth/phone/start`
  - `POST /api/auth/phone/verify`

## 2. Что тебе сделать на фронте

### A. Витрина -> self-serve owner onboarding

Сейчас `maya-site.html` всё ещё ведёт на `/maya-admin.html`.
Это временно. Следующий ход:

1. Сделай отдельный публичный owner-flow "Попробовать бесплатно".
2. На submit зови `POST /api/onboarding/trial`.
3. После успеха:
   - либо авто-логинь владельца по `access_token`,
   - либо покажи `temporary_password` один раз и переведи в owner/admin flow.
4. Не требуй real CRM на этом шаге. Backend сам ставит `mock`.

### B. Переключи booking flow по `booking_mode`

В `app.html` / iOS-зеркале safe local flow сейчас всегда уходит в
`POST /appointments/preview`.

Нужная логика теперь такая:

- `booking_mode === 'preview'` -> остаёмся на текущем preview UX.
- `booking_mode === 'live'` -> тот же flow должен отправлять
  `POST /appointments` и показывать уже боевой success-state.

Важно:

- `trial`-салон после `onboarding/trial` сейчас получает
  `tenant_status = "trial"` и `booking_mode = "preview"`.
- Это ожидаемо. Не пытайся насильно делать live-create в trial.

### C. Используй новые поля конфига в UI

Подключи на фронте:

- `tenant_status`
- `client_registration_enabled`
- `booking_mode`
- `booking_live_enabled`

Минимально:

- если `client_registration_enabled === false`, оставляй текущий человеческий
  блок для trial-клиента
- если `booking_mode === 'preview'`, честно говори, что это preview, а не
  созданная запись
- если `booking_mode === 'live'`, success-copy уже должен быть "Запись создана"

## 3. Контракты

### 3.1 `POST /api/onboarding/trial`

Request:

```json
{
  "name": "Barbershop Griva",
  "slug": "griva",
  "ownerEmail": "owner@griva.ru",
  "ownerName": "Илья",
  "ownerPhone": "+79990000000",
  "password": "optional-password",
  "branchName": "Main Branch",
  "branchAddress": "Moscow, Tverskaya 1",
  "branchPhone": "+79990000000",
  "branchTimezone": "Europe/Moscow",
  "planId": "optional-plan-id"
}
```

Success:

```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "user-id",
    "tenant_id": "tenant-id",
    "email": "owner@griva.ru",
    "role": "tenant_admin"
  },
  "tenant": {
    "id": "tenant-id",
    "name": "Barbershop Griva",
    "slug": "griva",
    "status": "trial",
    "allow_self_registration": true
  },
  "temporary_password": "one-time-password-or-null",
  "booking_mode": "preview",
  "next_step": "open_admin"
}
```

### 3.2 `GET /api/mobile/config/:tenantSlug`

Смотри и используй:

```json
{
  "slug": "demo-salon",
  "active": true,
  "tenant_status": "active",
  "allow_self_registration": true,
  "client_registration_enabled": true,
  "booking_mode": "preview",
  "booking_live_enabled": false
}
```

## 4. Что уже проверено Codex

- unit tests: зелёные
- lint: зелёный
- build: зелёный
- live smoke:
  - `POST /api/onboarding/trial` сработал
  - новый salon отдал `tenant_status = trial`
  - новый salon отдал `booking_mode = preview`
  - `GET /api/mobile/config/demo-salon` отдал новые поля

## 5. Чего НЕ надо делать

- не строй второй backend
- не обходи `booking_mode` фронтовым хардкодом
- не требуй real SMS или real CRM на первом self-serve шаге
- не включай live booking для `trial` салона вручную на фронте
