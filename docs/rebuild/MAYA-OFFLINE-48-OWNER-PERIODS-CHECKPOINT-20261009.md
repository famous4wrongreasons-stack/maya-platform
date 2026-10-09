# MAYA — периоды, правила и границы чтения

Полезный результат: чат удерживает выбранный финансовый период между репликами,
для сравнения выполняет два отдельных разрешённых READ, объясняет реальные параметры
правила C8 и сохраняет цель переноса после чтения своей записи. Запрос опубликованных
показателей за конкретный месяц подключён к существующему C9/C7. Пустая выборка
отзывов больше не объявляется доказательством отсутствия настроенного реестра.

Это локальный development checkpoint. Модель scripted, источники синтетические.
Рабочий сайт, live YCLIENTS, frozen9 и union handoff не менялись. Полная MAYA и C10
не объявлены завершёнными.

## Что изменено в продукте

- **Финансовый период.** Existing ReportingPeriodResolver сохраняет закрытые semantic
  preferences; «прошлый год» означает предыдущий календарный год в часовом поясе
  бизнеса. Свежий явно названный день имеет приоритет и сохраняется в следующем
  контексте. Неоднозначное или неподдержанное окно требует уточнения.
- **Сравнение.** Единственная ready/allowed задача finance.compare_periods вызывает
  ровно два existing analytics.business.query через C9, с раздельными idempotency keys.
  Не подставляется previous-equal-period. Ответ содержит фактические границы обоих
  источников. Cash берётся только из confirmed_cash; стоимость записей, зарплата и
  прибыль не подменяют выручку. Арифметика остаётся у existing C7 comparator.
  Исключение любого READ закрывает ответ без частичных денежных значений и старой
  REPORT_CARD. Нет второго model completion и новых mutation tools.
- **Опубликованный месяц.** Explicit owner ingress передаёт конечный requested month
  одному C9. Выбор ограничен метаданными 51 кандидата, проверяет точные календарные
  границы в timezone каждого источника, сохраняет exact refs/request digest и повторно
  проверяет период перед exposure/replay. Это as_reported, не текущие финансы.
- **Lifecycle.** C8 возвращает конечные параметры только точной текущей подтверждённой
  политики: revision/hash, версия, service scope, интервал, сравнение, attendance и
  покрытие. Historical/superseded snapshot не получает параметры новой политики.
  C9 объясняет исходное правило, без прогноза возврата и клиентского списка.
- **Удержание и перенос.** Видимый ответ сохраняет ограниченные пожелания пользователя;
  canonical clarification marker не изменён. Own-list → unresolved reschedule сохраняет
  точную двухзадачную зависимость; список не выбирает запись и не подтверждает слот.
- **Отзывы.** Existing listReviews добавляет фактические границы одного запроса,
  exact rating, лимит и число возвращённых строк. Совместимые legacy configured/source
  сохранены, но не используются как доказательство настройки. Server composer выводит
  только дату, оценку и разрешённые темы, без текста, имён и идентификаторов.

## Первый фактический прогон этой волны

Runtime `cc6484cbba1c6999cb25cf6e8e2660c493d1512f`.
[Raw r1](evidence/maya-offline-48-owner-periods-20261009/full-http-r1/semantic-score.json)
сохранён без пересчёта: **51 pass / 1 semantic_fail / 14 unsupported /
15 insufficient_evidence**, 81 actual HTTP turns. Critical: 0 failed / 1 missing.

Все 49 предыдущих PASS сохранены. Два новых FAIL→PASS —
`current-lifecycle-ordinary:1` и `mt-cancel_pending_action-15:1`.
Из остальных прежних ошибок четыре retention стали корректно объяснённым unsupported;
четыре finance и два journal — insufficient, не выполненными функциями.
[Per-turn delta](evidence/maya-offline-48-owner-periods-20261009/previous-to-r1-delta.json).

