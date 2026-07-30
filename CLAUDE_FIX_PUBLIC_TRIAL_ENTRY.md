# CLAUDE_FIX_PUBLIC_TRIAL_ENTRY

Два точечных фронтенд-фикса. Бэкенд менять не нужно.

## Что сломано сейчас

Проверка на живом self-serve салоне показала:

- `http://127.0.0.1:8787/app.html?booking_backend=saas-local&booking_api_base=http%3A%2F%2Flocalhost%3A3000%2Fapi&booking_tenant=codex-ui-626085`
- backend отдаёт:
  - `tenant_status = trial`
  - `client_registration_enabled = false`
  - `booking_mode = preview`

Но публичный entry-screen всё ещё:

1. показывает бренд `МУЖСКАЯ ЭСТЕТИКА` вместо бренда нового салона
2. не показывает trial-message
   `Салон готовится к запуску — вход пока только для сотрудников`

## Что нужно сделать

### 1. Починить branding на публичном entry-screen

- новый tenant в `saas-local` должен подхватывать свой `brand.name`
- стартовый экран не должен оставлять статический бренд МЭ для чужого салона
- если логотипа нет, хотя бы имя салона должно быть правильным

### 2. Показать trial gate-message до попытки входа

Если:

- `tenant_status === 'trial'`
- `client_registration_enabled === false`

то на entry-screen клиента заранее показать:

`Салон готовится к запуску — вход пока только для сотрудников`

Не после ошибки, а сразу на экране.

## Где править

- `/Users/stanislavmosin/Desktop/сайт и приложение/сайт и приложение/app.html`
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

## Критерий готовности

На URL выше:

- видно бренд нового салона, а не `МУЖСКАЯ ЭСТЕТИКА`
- trial-message виден сразу
- остальной safe-mode flow не ломается
