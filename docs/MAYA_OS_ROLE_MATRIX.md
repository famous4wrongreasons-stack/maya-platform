# MAYA OS Role Matrix

Рабочий контракт ролей и поверхностей MAYA OS. Этот файл описывает целевое
поведение, а backend-контракт находится в `ai администратор/maya_roles.py`.

## Roles

| Role | Who | Core Access |
|---|---|---|
| `client` | Клиент салона | Запись, услуги, цены, мастера, свои записи, лояльность, сертификаты, абонементы |
| `master` | Мастер | Свои записи, свои клиенты, свои чаевые, личная статистика, team-chat |
| `manager` | Администратор / управляющий | Операционная панель, расписание, отзывы, маркетинг, аналитика без owner-only прав |
| `owner` | Владелец в панели | Полная операционная панель, роли, PII-export, зарплаты, маркетинг, staff, AI-директор |
| `founder` | Основатель в AI/tool-loop | Owner-level tools + расширенный тематический допуск в мозге MAYA |

В панели `founder` отображается как `owner`. В AI-мозге `founder` остаётся
отдельной ролью, чтобы отличать основателя от обычного владельца.

## Surfaces

| Surface | Purpose | Rule |
|---|---|---|
| `client` | Клиентский кабинет и клиентский чат | Даже owner/master получает клиентскую MAYA без аналитики и зарплат |
| `staff` | Рабочий чат и staff-home | Клиентские booking/sales tools отключены, доступ по роли |
| `owner` | Owner Command Center | Только owner/founder; прибыль, зарплаты, задачи, риски, решения |
| `admin` | Admin/manager tools | Управление сменами, отзывами, маркетингом без PII/export и roles |
| `master` | Кабинет мастера | Только свои записи/клиенты/статистика |
| `team` | Team chat | Рабочая коммуникация, без клиентского booking-flow |
| `voice` | Voice MAYA | Должна наследовать surface: client voice != staff voice |

## Hard Rules

- Роль всегда определяется сервером по `chat_id/session`, никогда не принимается
  от модели или фронта как источник истины.
- Surface приходит от приложения, но staff-surface активируется только если
  серверная роль реально staff (`master`, `manager`, `owner`, `founder`).
- Client surface всегда сильнее личности: владелец в клиентском кабинете получает
  клиентскую MAYA.
- Staff surface всегда отключает клиентские инструменты записи/продаж.
- PII клиентов и экспорт телефонов доступны только owner/founder.
- Money/destructive actions должны идти через HITL-подтверждение владельца.

## Current Backend Contract

- `ai администратор/maya_roles.py` — роли, поверхности, права панели.
- `identity_utils.py` — нормализация Telegram identity + re-export role helpers.
- `webhook_server.py::_panel_resolve_role()` — применяет panel permissions.
- `claude_ai.py` — tool RBAC, client/staff surface gates.
- `realtime_bridge.py` — voice staff-mode gate по той же матрице.

## Next Implementation Slices

1. Расширить tests на все surfaces: PWA chat, voice, Telegram, team-chat, panel.
2. Сделать `/api/panel/me` диагностичным: отдавать role, permissions, allowed_surfaces.
3. Разделить AI brain profiles: client, master, admin, owner/director.
4. Owner Command Center: единый экран задач, рисков, денег, загрузки и действий.
5. Automation layer: reactivation, empty windows, upsell, reminders, plan/fact alerts.
6. CRM abstraction: YClients сейчас, future CRM через provider-layer и stable reports.