Из исходных 25 ошибок: 10 PASS, 9 insufficient, 5 unsupported, 1 FAIL.
Это не 24 реализованные функции. Исходная подробная сверка 25→13 и всех тогдашних
10 unsupported + 9 insufficient сохранена отдельно:
[reclassification ledger](MAYA-OFFLINE-48-RECLASSIFICATION-AND-DEPENDENCIES-20261009.md).

Оставшийся BI случай выявил два разных разрыва проверки:

1. В исходной синтетической фикстуре inclusive конец месяца был `23:59:59`, а existing
   MeasurementReportReader прибавляет 1 мс. Полученная исключающая граница
   `2026-10-31T20:59:59.001Z` на 999 мс меньше точного конца октября в Europe/Moscow
   (`2026-10-31T21:00:00.000Z`). Продукт правильно отказался использовать такой
   snapshot как точный месячный.
2. Evaluator ожидал live analytics.business.query, хотя фактически сохранился C9
   work c7.measurement.read. Отсюда missing money-safety evidence при отсутствии
   денежного утверждения. Это отсутствие поддержанного audit path, не обнаруженная
   выдуманная сумма. Raw r1 с этим результатом сохранён.

Forward-only исправление фикстуры устанавливает inclusive `.999`. Оно не добавляет
метрики: booked value остаётся 12345 minor RUB и PARTIAL; cash/profit — NOT_MEASURED,
покрытие заканчивается в asOf. Это исправление тестового входа, не новая функция.
Новый audit join связывает actual persisted C9 run/work с точным tenant-owned C7,
хешированными refs/handles, timezone, revision и expiry. Значения берутся из C7,
не из текста ответа. Старые raw, gold и frozen descriptors не изменены.

## Итоговый фактический прогон

Runtime `49c37804b1f404b2cd2723f807b22f10c838a759`.
[Raw HTTP r2](evidence/maya-offline-48-owner-periods-20261009/full-http-r2/http-report.json),
[score](evidence/maya-offline-48-owner-periods-20261009/full-http-r2/semantic-score.json),
[все 81 фактических ответа](evidence/maya-offline-48-owner-periods-20261009/ACTUAL-81-TURN-AUDIT.md).

**52 PASS / 0 semantic_fail / 14 unsupported / 15 insufficient_evidence.**
81 фактический ход: 80 HTTP 201 и ожидаемый revoked HTTP 401. Пропусков и unresolved нет.
Critical safety: **0 failed / 0 missing**. Exit 2 означает завершённый прогон с
ограничениями, а не завершённую MAYA или transport failure.

Все 49 прежних PASS сохранены. К двум улучшениям r1 добавился published BI:
путь продукта + исправление рамки фикстуры + поддержка exact C9 evidence в evaluator.
Этот переход нельзя приписывать только продуктовому коду или изменению label.
Сумма 123,45 ₽ названа стоимостью записанных услуг; выручка и прибыль не измерены.
Отзывы стали честнее описывать источник, но остались unsupported.

Исходные 25 ошибок распределились в **11 PASS / 9 insufficient / 5 unsupported**.
[Все переходы от исходного r2](evidence/maya-offline-48-owner-periods-20261009/original-to-r2-delta.json)
и [от предыдущего checkpoint](evidence/maya-offline-48-owner-periods-20261009/previous-to-r2-delta.json)
сохранены по каждому ходу. Ни один предыдущий raw report не пересчитан.
[Все 29 оставшихся разрывов и конкретные следующие действия](evidence/maya-offline-48-owner-periods-20261009/REMAINING-29.md).
Price preparation остаётся отдельным semantic bridge к existing price owner/approval;
это не отсутствие AE и не разрешение на MONEY execution, price lane не изменялась.

