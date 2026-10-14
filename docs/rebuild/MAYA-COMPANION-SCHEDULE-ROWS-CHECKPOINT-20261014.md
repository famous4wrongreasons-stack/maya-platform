# Companion — дневное расписание: локальный checkpoint, 2026-10-14

Candidate: `8d54c4c5f7a76735143e71eab6e8711fd4f68153`. Branch: `codex/maya-local-crm-setup-20261010`.
Исходный checkpoint: `81c72be5f9b2a3e50582189eb380d0e40a783c0d`.
Это продолжение локальной разработки после C9. Не C10, не production и не release certification.

## Что изменено

- React SCHEDULE в теме Companion: белая поверхность, строки с разделителями,
  группировка по серверным мастерам, сохранённые заголовки, статусы и действия.
  Стиль применяется только к structured SCHEDULE; prose/frozen и Aurora сохраняют
  прежнее представление. Нет проверки роли или вывода полномочий в интерфейсе.
- `presentJournalSchedule` формирует subtitle из уже авторизованных даты, локального
  времени начала/конца и timezone. Экран только копирует запечатанную строку.
  Cell сохраняет fact_ref, as_of и evidence refs. Статус остаётся отдельной Cell.
  Нет пересчёта времени по часовому поясу устройства, расчёта длительности,
  присутствия клиента или свободных окон.
- Настоящий заполненный journal выявил ошибку runtime: standalone detail рисовался
  дополнительно к entry refs, а в деталях parent-return опережал REFINE/CONTROL.
  Оба случая нарушали sealed reading order, и срабатывал prose fallback.
  Теперь standalone SCHEDULE actions добавляет существующий `structuredOrThrow`
  ровно в sealed order. Проверка полного совпадения порядка не ослаблена.
  NAVIGATE authority, tenant/principal, H7, подтверждение и Action Engine не изменены.

## Свежие результаты на exact candidate

- Runtime full suite: **832 PASS / 7 SKIP / 0 FAIL**.
- React carrier full suite: **196 PASS / 0 FAIL**, включая 40 исходных sealed fixtures.
- Backend scoped regression: **149 PASS / 0 FAIL**, четыре suites:
  journal presenter, projector architecture, emitter, employee journal access.
- Actual AppModule + HTTP + PostgreSQL + runtime/React projection: **3/3 PASS**:
  personal create/reschedule/cancel на искусственной базе, пустой journal,
  заполненный journal (2 записи одного мастера).
- Emitted browser: chat 35, navigation 207, voice 56, schedule 42 — **340 PASS**.
  Это synthetic HTTP, отдельно от actual backend probe; они не выдаются за один
  сквозной браузерный сеанс с реальным CRM.
- NS-1 roundtrip: **16/16 PASS**.
- Runtime/carrier build ratchets, reproducible runtime build, packaging tests
  **18/18**, PWA/Capacitor eight-file parity: **PASS**.
- Две целевые counterfactual mutations: удаление minted time (3 failing assertions)
  и возвращение standalone detail вне sealed order (2 failing assertions).
  Unmutated/restored baselines зелёные. Это не полный release mutation corpus.

Полные команды, durations, hashes и receipts находятся в [архиве](evidence/maya-companion-schedule-rows-20261014/README.md).

## Что доказано заполненным источником

Initial и detail остаются structured; в обеих фазах видны два точных интервала:
`2026-09-24 · 10:00–11:00 · Europe/Moscow` и
`2026-09-24 · 12:00–13:00 · Europe/Moscow`.
Серверный мастер сохранён. Entry refs открывают канонические подробности.
В detail сохранены REFINE, CONTROL и parent-return в серверном порядке.
Timeline не меняется при открытии detail. Private synthetic note не проходит
в React markup; новых appointments и action executions journal read не создаёт.

## Дизайн и проверка изображения

Источник — owner package `Maya_full_design_package/screens/13-schedule.png` и его
prototype; provenance/hash в MANIFEST. Перенесены белая поверхность, ритм строк,
разделители и иерархия текста. Макет адаптирован к sealed данным: дата/timezone
показаны в subtitle, названия мастеров — в группах; все канонические заголовки и
действия сохранены. Это не копия демонстрационного расписания pixel-for-pixel.

Browser проверяет ширины 320/393/1280, controls >=44px, 200% text без накопительного
удвоения наследуемого font-size, scroll body, focus wrap, Escape/return, refusal
чужого principal, backend refusal, same-request retry и expiry. Synthetic screenshots
не являются данными реального салона. Повторяющийся заголовок сохранён из контракта
целого DetailSheet/RenderResult, не удалён ради сходства с макетом.

## Реальные ограничения и следующий шаг

1. Внутренний `getDayOperations` (`operations-analytics.service.ts`) сейчас явно
   возвращает `services: []` из Appointment read. Поэтому этот реальный synthetic
   источник закономерно выдаёт название «Запись», хотя в каталоге есть услуга.
   Тест проверяет именно это и запрещает подстановку имени из каталога. Unit presenter
   отдельно доказывает сохранение названий, когда их передаёт canonical owner.
   Следующий backend read unit — определить каноническое обогащение внутренних
   записей названиями услуг, не изменяя историю и расчётные факты.
2. `gaps: []` в journal не доказывает отсутствие свободных окон. Выводить окна из
   отсутствия записей запрещено. Для предложений записи нужен существующий источник
   availability с branch/service/staff/day; aggregate free-window source не добавлен.
3. Источник с несколькими перемежающимися мастерами в actual backend/PG этой проверкой
   не покрыт (multi-lane layout покрыт sealed browser fixture). Несовпадающий порядок
   по-прежнему честно уходит в prose, не переставляется локально.
4. Живой YCLIENTS, модель, рабочая база и пользовательская приёмка не выполнялись.
   Полный backend, Platform CI, release admission и полный mutation corpus в этом
   проходе не запускались; прежние сертификаты не наследуются.

## Provenance незелёных попыток

- `f003dfd9`: scoped presentation suites зелёные, populated source обнаружил
  `ignored/not_drawn` и prose из-за второго detail control. Unit до исправления
  FAIL, после — PASS; журналы сохранены.
- `54e93784`: первый runtime fix; source выявил неверное ожидание test fixture:
  internal day owner не отдаёт service names. Ожидание исправлено по коду owner,
  ограничение сохранено явно. Build обновил tracked runtime manifest; этот scoped
  run не объявлен final clean acceptance.
- `9612d10e`: source обнаружил вторую реальную ветку ordering — detail parent-return
  шёл раньше REFINE/CONTROL. Повторная узкая regression сначала FAIL, затем PASS.
- `8d54c4c5f7a76735143e71eab6e8711fd4f68153`: единый новый baseline, свежие результаты в этом архиве.
- Локальная diagnostic попытка запуска synthetic cluster без его явного порта
  отказала на занятом 5432, до запросов. Повтор с выделенным proof port выполнялся
  только на искусственной базе. Existing server не останавливался и не читался.
- Один runner preflight отказал на ещё staged manifest/test изменениях до
  выполнения suites; его отказ не выдан за product failure/green receipt.

## Границы эффектов

Production / retained salon DB / Keychain / real model / OTP / SMS / YCLIENTS / grants /
deploy / iPhone: **0**. Миграции только в новых disposable proof PostgreSQL, все
принадлежащие этому проходу proof clusters остановлены. Никакого merge или push.
HANDOFF STOP и widgets.runtime admission не изменены.

CERTIFIED != DEPLOYED. Этот checkpoint подтверждает перечисленные локальные проверки.
