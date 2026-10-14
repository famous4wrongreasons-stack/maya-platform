# Companion: вход к расписанию — 2026-10-14

Проверенный product candidate: `a6e49b9b2420363e37b5ca8cb940b79c8c6f6b9f`.
Ветка: `codex/maya-local-crm-setup-20261010`.
Предшественник: `2df5b4330d00768422125dd75df0207fd29d3e6a`.

## Реализовано

Кнопка календаря справа в шапке отправляет видимый вопрос
«Покажи расписание на сегодня» через существующий `ConversationPort.submitUserTurn`.
Доступна из чата и рабочих разделов; после принятия запроса возвращает к чату.
Дата, часовой пояс, источник, права и выдача виджета остаются на сервере.
Frontend не передаёт capability, Client, tenant, дату, разрешения или route key.
Это запрос в разговоре; кнопка названа «Спросить Maya о расписании на сегодня»,
а не обещает немедленно открыть самостоятельный календарь.

Запрос не использует и не очищает черновик — даже если текст черновика совпадает
с вопросом. Повторное нажатие во время отправки заблокировано; runtime сохраняет
собственный независимый single-flight guard. Отказы и повтор той же операции
идут через обычную логику разговора с тем же requestId. Нового writer нет.

Открытие подробностей происходит только явным нажатием канонического NAVIGATE
в серверной карточке: PROGRESS → проверенный detail → fullscreen. Кнопка шапки
сама не создаёт envelope, не выбирает старый виджет и не обходит проверку прав.
Подмена principal в ответе отклоняется без detail/timeline pollution.
Escape возвращает фокус к настоящему opener. Приватность доступна в меню.
Shortcut выключен при privacy/photo/fullscreen ownership, активном voice flow
или незавершённой отправке. При потере сессии данные и кнопка удаляются вместе
с signed-in carrier.

## Источники и сопоставление с макетом

| Решение | Основание | Граница |
| --- | --- | --- |
| Круглая кнопка календаря справа, 44×44 | Owner `screens/13-schedule.png`, существующая шапка | CSS-иконка без новой asset/network authority |
| Видимый вопрос в чате | Существующий conversation single writer | Не прямой вызов инструмента и не локальная дата |
| Карточка журнала и подробности | `operations.journal.read@1`, `navigate.journal.detail@1`, NS-1 | Права/tenant/principal/source reread остаются server-owned |
| Отсутствие локального `setSheet(schedule)` | Shell DetailOpener + NAVIGATE binding | Не создаём фиктивный календарь из prototype demo |
| Приватность в существующем drawer | Действующий `shell.privacy` | Доступ и erase/confirmation semantics сохранены |

Canonical references: backend `widgets/projection/rows/initial-projector.rows.ts`,
`widgets/widgets.controller.ts`, `widgets/routing/effect-router.service.ts`;
runtime `shell/conversation.ts`, `shell/shell.ts`, `shell/intents.ts`.
`operations.journal_day` определён в conversation taxonomy. Новых endpoints,
platform/Client полномочий или widget gates не добавлено.

## Свежие результаты

13 команд: `2026-10-14T07:32:39Z` → `2026-10-14T07:36:24Z`.
Чистый committed candidate оставался неизменным. [Архив](evidence/maya-companion-schedule-20261014/README.md).

| Проверка | Результат |
| --- | --- |
| Полный runtime | 828 PASS / 7 SKIP / 0 FAIL |
| Полный carrier | 194 PASS / 0 FAIL |
| Browser: chat / navigation / voice / schedule | 35 / 207 / 56 / 35 PASS, всего 333 |
| NS-1 parent → detail → parent | 16 PASS |
| Packaging tests | 18 PASS |
| Runtime/carrier ratchets, reproducibility | PASS |
| PWA/Capacitor | PASS, 8 файлов, только разрешённая endpoint/CSP substitution |
| Отдельный current-backend source proof | 2 PASS, новая synthetic PG, loopback-only |

Серверная проверка подтверждает текущий journal → fs.calendar → runtime/React
и существующий personal create/reschedule/cancel на внутреннем тестовом календаре.
Её schema replay выполнен только на новой искусственной БД, кластер остановлен.
Она не проверяет реальную модель, YCLIENTS или салон владельца.

UI browser использует искусственный ответ из renderer corpus. Это не current
journal emission. Реальный server source проверяется отдельно; результаты
не объединяются в ложное утверждение о едином browser → real LLM → salon E2E.
Снимки проверены при 320/393/427/1280 px. Исходная карточка/detail renderer не
перерисованы, canonical controls и focus/return сохранены.

## Что ещё не закрыто

- Прямое открытие календаря из шапки одним действием. Сейчас entry — вопрос в AChat.
- Полный нижний лист расписания из owner mockup, свободные окна и booking shortcuts.
  Нельзя вывести доступность слота из пустоты журнала: нужен canonical availability.
- Current source probe использует пустой день и sealed prose; populated journal
  и новое entry с настоящей моделью не проверялись.
- Полная повторная release certification текущего дизайна, CI/mutation corpus,
  реальная запись/перенос/отмена и принятие владельцем не выполнялись.

Работа затрагивает три presentation source файла и четыре browser/unit test файла.
Backend/runtime/schema/Client Identity/Action Engine/AR-1/profile/HANDOFF не изменены.
Документация — последующий отдельный commit, без изменения tested product bytes.
Production, сохранённая база салона, Keychain, grants, платные вызовы, SMS/OTP,
YCLIENTS, push/merge/deploy, установка iPhone и C10 не затронуты.
