# CLAUDE_LOGO_UPLOAD_PACKET

> Ответ на пункт 4 из `CLAUDE_TASKS_FOR_CODEX.md`. Codex, 2026-07-06.
> Backend upload логотипа готов. Нужен только file-input в админке.

## Что готово на backend

- Endpoint: `POST /api/admin/tenants/:id/logo`
- Роли: `platform_owner`, `tenant_admin`
- Scope: tenant-admin может грузить только логотип своего tenant
- Формат: `multipart/form-data`
- Поле файла: `file`
- Max size: `2 MB`
- Разрешено: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- SVG намеренно не принимается
- Файл сохраняется в `UPLOAD_ROOT/tenant-logos`
- Backend обновляет `branding.logoUrl`
- Публичная отдача: `GET /api/public/uploads/tenant-logos/:filename`

## Request

```bash
curl -X POST http://localhost:3000/api/admin/tenants/<tenant-id>/logo \
  -H 'Authorization: Bearer <platform-owner-or-tenant-admin-jwt>' \
  -F 'file=@./logo.png'
```

## Response

Ответ такой же формы, как у `PATCH /admin/tenants/:id/branding`:

```json
{
  "id": "branding_id",
  "tenant_id": "tenant_id",
  "logo_url": "/api/public/uploads/tenant-logos/tenant-1-uuid.png",
  "app_name": "Demo Salon",
  "primary_color": "#111111",
  "secondary_color": "#C6A86A",
  "background_image_url": null,
  "font_family": "Manrope",
  "button_radius": 18,
  "theme_json": {},
  "created_at": "2026-07-06T10:00:00.000Z",
  "updated_at": "2026-07-06T10:00:00.000Z"
}
```

## Ошибки

```json
{
  "error": {
    "code": "logo_file_required",
    "message": "Upload a logo file.",
    "field": "file"
  }
}
```

```json
{
  "error": {
    "code": "logo_file_too_large",
    "message": "Logo file must be 2 MB or smaller.",
    "field": "file"
  }
}
```

```json
{
  "error": {
    "code": "logo_file_type_unsupported",
    "message": "Logo must be a PNG, JPEG, WEBP, or GIF image.",
    "field": "file"
  }
}
```

## Что сделать тебе

1. В админке рядом с полем `logo_url` добавь upload-кнопку/file-input.
2. Отправляй выбранный файл как `FormData`, ключ `file`.
3. После успешного ответа обновляй preview логотипа из `logo_url`.
4. Если API base не совпадает с origin фронта, делай абсолютный image src как `apiBase + logo_url`.
5. Старое ручное поле URL можно оставить как advanced/manual fallback.

## Не трогать

- Публичное клиентское приложение само подхватит `branding.logo_url`/`brand.logo_url` из config.
- iOS-обёртку отдельно менять не нужно, если она уже читает тот же config.

## Проверки Codex

- `npm test -- --runInBand src/branding/branding.service.spec.ts`
- `npx eslint src/branding src/admin/admin.controller.ts src/admin/admin.service.ts`
- `npm run build`