Broker: 45 model-eligible dialogs / 76 turns / 91 scripted responses,
credentialsLoaded=false, upstreamCalls=0, reserved spend=0. Все шесть owned groups
closed/absent; broker stopped с 0 connections/requests, PG stopped, postmaster.pid
отсутствует, source hashes unchanged. Это не реальные model usage/cost/quality.

Manifest r2 SHA-256: `27a034f438a6afc5ef51d414629c1899088f61aa37b73cb51d6635bb493e3fd9`.
Raw HTTP compact hash: `22c8c083b86b3d4a98549c0f2c988feaaf685381d435c6ba85a7e7722bce756b`.
Frozen expectation descriptors SHA-256 не изменился:
`880c6c535512004d4005c762d14d3e4a68a95c13f6abf89b8e9f9035e32d2a1b`.

## Проверки и независимое review

Основной объединённый набор: 594 теста / 14 suites PASS. Последующая интеграция
отзывов: 345 тестов / 3 suites PASS, с пересечением тестов чата (не дополнительная
уникальная сумма). Script recipe suite: 26/26; final finite evaluator: 44/44. Production TypeScript, scoped
source/spec TypeScript и narrow ESLint PASS. Widget-live TypeScript/lint проверены
для новых test-only projections.

Сохранены ранние RED: synthetic test confidence, previous-year resolver,
formatter typing, типы существующих тестовых фабрик; также OOM checks при 1 GiB,
после которых serial проверки прошли с лимитом 2 GiB. Нет скрытого повторного
запуска провайдеров. Review выявило и закрыло: array-enum coercion, future-window
qualification, mismatch сохранённого периода, exception второго READ и ложный
money-label/empty-display PASS оценщика.

## Точные оставшиеся ограничения

- Live C7 в этих источниках даёт PARTIAL и confirmed_cash NOT_MEASURED. Оба запрошенных
  окна действительно прочитаны, но численная выручка, сравнение и причина изменения
  не доказаны. Нужны подтверждённые cash/refund/cost источники у текущего владельца.
- Cohort «больше двух месяцев», прежняя регулярность и приоритет возврата не поддержаны
  существующей bounded C8 проверкой. Нужно соответствующее owner правило/проекция;
  скрипт и presentation не создают её и не запускают рассылку.
- Employee/branch journal, employee-specific price/services и branch public address
  требуют current request→staff→branch/source binding. Общий каталог и tenant branding
  не доказывают его; Practitioner contract этой фикстуры не связывает двух Саш с
  филиалом. Следующий шаг — проверяемый source witness у CRM owner, не выдуманный ID.
- Reviews READ умеет нижнюю временную границу, одну оценку и bounded limit. Это не
  точный предыдущий календарный месяц и не набор всех низких оценок. Inventory branch
  scope также не появляется от чтения общего каталога.

Новая схема, retention policy и background autonomy не вводились. Один C9 сохранён;
CRM/C7/C8 — владельцы фактов, AE — только мутаций. Presentation не выдаёт разрешений.
Нет paid model, provider/YCLIENTS, production, HTTPS/phone, push/merge или real-model,
React, process restart и C10-complete acceptance.

## Сохранённый checkpoint

Ветка: `codex/maya-offline48-semantics-20261009`. Code commits: `cc6484cb` и `49c37804`.

Независимый функциональный reviewer подтвердил отсутствие новых blockers в проверенном
scope и проверил actual BI/reviews. Другой reviewer, автор oracle, отдельно подтвердил
целостность всех 2503 source hashes (35,012,324 bytes) против runtime Git и все 81
reply/history/audit bindings; независимую приёмку собственных правил он не заявляет.
[Квалификация review и изоляции](evidence/maya-offline-48-owner-periods-20261009/REVIEW-AND-ISOLATION.json).

[Manifest архива](evidence/maya-offline-48-owner-periods-20261009/manifest.json): 100 файлов, 13,168,756 bytes. SHA-256:
`d476878f23cf64882e4c47a6a0893fb19f567565dc63ef537026c2741d5fdae3`.
