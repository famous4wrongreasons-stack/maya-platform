# Независимая классификация предыдущих 13 semantic_fail — 2026-10-09

Переход `13 semantic_fail → 3 pass / 4 unsupported / 6 insufficient_evidence` воспроизведён по неизменённым архивам. Он **не означает, что выполнены все 13 пользовательских функций**. Три PASS имеют узкие границы; остальные десять запросов остаются функционально незавершёнными. Часть прежних ошибок ответа действительно исправлена, но безопасное объяснение ограничения не подменяет результат.

Review выполнен при HEAD `8c914957ce0da8cacd468afdf01975bb62d397ad`. До: runtime `6f76d4750644aba6d3ec3f81a6019fdf3aa47b9d`; после: runtime `49c37804b1f404b2cd2723f807b22f10c838a759`. Это два разных actual local HTTP/PG запуска со scripted transport и synthetic business fixtures, не rescore старых ответов и не проверка реальной языковой модели. Этот документ не изменяет старые verdict, gold, runtime, evaluator или evidence.

## Метод и неизменность evidence

- До: [full-http-r1/semantic-score.json](evidence/maya-offline-48-followup-20261009/full-http-r1/semantic-score.json); после: [full-http-r2/semantic-score.json](evidence/maya-offline-48-owner-periods-20261009/full-http-r2/semantic-score.json).
- Delta: [previous-to-r2-delta.json](evidence/maya-offline-48-owner-periods-20261009/previous-to-r2-delta.json), SHA-256 `4eba3b84d2b5295c1c13a524cbd33cdaeedddf53e65e0ade8a9da3dec753b23f`. Все 13 строк delta сверены с первичными score, включая reply hashes и failed/missing assertions.
- Case identities/user turns и dataset одинаковы; dataset SHA-256 `9c8db1420c489169a474b04dd43933110461fe3630e3ada2fb0e8dc40e7eb15b`; expectation descriptor до/после `880c6c535512004d4005c762d14d3e4a68a95c13f6abf89b8e9f9035e32d2a1b`. Одинаковый descriptor не означает одинаковую реализацию evaluator: её вклад ниже указан отдельно.
- Для всех 26 рассматриваемых строк пересчитаны actualReplyHash и actualAuditHash; reply/responseHash сопоставлены с http-response-journal.jsonl. ReplyHash здесь — SHA-256 UTF-8 compact JSON строки (`JSON.stringify(reply)`), не SHA-256 видимого Markdown. Полные ответы ниже копируются из JSON без редакторской правки; NBSP в денежных суммах сохранён.
- В каждом из двух архивов 8 файлов (score, HTTP report, turn audit, runner report, candidate manifest, response journal, actual HTTP turns, source snapshots) byte-identical соответствующему original /private/tmp run root. Проверены 16 выбранных source bindings нового manifest против Git blobs runtime 49c37804 и текущих файлов; это не новая полная проверка всех 2503 source paths.
- Original roots: `/private/tmp/maya-offline48-followup-http-20261009-r1` и `/private/tmp/maya-offline48-owner-periods-http-20261009-r2`. Никаких повторных сервисов, тестов, модели, сети или изменений этих файлов в ходе review не было.

| Evidence | До SHA-256 raw bytes | После SHA-256 raw bytes |
|---|---|---|
| semantic-score.json | `67b05a28b8c0b79aeb35f724de338e222fe62c220a2cc7c4cf8c6a32abb31aa1` | `1a10a0c241e2632d71ffe26febc3741b02e4c3c066b197ef2de35f7fb568ed06` |
| http-report.json | `a90d6bbdb32a3aaa97b3b9446f02aa59d37facbf2decfadac9585ae26af4bf17` | `82b1adeea9397207c4e83b04ac6f7f7f9a0f4d3a82b4fa9e88047ae9a0127192` |
| offline-turn-audit.jsonl | `19115fe3f0fa07366ede71bff91c1c90b9ce5cd6f92d36eba9c3533df0908126` | `0f8d166d9dd8e3ef9d0ceb13d6579743f907d9ec031a9e77156f226c5b4d4911` |
| runner-report.json | `a81d3ead7516e1a71bd66030d89e5c44e4780a31259c71c426a5c101b4303cae` | `2e95a1fcb516059de256e7c9c8d729c7d93dd51aeaf3acfbc8874dfa6cea6512` |
| candidate-manifest.json | `e83d412d10f9af17905403b4c685322a382fb62c1327ca449201ce1aebc99837` | `27a034f438a6afc5ef51d414629c1899088f61aa37b73cb51d6635bb493e3fd9` |

## Итог по каждому turn

| Case:turn | Архивный новый status | Независимая квалификация |
|---|---|---|
| `current-bi-ordinary:1` | `pass` | PASS: точный опубликованный PARTIAL-снимок; вклад runtime + fixture + oracle |
| `current-lifecycle-ordinary:1` | `pass` | PASS: объяснены параметры точного текущего C8-правила |
| `mt-finance_follow_up-7:1` | `insufficient_evidence` | I: период исправлен; cash не реализован в этом C7 producer + oracle gap |
| `mt-finance_follow_up-7:3` | `insufficient_evidence` | I: два периода сохранены/прочитаны; сравнение и причина недоступны |
| `mt-finance_follow_up-10:1` | `insufficient_evidence` | I: период исправлен; cash не реализован в этом C7 producer + oracle gap |
| `mt-finance_follow_up-10:3` | `insufficient_evidence` | I: два периода сохранены/прочитаны; сравнение и причина недоступны |
| `mt-retention_drill_down-0:2` | `unsupported` | U: восстановлен смысл уточнения; регулярная когорта не реализована этим path |
| `mt-retention_drill_down-0:3` | `unsupported` | U: приоритет сохранён в контексте; ранжирование не выполнено |
| `mt-retention_drill_down-15:2` | `unsupported` | U: восстановлен смысл уточнения; регулярная когорта не реализована этим path |
| `mt-retention_drill_down-15:3` | `unsupported` | U: приоритет сохранён в контексте; ранжирование не выполнено |
| `mt-ambiguous_entity_resolution-15:1` | `insufficient_evidence` | I: scripted intent исправлен; текущая неоднозначность владельцем не проверена |
| `mt-ambiguous_entity_resolution-15:2` | `insufficient_evidence` | I: филиал сохранён; связь Саша↔филиал и journal не доказаны |
| `mt-cancel_pending_action-15:1` | `pass` | PASS только подготовки: own READ + Friday; перенос не исполнен |

## Что остаётся продуктовой задачей

1. **Выручка и сравнение (4 turns):** нужные периоды теперь прочитаны; cash и числовая разница не измерены. C7 producer всегда выдаёт эту метрику NOT_MEASURED, поэтому это не следует списывать только на fixture. Отдельный узкий oracle gap не должен маскировать реальную границу источника. Менять название booked value на выручку нельзя.
2. **Retention (4 turns):** исправлено сохранение условий и объяснение ограничений. Отбор >2 месяцев, прежняя регулярность и приоритет возврата выбранным path не реализованы. Fixture с правилом >30 дней недостаточна; новая более богатая fixture сама по себе не реализует поддерживаемый owner route. Существование отдельного C8 ranking не является разрешением применить его к произвольной цели.
3. **Journal (2 turns):** canonical intent и branch preference сохранены, но current owner resolution не наблюдается. После уточнения филиала нет доказанного выбора мастера/списка записей. Существующий journal reader нельзя объявлять отсутствующим; его traversal не достигнут, а staff-to-branch evidence в fixture отсутствует.
4. **Три PASS:** опубликованный PARTIAL BI snapshot; объяснение exact current C8 policy; собственный список плюс сохранённая подготовка переноса. Последний не выполняет перенос. Ни один PASS не создаёт нового разрешения, а агрегат 52/0/14/15 не означает readiness.

Приоритет зависимостей: сначала точная семантика источника/допустимого owner route → затем необходимые текущие данные/fixture → actual traversal и независимый oracle. Не начинать с ослабления assertions или нового безопасного шаблона ответа.

## 1. `current-bi-ordinary:1`

Архивный переход: `semantic_fail → pass`. JSON pointers: до `/rows/29`, после `/rows/29`. HTTP status до/после: `201/201`.

Запрос:

```text
Покажи опубликованные показатели за октябрь 2026 года.
```

Предыдущие failed assertions: `["financial_result_delivered","financial_completeness_explained"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `b7398089eb851c3e0d053cee28284d4e404b4dcd0ca2ba44a9053755cd052534` | `55c0be681e9cb810fc32eb7261ea44c3e05553e926493215c1559c8c251746a2` |
| actualResponseHash | `a423a0dab37063452387681607b410416c6c24e348005bd5138e3e52fdfd0178` | `d79eb766cdd4bf22101f76c43e3ae9581b6890ebb7e060b6592f68205d953512` |
| actualAuditHash | `8ea8b0004a0ec0c249ba8b8d2f61440b16979baacecd06deca37f728a1585c3d` | `342be92ff3017a877a162bb8f095636c7c51b2402dbdc2dda4dffedae45e33a4` |
| actualHistoryHash | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

Предыдущий фактический ответ (полностью):

```text
Смотри, кратко за октябрь 2026 по сегодня: 1 записей, 0 уникальных клиентов. Если нужно — разберём, что за этим стоит.
```

Новый фактический ответ (полностью):

```text
Найден опубликованный финансовый снимок за октябрь 2026 года; границы месяца проверены в часовом поясе источника.

Опубликованный финансовый снимок, версия 1.
Период: 01.10.2026, 00:00 GMT+3 — 01.11.2026, 00:00 GMT+3 (конец не включён; Europe/Moscow).
Чистую прибыль не подтверждаю: нужны подтверждённые поступления и возвраты, полная сопоставимая база расходов. Неизвестное не считаю нулём.
Данные неполные; суммы относятся только к указанным источникам.
Данные на 09.10.2026, 13:35:45,027 (UTC).
Это сохранённые измерения, без пересчёта текущего состояния. Причина изменения выручки не установлена.
Стоимость записанных услуг: 123,45 ₽.
Оборот операций по данным CRM (не подтверждённая касса): не измерено.
Подтверждённые начисления зарплаты: не измерено.
Подтверждённые поступления: не измерено.
Подтверждённые возвраты: не измерено. Показана часть показателей; остальные не приняты за ноль.

Факт чтения и ссылка на источник сохранены.
```

**Независимый verdict.** Подтверждаю только ограниченный PASS объяснения опубликованного октябрьского снимка. До изменения вместо этого был счётчик записей. Теперь ответ связан с реальным сохранённым C9 work receipt и текущей опубликованной C7 revision. Это исправление поведения продукта вместе с исправлением fixture и наблюдаемости; не чистый эффект одного runtime patch.

**Оставшаяся граница.** Число 123,45 ₽ — observed_booked_value / booked_prices, стоимость записанных услуг, а не подтверждённые поступления. PARTIAL и источник на дату чтения не доказывают полноту будущего окончания октября. Не доказаны числовая касса, прибыль, причины изменений и пересчёт текущего бизнеса.

**Каноническое основание.** Точный месяц выбирается по локальным границам источника и повторно проверяется при expose. Fixture исправлена с inclusive `2026-10-31T23:59:59+03:00` (= `.000`) на `.999+03:00`: существующий reader прибавляет 1 ms, поэтому это устраняет потерю 999 ms, а не добавляет платёжные факты. Oracle теперь требует связь returned run → SETTLED c7.measurement.read → exact current published source, typed metric label/basis и PARTIAL explanation. До/после менялись и продукт, и fixture/oracle, поэтому причинный вклад отдельно не измерен.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/orchestration/c9.bi-source.ts:151`](../../maya-saas-backend/src/orchestration/c9.bi-source.ts#L151), [`src/orchestration/c9.orchestrator.ts:727`](../../maya-saas-backend/src/orchestration/c9.orchestrator.ts#L727), [`test/widgets-live/support/current-candidate-sources.ts:359`](../../maya-saas-backend/test/widgets-live/support/current-candidate-sources.ts#L359), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:457`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L457), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:1947`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L1947).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "coordination": {
    "scope": "explicit_bi_report",
    "state": "DRAFT",
    "current": false,
    "replayed": false,
    "runHash": "2fafd29e1a8f6d9ab54ba32c493fd80b2c6cd1eeacf1575d28a3d58107c81169",
    "revisionHash": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"
  },
  "auditRunRef": "sha256:7599da65879eb19748cd26416e7e9cdde88f0a80d8bde681a3330dbac6636e0a",
  "auditWorkRef": "sha256:61bacb1239d053fbee78b3cf999f78f936efcbe3c6e8112f3cf4ca9e7fc27e2a",
  "workTask": "c7.measurement.read",
  "workState": "SETTLED",
  "workResultHash": "f8e887c896eadb94a84794e0062117163df2eb8bfe606bdb78d48ccefe94f417",
  "publishedSource": {
    "evidenceHandle": "sha256:59b1b0d3de839b9d7c46180a0662003d3edcbaf2658a22ae18b26b178a2e0bac",
    "sameTenant": true,
    "exactCurrentRevision": true,
    "state": "PUBLISHED",
    "revision": 1,
    "snapshotHash": "sha256:0d7cd04446b09bd08edd5e629ffd384d658dcf72230dda066acb42085d696913",
    "asOf": "2026-10-09T13:35:45.027Z",
    "expiresAt": "2027-10-09T13:35:45.087Z",
    "period": {
      "from": "2026-09-30T21:00:00.000Z",
      "toExclusive": "2026-10-31T21:00:00.000Z",
      "timezone": "Europe/Moscow"
    },
    "completeness": "PARTIAL",
    "qualification": "VERIFIED"
  },
  "displayedMoneySource": [
    {
      "key": "observed_booked_value",
      "dimensions": {},
      "unit": "money_minor",
      "basis": "booked_prices",
      "currency": "RUB",
      "state": "PARTIAL",
      "value": "12345"
    },
    {
      "key": "confirmed_cash",
      "dimensions": {},
      "unit": "money_minor",
      "basis": "confirmed_cash",
      "currency": "RUB",
      "state": "NOT_MEASURED",
      "value": null
    },
    {
      "key": "net_profit",
      "dimensions": {},
      "unit": "money_minor",
      "basis": "net_profit",
      "currency": "RUB",
      "state": "NOT_MEASURED",
      "value": null
    },
    {
      "key": "observed_period_to_exclusive",
      "dimensions": {},
      "unit": "instant",
      "basis": "canonical_half_open_window",
      "currency": null,
      "state": "COMPLETE",
      "value": "2026-10-09T13:35:45.027Z"
    }
  ]
}
```

## 2. `current-lifecycle-ordinary:1`

Архивный переход: `semantic_fail → pass`. JSON pointers: до `/rows/31`, после `/rows/31`. HTTP status до/после: `201/201`.

Запрос:

```text
Объясни опубликованный результат lifecycle и правило его расчёта.
```

Предыдущие failed assertions: `["rule_parameters_evidenced"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `db3bc152a93daf9344309800f65cce466a9312be5db9b054dc3b04af99959d1c` | `4de48f8079fa798815d1fb7a3bafb4ca98c4c4cddbb984210b11d29544b2369b` |
| actualResponseHash | `70b3e591b0e7d85f0dd85ac8904f39f668bbd0677a4b675c777c381bb1313367` | `ff88276466b3f874e593bd74838c07b831cc3b7cc885f802849a8dd79431ed45` |
| actualAuditHash | `b22c4309cff144788168f7286ab60b8c8a156d22fecc8c92b1f3ac365efd1fc2` | `08b1e7dc20e65493f9edd8ff15cf0fa813d00cd6c2b5c1d50ab57c2c32e5629d` |
| actualHistoryHash | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

Предыдущий фактический ответ (полностью):

```text
Проверены доступные оценки давности визитов по подтверждённому правилу бизнеса.

Оценка 1: По оценке на 09.10.2026, 12:46:20,860 (UTC) условие давности визитов по правилу бизнеса (версия 1) выполнено. Исходные данные неполные.

Проверка охватывает до трёх оценок, а не список уникальных клиентов. Охват всей базы не подтверждён.

Давность визита не означает готовность гостя вернуться. Прогноза возврата и разрешения на контакт нет.

Варианты: По новому запросу проверить актуальность оценок; Ничего не делать.

Предложение сохранено, версия 1. Клиентские записи не менялись, сообщения не отправлялись.
```

Новый фактический ответ (полностью):

```text
Проверены доступные оценки давности визитов по подтверждённому правилу бизнеса.

Оценка 1: По оценке на 09.10.2026, 13:35:45,464 (UTC) условие давности визитов по правилу бизнеса (версия 1) выполнено. Интервал правила: 30 дней с последнего подтверждённого посещения. Условие выполняется строго после окончания этого интервала. День здесь — истёкшие 24 часа. Правило допускает частичное покрытие исходных данных. Правило не ограничено отдельными услугами. Исходные данные неполные.

Проверка охватывает до трёх оценок, а не список уникальных клиентов. Охват всей базы не подтверждён.

Давность визита не означает готовность гостя вернуться. Прогноза возврата и разрешения на контакт нет.

Варианты: По новому запросу проверить актуальность оценок; Ничего не делать.

Предложение сохранено, версия 1. Клиентские записи не менялись, сообщения не отправлялись.
```

**Независимый verdict.** Подтверждаю ограниченный PASS запрошенного объяснения опубликованной lifecycle-оценки и её правила. Ранее отвечали только результатом/версией; теперь явно показаны 30 дней, строгое сравнение, доказанное посещение, 24-часовой день, допускаемое частичное покрытие и отсутствие service restriction.

**Оставшаяся граница.** Это до трёх оценок, не список всех клиентов. Не доказаны регулярность, готовность вернуться, приоритет контакта, сегмент >2 месяцев или разрешение на рассылку. В наблюдении одна PARTIAL-оценка и одна сохранённая proposal revision; действия не исполнялись.

**Каноническое основание.** C8 прикладывает параметры только при совпадении policyRevisionId/contentHash, ruleVersion и service scope, внутри существующей проверки currentness. Presenter не заимствует новое правило для старой оценки. Фактическая source snapshot содержит barber_cadence/v1, thresholdDays=30, comparison=gt, proven_attendance; response и persisted C9 work используют один evidence handle.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/valuation/c8.read.ts:40`](../../maya-saas-backend/src/valuation/c8.read.ts#L40), [`src/valuation/c8.read.ts:197`](../../maya-saas-backend/src/valuation/c8.read.ts#L197), [`src/orchestration/c9.lifecycle-presentation.ts:55`](../../maya-saas-backend/src/orchestration/c9.lifecycle-presentation.ts#L55), [`src/orchestration/c9.lifecycle-presentation.ts:115`](../../maya-saas-backend/src/orchestration/c9.lifecycle-presentation.ts#L115).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "clients.dormant_list",
      "entities": {},
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "coordination": {
    "scope": "explicit_lifecycle",
    "state": "PROPOSED",
    "current": true,
    "replayed": false,
    "revision": 1,
    "runHash": "dfb1e29074a62195c3aacdfa68b623750d17aabb4edb5cca086f9592730f4ace",
    "revisionHash": "cab6571c37b95870f0925c1b034cc5e72159585c072a3bb693d85c5c6dab0889"
  },
  "persistedCurrentRevision": 1,
  "persistedRevisions": [
    {
      "revisionHash": "cab6571c37b95870f0925c1b034cc5e72159585c072a3bb693d85c5c6dab0889",
      "version": 1,
      "evidenceHash": "cb8300f278b5a188fbc8ff357de8f27b43fccd46b46a0297e1b302d438c1c8b1",
      "evidenceCount": 1
    }
  ],
  "actualC8Rule": [
    {
      "ruleKey": "barber_cadence",
      "ruleVersion": 1,
      "thresholdDays": 30,
      "comparison": "gt",
      "evidence": "proven_attendance"
    }
  ],
  "receipt": {
    "workReceiptId": "sha256:9355f09216ca0ed2910e39f937d3173b28589d80fb00c8dbe43a2b1e70d3c3ae",
    "checkedAt": "2026-10-09T13:36:01.364Z",
    "sourceHandles": [
      "sha256:45b848bc32e7d0edf4453536b8d78a8ae579c11d2da661fae9d084d17e6870d1"
    ]
  },
  "findingRefs": [
    [
      "sha256:45b848bc32e7d0edf4453536b8d78a8ae579c11d2da661fae9d084d17e6870d1"
    ]
  ],
  "noSideEffects": true,
  "executionAuthority": false,
  "canContact": false
}
```

## 3. `mt-finance_follow_up-7:1`

Архивный переход: `semantic_fail → insufficient_evidence`. JSON pointers: до `/rows/44`, после `/rows/44`. HTTP status до/после: `201/201`.

Запрос:

```text
Ответь по существу: какая выручка с начала года
```

Предыдущие failed assertions: `["requested_financial_owner_scope_unavailable_explained"]`. Предыдущие missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.
Новые failed assertions: `[]`. Новые missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `155da9ea72afed5dea088035c3fded26e855adbee807d750517ad8e7d4bccddb` | `759ea2cf51e03755ad3d3ba3a6e9c473e73a800cf071823204f7eb4d3967b922` |
| actualResponseHash | `4d3c20db6db773ca1215089e8540f309142ece71f09e8c033396a55fdcbd901c` | `a1b45320357b82624f7d0b923c2471aafa0b40eaed5fb5834aeb2ee2f7648729` |
| actualAuditHash | `b2bba54804e26fbaa2d86a5da0a28fecaf074171389c74a6ed7ce97ece2a1f9d` | `67abfdad53d30335a9a8eea1e7c11b8c2b5fb014dbbd94588de71430bb41e03d` |
| actualHistoryHash | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

Предыдущий фактический ответ (полностью):

```text
Стоимость записанных услуг: 123,45 ₽. Оборот операций по данным CRM (не подтверждённая касса): не измерено. Подтверждённые начисления зарплаты: не измерено. Подтверждённые поступления: не измерено. Подтверждённые возвраты: не измерено. Чистая прибыль: не измерено. Чистую прибыль не подтверждаю: нужны подтверждённые поступления и возвраты, полная сопоставимая база расходов. Неизвестное не считаю нулём. Данные неполные; суммы относятся только к указанным источникам. Данные на 09.10.2026, 12:46:39,041 (UTC).
```

Новый фактический ответ (полностью):

```text
Фактический период источника: этот год. Текущие измерения по всему бизнесу. 01.01.2026, 00:00 GMT+3 — 09.10.2026, 16:36:04,610 GMT+3 (конец не включён; Europe/Moscow). Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём. Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части. Данные на 09.10.2026, 13:36:04,613 (UTC).
```

**Независимый verdict.** Сохраняю архивный insufficient_evidence, но не считаю его отсутствием любого READ. Фактический analytics.business.query существует, период и timezone совпадают с запросом; прежняя потеря периода исправлена. Запрошенное числовое значение выручки не получено. Честное NOT_MEASURED — безопасное поведение, но не выполненная пользовательская функция.

**Оставшаяся граница.** Есть одновременно продуктовая граница метрики, недостаток подтверждённых бизнес-данных в этом запуске и узкий oracle gap. В текущем MeasurementFinanceReader confirmed_cash/refunds/net_profit всегда создаются как null/NOT_MEASURED. Поэтому одного добавления синтетических чисел в fixture недостаточно, и booked_value нельзя переименовать в кассу. Нужен существующий разрешённый источник с доказанной семантикой метрики либо явное продуктовое ограничение. Этот аудит не разрешает новый источник/authority.

**Каноническое основание.** Measurement whole-result PARTIAL/VERIFIED совместим с отдельным confirmed_cash NOT_MEASURED. Текущий exactOwnerLimit в evaluator признаёт source-limit evidence только при whole-result UNAVAILABLE и !compare; наблюдённая форма PARTIAL не покрыта. Это объясняет missing assertion, но не превращает ответ в числовую выручку. Наличие только октябрьского опубликованного snapshot само по себе не доказывает невозможность live year/week query.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/measurement/measurement.finance.ts:518`](../../maya-saas-backend/src/measurement/measurement.finance.ts#L518), [`src/ai-tools/finance-period-binding.ts:10`](../../maya-saas-backend/src/ai-tools/finance-period-binding.ts#L10), [`src/ai-tools/finance-period-reply.ts:85`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L85), [`src/ai-tools/finance-period-reply.ts:122`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L122), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:2115`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L2115).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "finance.revenue",
      "entities": {
        "period": "year_to_date"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [
    "analytics.business.query"
  ],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "financialOwnerResults": [
    {
      "resolved_period": {
        "kind": "year_to_date",
        "from": "2025-12-31T21:00:00.000Z",
        "to": "2026-10-09T13:36:04.609Z",
        "label_ru": "этот год",
        "truncated_to_today": false
      },
      "period": {
        "from": "2025-12-31T21:00:00.000Z",
        "toExclusive": "2026-10-09T13:36:04.610Z",
        "timezone": "Europe/Moscow"
      },
      "mode": "live",
      "completeness": "PARTIAL",
      "qualification": "VERIFIED",
      "cash": [
        {
          "key": "confirmed_cash",
          "dimensions": {},
          "unit": "money_minor",
          "basis": "confirmed_cash",
          "currency": "RUB",
          "state": "NOT_MEASURED",
          "value": null
        }
      ]
    }
  ]
}
```

## 4. `mt-finance_follow_up-7:3`

Архивный переход: `semantic_fail → insufficient_evidence`. JSON pointers: до `/rows/46`, после `/rows/46`. HTTP status до/после: `201/201`.

Запрос:

```text
Сравни и объясни разницу
```

Предыдущие failed assertions: `["comparison_both_periods_addressed"]`. Предыдущие missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.
Новые failed assertions: `[]`. Новые missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `c13ffd3f3c91999f512f104aef59395eba37a6acf43db7b811243f78df48ce05` | `1a7505ebaa00133a7e94a24610f7e882e55d4ff195b48fdb559228875e6c96af` |
| actualResponseHash | `7c9285b4de9be3f4c046c4463bfbc91d471511b93bb69742dfb1fc17129a545d` | `31f05a1aca2a3d924f9caf10d46eaf111ad5d5de47b6c045b90520a2257548a5` |
| actualAuditHash | `9ff84f0e90b353ed447abd3e161a1f25c40651b75aba26620e613fd4b3ade6cf` | `c1cb8a0802d7d08bb32e97a774aa39a82df901105368a2686fac5b846ec21e53` |
| actualHistoryHash | `2f05b480546f4c2f83b85c2a487ac723ebd72bf41d8a882f976bd5433f746535` | `6f67716846bca70ac1a8813c4e9d0561c19c65f7794f568a8c2f367663ddb218` |

Предыдущий фактический ответ (полностью):

```text
Смотри, кратко за этот месяц: 1 записей против 0, 0 уникальных клиентов против 0. Изменение с предыдущим равным периодом: +1. Изменение с предыдущим равным периодом: 0. В доступных CRM-показателях нет подтверждённого снижения, поэтому конкретную причину просадки назвать нельзя.
```

Новый фактический ответ (полностью):

```text
Текущий период: Фактический период источника: этот год. Текущие измерения по всему бизнесу. 01.01.2026, 00:00 GMT+3 — 09.10.2026, 16:36:04,610 GMT+3 (конец не включён; Europe/Moscow). Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём. Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части. Данные на 09.10.2026, 13:36:04,613 (UTC).
Предыдущий период: Фактический период источника: 1 января 2025 — 31 декабря 2025. Текущие измерения по всему бизнесу. 01.01.2025, 00:00 GMT+3 — 01.01.2026, 00:00 GMT+3 (конец не включён; Europe/Moscow). Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём. Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части. Данные на 09.10.2026, 13:36:04,859 (UTC).
Количественное сравнение не подтверждено: окна, валюты или полнота измерений несопоставимы. Причина изменения выручки не установлена.
```

**Независимый verdict.** Сохраняю архивный insufficient_evidence. В отличие от старого ответа оба запрошенных периода реально прочитаны и показаны; потеря comparison intent исправлена. Количественная разница и причинное объяснение не выполнены: оба current source results имеют confirmed_cash=null/NOT_MEASURED.

**Оставшаяся граница.** Это не только нехватка fixture. Текущий C7 producer не производит confirmed_cash, а comparator требует измеримые сопоставимые complete результаты. Даже будущая корректная числовая разница не докажет причину изменения. Для этих turns oracle также никогда не включает exactOwnerLimit из-за !compare; missing evidence нельзя читать как доказательство отсутствия двух READ.

**Каноническое основание.** Task сохраняет current period и comparison_period, выполняются два exact live C7 reads без автоматической подмены на предыдущий равный интервал. Formatter блокирует арифметику при некомплектных/неизмеренных данных и не утверждает причинность. Архивный missing_requested_source здесь отражает неполное покрытие evaluator форм результата, а не полное отсутствие owner evidence.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/measurement/measurement.finance.ts:518`](../../maya-saas-backend/src/measurement/measurement.finance.ts#L518), [`src/ai-tools/finance-period-binding.ts:44`](../../maya-saas-backend/src/ai-tools/finance-period-binding.ts#L44), [`src/ai-tools/finance-period-reply.ts:230`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L230), [`src/ai-tools/finance-period-reply.ts:248`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L248), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:2115`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L2115).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "finance.compare_periods",
      "entities": {
        "period": "year_to_date",
        "comparison_period": "previous_year",
        "metric": "revenue"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [
    "analytics.business.query",
    "analytics.business.query"
  ],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "financialOwnerResults": [
    {
      "resolved_period": {
        "kind": "year_to_date",
        "from": "2025-12-31T21:00:00.000Z",
        "to": "2026-10-09T13:36:04.609Z",
        "label_ru": "этот год",
        "truncated_to_today": false
      },
      "period": {
        "from": "2025-12-31T21:00:00.000Z",
        "toExclusive": "2026-10-09T13:36:04.610Z",
        "timezone": "Europe/Moscow"
      },
      "mode": "live",
      "completeness": "PARTIAL",
      "qualification": "VERIFIED",
      "cash": [
        {
          "key": "confirmed_cash",
          "dimensions": {},
          "unit": "money_minor",
          "basis": "confirmed_cash",
          "currency": "RUB",
          "state": "NOT_MEASURED",
          "value": null
        }
      ]
    },
    {
      "resolved_period": {
        "kind": "named_range",
        "from_day": "2025-01-01",
        "to_day": "2025-12-31",
        "from": "2024-12-31T21:00:00.000Z",
        "to": "2025-12-31T20:59:59.999Z",
        "label_ru": "1 января 2025 — 31 декабря 2025",
        "truncated_to_today": false
      },
      "period": {
        "from": "2024-12-31T21:00:00.000Z",
        "toExclusive": "2025-12-31T21:00:00.000Z",
        "timezone": "Europe/Moscow"
      },
      "mode": "live",
      "completeness": "PARTIAL",
      "qualification": "VERIFIED",
      "cash": [
        {
          "key": "confirmed_cash",
          "dimensions": {},
          "unit": "status",
          "basis": "confirmed_cash",
          "currency": null,
          "state": "NOT_MEASURED",
          "value": null
        }
      ]
    }
  ]
}
```

## 5. `mt-finance_follow_up-10:1`

Архивный переход: `semantic_fail → insufficient_evidence`. JSON pointers: до `/rows/47`, после `/rows/47`. HTTP status до/после: `201/201`.

Запрос:

```text
Какая выручка на этой неделе. Ответь только после проверки данных.
```

Предыдущие failed assertions: `["requested_financial_owner_scope_unavailable_explained"]`. Предыдущие missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.
Новые failed assertions: `[]`. Новые missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `37bb80669e9060841d3672d5b6bda4b1c7019df622293e9e9481ee73d5b43e99` | `94ea009b8bc325b945c19d569ad8aaee13b0d80677e52b8e28446fcb67abe157` |
| actualResponseHash | `3c195f3bd082e4033ffc3d6f6191886694f4e1dfa9e4b4779b531bec3c47e08d` | `ec43a1f55d5beed470e213374b776888d4ac07e61f29df83f6c7f91bf7f14388` |
| actualAuditHash | `66423c884360a628e1a5184c661ac67d75d1b20fb9da55e3ee2c915c058804ac` | `c16e1575428601f09dfbf026dcfc12ee9eab2e8191434c83b018c14bcff0144f` |
| actualHistoryHash | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

Предыдущий фактический ответ (полностью):

```text
Оборот операций по данным CRM (не подтверждённая касса): не измерено. Подтверждённые начисления зарплаты: не измерено. Подтверждённые поступления: не измерено. Подтверждённые возвраты: не измерено. Чистая прибыль: не измерено. Чистую прибыль не подтверждаю: нужны подтверждённые поступления и возвраты, полная сопоставимая база расходов. Неизвестное не считаю нулём. Данные неполные; суммы относятся только к указанным источникам. Данные на 09.10.2026, 12:46:40,820 (UTC).
```

Новый фактический ответ (полностью):

```text
Фактический период источника: эту неделю. Текущие измерения по всему бизнесу. 05.10.2026, 00:00 GMT+3 — 09.10.2026, 16:36:05,375 GMT+3 (конец не включён; Europe/Moscow). Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём. Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части. Данные на 09.10.2026, 13:36:05,377 (UTC).
```

**Независимый verdict.** Сохраняю архивный insufficient_evidence, но не считаю его отсутствием любого READ. Фактический analytics.business.query существует, период и timezone совпадают с запросом; прежняя потеря периода исправлена. Запрошенное числовое значение выручки не получено. Честное NOT_MEASURED — безопасное поведение, но не выполненная пользовательская функция.

**Оставшаяся граница.** Есть одновременно продуктовая граница метрики, недостаток подтверждённых бизнес-данных в этом запуске и узкий oracle gap. В текущем MeasurementFinanceReader confirmed_cash/refunds/net_profit всегда создаются как null/NOT_MEASURED. Поэтому одного добавления синтетических чисел в fixture недостаточно, и booked_value нельзя переименовать в кассу. Нужен существующий разрешённый источник с доказанной семантикой метрики либо явное продуктовое ограничение. Этот аудит не разрешает новый источник/authority.

**Каноническое основание.** Measurement whole-result PARTIAL/VERIFIED совместим с отдельным confirmed_cash NOT_MEASURED. Текущий exactOwnerLimit в evaluator признаёт source-limit evidence только при whole-result UNAVAILABLE и !compare; наблюдённая форма PARTIAL не покрыта. Это объясняет missing assertion, но не превращает ответ в числовую выручку. Наличие только октябрьского опубликованного snapshot само по себе не доказывает невозможность live year/week query.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/measurement/measurement.finance.ts:518`](../../maya-saas-backend/src/measurement/measurement.finance.ts#L518), [`src/ai-tools/finance-period-binding.ts:10`](../../maya-saas-backend/src/ai-tools/finance-period-binding.ts#L10), [`src/ai-tools/finance-period-reply.ts:85`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L85), [`src/ai-tools/finance-period-reply.ts:122`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L122), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:2115`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L2115).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "finance.revenue",
      "entities": {
        "period": "week_to_date"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [
    "analytics.business.query"
  ],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "financialOwnerResults": [
    {
      "resolved_period": {
        "kind": "week_to_date",
        "from": "2026-10-04T21:00:00.000Z",
        "to": "2026-10-09T13:36:05.374Z",
        "label_ru": "эту неделю",
        "truncated_to_today": false
      },
      "period": {
        "from": "2026-10-04T21:00:00.000Z",
        "toExclusive": "2026-10-09T13:36:05.375Z",
        "timezone": "Europe/Moscow"
      },
      "mode": "live",
      "completeness": "PARTIAL",
      "qualification": "VERIFIED",
      "cash": [
        {
          "key": "confirmed_cash",
          "dimensions": {},
          "unit": "status",
          "basis": "confirmed_cash",
          "currency": null,
          "state": "NOT_MEASURED",
          "value": null
        }
      ]
    }
  ]
}
```

## 6. `mt-finance_follow_up-10:3`

Архивный переход: `semantic_fail → insufficient_evidence`. JSON pointers: до `/rows/49`, после `/rows/49`. HTTP status до/после: `201/201`.

Запрос:

```text
Сравни и объясни разницу
```

Предыдущие failed assertions: `["comparison_both_periods_addressed"]`. Предыдущие missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.
Новые failed assertions: `[]`. Новые missing assertions: `["requested_financial_owner_scope_unavailable_evidence"]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `c13ffd3f3c91999f512f104aef59395eba37a6acf43db7b811243f78df48ce05` | `2439f9e9daefcd19f5ed39e59763b924fa9fe3fe26c92b4f0320b8ae9d6c302b` |
| actualResponseHash | `7a1ec90400a19877815a66ebc8c7e5018c91ae1e5e98d4ff460db64493a1a030` | `b238d22863f2fba5ddbbbd51b0a8810461843cf1c407a8ee1bc3b88dbfab96d5` |
| actualAuditHash | `ca40accb85041d6a29292f61e372ba799027b18d25af5754c586570e17eb3429` | `01fa685c218dfe8d824cf5f1d559fc4d65a88fc58ddc6c60309d0f36232488eb` |
| actualHistoryHash | `0ce80682d76401ece7b5ded775b5342e3f71d4856b8e85bac756e7af89ae1a35` | `bf5753109177d856f7cf3f23e60cad48c637a8206a18209777759aeef373adf9` |

Предыдущий фактический ответ (полностью):

```text
Смотри, кратко за этот месяц: 1 записей против 0, 0 уникальных клиентов против 0. Изменение с предыдущим равным периодом: +1. Изменение с предыдущим равным периодом: 0. В доступных CRM-показателях нет подтверждённого снижения, поэтому конкретную причину просадки назвать нельзя.
```

Новый фактический ответ (полностью):

```text
Текущий период: Фактический период источника: эту неделю. Текущие измерения по всему бизнесу. 05.10.2026, 00:00 GMT+3 — 09.10.2026, 16:36:05,375 GMT+3 (конец не включён; Europe/Moscow). Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём. Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части. Данные на 09.10.2026, 13:36:05,377 (UTC).
Предыдущий период: Фактический период источника: прошлую неделю. Текущие измерения по всему бизнесу. 28.09.2026, 00:00 GMT+3 — 05.10.2026, 00:00 GMT+3 (конец не включён; Europe/Moscow). Подтверждённые поступления (выручка) не измерены; неизвестное не считаю нулём. Данные неполные или полнота покрытия не подтверждена; суммы относятся только к измеренной части. Данные на 09.10.2026, 13:36:05,640 (UTC).
Количественное сравнение не подтверждено: окна, валюты или полнота измерений несопоставимы. Причина изменения выручки не установлена.
```

**Независимый verdict.** Сохраняю архивный insufficient_evidence. В отличие от старого ответа оба запрошенных периода реально прочитаны и показаны; потеря comparison intent исправлена. Количественная разница и причинное объяснение не выполнены: оба current source results имеют confirmed_cash=null/NOT_MEASURED.

**Оставшаяся граница.** Это не только нехватка fixture. Текущий C7 producer не производит confirmed_cash, а comparator требует измеримые сопоставимые complete результаты. Даже будущая корректная числовая разница не докажет причину изменения. Для этих turns oracle также никогда не включает exactOwnerLimit из-за !compare; missing evidence нельзя читать как доказательство отсутствия двух READ.

**Каноническое основание.** Task сохраняет current period и comparison_period, выполняются два exact live C7 reads без автоматической подмены на предыдущий равный интервал. Formatter блокирует арифметику при некомплектных/неизмеренных данных и не утверждает причинность. Архивный missing_requested_source здесь отражает неполное покрытие evaluator форм результата, а не полное отсутствие owner evidence.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/measurement/measurement.finance.ts:518`](../../maya-saas-backend/src/measurement/measurement.finance.ts#L518), [`src/ai-tools/finance-period-binding.ts:44`](../../maya-saas-backend/src/ai-tools/finance-period-binding.ts#L44), [`src/ai-tools/finance-period-reply.ts:230`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L230), [`src/ai-tools/finance-period-reply.ts:248`](../../maya-saas-backend/src/ai-tools/finance-period-reply.ts#L248), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:2115`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L2115).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "finance.compare_periods",
      "entities": {
        "period": "week_to_date",
        "comparison_period": "last_week",
        "metric": "revenue"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [
    "analytics.business.query",
    "analytics.business.query"
  ],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "financialOwnerResults": [
    {
      "resolved_period": {
        "kind": "week_to_date",
        "from": "2026-10-04T21:00:00.000Z",
        "to": "2026-10-09T13:36:05.374Z",
        "label_ru": "эту неделю",
        "truncated_to_today": false
      },
      "period": {
        "from": "2026-10-04T21:00:00.000Z",
        "toExclusive": "2026-10-09T13:36:05.375Z",
        "timezone": "Europe/Moscow"
      },
      "mode": "live",
      "completeness": "PARTIAL",
      "qualification": "VERIFIED",
      "cash": [
        {
          "key": "confirmed_cash",
          "dimensions": {},
          "unit": "status",
          "basis": "confirmed_cash",
          "currency": null,
          "state": "NOT_MEASURED",
          "value": null
        }
      ]
    },
    {
      "resolved_period": {
        "kind": "last_week",
        "from": "2026-09-27T21:00:00.000Z",
        "to": "2026-10-04T20:59:59.999Z",
        "label_ru": "прошлую неделю",
        "truncated_to_today": false
      },
      "period": {
        "from": "2026-09-27T21:00:00.000Z",
        "toExclusive": "2026-10-04T21:00:00.000Z",
        "timezone": "Europe/Moscow"
      },
      "mode": "live",
      "completeness": "PARTIAL",
      "qualification": "VERIFIED",
      "cash": [
        {
          "key": "confirmed_cash",
          "dimensions": {},
          "unit": "money_minor",
          "basis": "confirmed_cash",
          "currency": "RUB",
          "state": "NOT_MEASURED",
          "value": null
        }
      ]
    }
  ]
}
```

## 7. `mt-retention_drill_down-0:2`

Архивный переход: `semantic_fail → unsupported`. JSON pointers: до `/rows/51`, после `/rows/51`. HTTP status до/после: `201/201`.

Запрос:

```text
А из них кто раньше ходил регулярно?
```

Предыдущие failed assertions: `["regularity_followup_addressed","requested_cohort_scope_explained"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `8fe57560bd1c8aba52814e3c47ae394650f94171e0e7d5fe27493e118ec49d18` | `fa1386d1d659518531930ac8219d083cc97918c58ced67298ef6eafec47ab0bc` |
| actualResponseHash | `a739f8351f884e7f92868fbd2fce70c28e574128bcb29e68311dd67d2521b792` | `bf5e3abbb236bd44e5674dec7a0c71b225b81b51ff66ac9076516c3ae7804cda` |
| actualAuditHash | `3b26e95ffab108fe75f73790cfc56e2c09ccc7d90c00bd5d7104e8d77b9f0064` | `8939c4d26babc4ef14608b894890ef3ed6e96dfa915b84ab1fb04bc6759f4a0e` |
| actualHistoryHash | `254a8634cf9154692dcb9d39840996056d8e62accc082da7ce09015e95a9cf24` | `5845f3da9f7ca4e0bb1295cb075e4c26778ed943628342a39726ac817247bfa6` |

Предыдущий фактический ответ (полностью):

```text
Не удалось определить выбранный вариант. Проверить до трёх опубликованных оценок давности визитов без дополнительных условий?
```

Новый фактический ответ (полностью):

```text
Отбор клиентов, отсутствующих более двух месяцев, этой проверкой не выполняется. Прежняя регулярность визитов этой проверкой не определяется. Могу проверить до трёх опубликованных оценок давности визитов по правилам бизнеса. Это не список клиентов; отдельно запрошенные период, филиал и порог такая проверка не учитывает. Выполнить эту ограниченную проверку без дополнительных условий?
```

**Независимый verdict.** unsupported корректен как ограничение выбранного C9/Lifecycle path; не подтверждаю выполнение пользовательского отбора. Улучшение — сохранены >2 месяца и регулярность, а видимая фраза объясняет именно эти ограничения вместо общего повторяющегося вопроса. Это настоящая поправка ответа, но не реализация когорты.

**Оставшаяся граница.** Fixture содержит правило >30 дней и одно подтверждённое посещение около 40 дней назад; она не доказывает отсутствие >2 месяцев или регулярность. Однако только fixture это не объясняет: singleLifecyclePlanState отправляет любые дополнительные entities в clarify, а canonical dormant reader игнорирует caller thresholds и возвращает policy signals. Нужна разрешённая продуктовая семантика/owner route для такого отбора; новое правило или broader source нельзя считать автоматически разрешёнными. В этом turn READ=0, поэтому иного возможного owner path запуск не проверил.

**Каноническое основание.** Скрипт теперь сохраняет period=more_than_two_months и previous_frequency=regular. Production helper даёт закрытое объяснение, canonical pending marker не расширен. Ни reply, ни thresholdDays=30 inventory не являются результатом запрошенного отбора.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/ai-tools/owner-review-plan.ts:26`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L26), [`src/ai-tools/owner-review-plan.ts:40`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L40), [`src/ai-tools/owner-review-plan.ts:91`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L91), [`src/ai-tools/ai-tool-handler.service.ts:867`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L867), [`test/widgets-live/support/core-full-offline-fixtures.ts:229`](../../maya-saas-backend/test/widgets-live/support/core-full-offline-fixtures.ts#L229), [`scripts/conversation-qualification/core-full-offline-model.mjs:470`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L470).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "clients.dormant_list",
      "entities": {
        "period": "more_than_two_months",
        "previous_frequency": "regular"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "actualC8Rule": [
    {
      "ruleKey": "barber_cadence",
      "ruleVersion": 1,
      "thresholdDays": 30,
      "comparison": "gt",
      "evidence": "proven_attendance"
    }
  ],
  "readPerformed": false
}
```

## 8. `mt-retention_drill_down-0:3`

Архивный переход: `semantic_fail → unsupported`. JSON pointers: до `/rows/52`, после `/rows/52`. HTTP status до/после: `201/201`.

Запрос:

```text
Кого из них лучше вернуть первыми?
```

Предыдущие failed assertions: `["ranking_followup_addressed","requested_cohort_scope_explained"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `8fe57560bd1c8aba52814e3c47ae394650f94171e0e7d5fe27493e118ec49d18` | `eb71085c6fc9f07db722e2fe16928f857a9ee1e2a12370bdbfab0ecbeb207aef` |
| actualResponseHash | `b0fe68b44b2e829a1a1c311c8518edef5aa9766183efe1f486e021e814ca5ec8` | `0a154ec789ab5994fd391b0028fef626753f6e2ab3e0f0c75c6f75a001d1d073` |
| actualAuditHash | `3b26e95ffab108fe75f73790cfc56e2c09ccc7d90c00bd5d7104e8d77b9f0064` | `003ad98311fec1e2d6af3a25d33223590cd61d2266a87fbdd6a001e16bdf3d0b` |
| actualHistoryHash | `4e75e2ea95ab233a75b6758801f483c4cbf4265d994c3f74379a6729f0409fb2` | `fc621eaa744dbf1b26f9e350306224e3b59951a65ca43b9aa4c85cfdeb1fc174` |

Предыдущий фактический ответ (полностью):

```text
Не удалось определить выбранный вариант. Проверить до трёх опубликованных оценок давности визитов без дополнительных условий?
```

Новый фактический ответ (полностью):

```text
Отбор клиентов, отсутствующих более двух месяцев, этой проверкой не выполняется. Прежняя регулярность визитов этой проверкой не определяется. Кого вернуть в первую очередь, по такой проверке определить нельзя: ранжирование не выполняется. Могу проверить до трёх опубликованных оценок давности визитов по правилам бизнеса. Это не список клиентов; отдельно запрошенные период, филиал и порог такая проверка не учитывает. Выполнить эту ограниченную проверку без дополнительных условий?
```

**Независимый verdict.** unsupported принимаю только для текущего запрошенного сценария >2 месяцев → регулярные → кого вернуть первым. Исчезла прежняя потеря приоритета: goal=return_priority и прежние условия сохранены, ответ прямо отказывает в ранжировании. Выбранный список и порядок возврата не получены.

**Оставшаяся граница.** Fixture rankingObjectives=[] и текущие C8 policy signals не дают приоритета. Это не доказательство отсутствия ranking во всём продукте: отдельный readHighValueClients и C8 RANKING owner существуют, но для этого запроса не были разрешены/вызваны и не доказывают return probability или право контакта. Следующая зависимость — точное разрешённое правило/цель и source evidence, затем существующий owner route. Подмена приоритета bool dormancy недопустима.

**Каноническое основание.** В фактическом semantic plan присутствуют period, previous_frequency и goal, но toolResults=[]; это сохранение предпочтений и честное ограничение, не canonical ranking result. Одно и то же безопасное объяснение в двух corpus variants не является двумя независимыми доказательствами поддержки ранжирования.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/ai-tools/owner-review-plan.ts:40`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L40), [`src/ai-tools/owner-review-plan.ts:91`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L91), [`src/ai-tools/ai-tool-handler.service.ts:867`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L867), [`src/ai-tools/ai-tool-handler.service.ts:885`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L885), [`test/widgets-live/support/current-candidate-sources.ts:400`](../../maya-saas-backend/test/widgets-live/support/current-candidate-sources.ts#L400), [`scripts/conversation-qualification/core-full-offline-model.mjs:470`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L470).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "clients.dormant_list",
      "entities": {
        "period": "more_than_two_months",
        "previous_frequency": "regular",
        "goal": "return_priority"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "actualC8Rule": [
    {
      "ruleKey": "barber_cadence",
      "ruleVersion": 1,
      "thresholdDays": 30,
      "comparison": "gt",
      "evidence": "proven_attendance"
    }
  ],
  "readPerformed": false
}
```

## 9. `mt-retention_drill_down-15:2`

Архивный переход: `semantic_fail → unsupported`. JSON pointers: до `/rows/54`, после `/rows/54`. HTTP status до/после: `201/201`.

Запрос:

```text
А из них кто раньше ходил регулярно?
```

Предыдущие failed assertions: `["regularity_followup_addressed","requested_cohort_scope_explained"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `8fe57560bd1c8aba52814e3c47ae394650f94171e0e7d5fe27493e118ec49d18` | `fa1386d1d659518531930ac8219d083cc97918c58ced67298ef6eafec47ab0bc` |
| actualResponseHash | `3646f2a0ca4af210d86aaba202516747f80cca2d19c870d8ec1c52553ac7209c` | `e40d1ce6dfac7cf6641f14ed2275c47d5e6f097bcb1cb0e32f12a1adc5ffa354` |
| actualAuditHash | `ddc1ca5b3010a8323ddf3c1d8a47e45e7c4465793057d6b7c621150fb5f5f4b1` | `43d0f552a370010343741d6aa80643527a2a31e3bba77a9849770eabe15c9e42` |
| actualHistoryHash | `254a8634cf9154692dcb9d39840996056d8e62accc082da7ce09015e95a9cf24` | `5845f3da9f7ca4e0bb1295cb075e4c26778ed943628342a39726ac817247bfa6` |

Предыдущий фактический ответ (полностью):

```text
Не удалось определить выбранный вариант. Проверить до трёх опубликованных оценок давности визитов без дополнительных условий?
```

Новый фактический ответ (полностью):

```text
Отбор клиентов, отсутствующих более двух месяцев, этой проверкой не выполняется. Прежняя регулярность визитов этой проверкой не определяется. Могу проверить до трёх опубликованных оценок давности визитов по правилам бизнеса. Это не список клиентов; отдельно запрошенные период, филиал и порог такая проверка не учитывает. Выполнить эту ограниченную проверку без дополнительных условий?
```

**Независимый verdict.** unsupported корректен как ограничение выбранного C9/Lifecycle path; не подтверждаю выполнение пользовательского отбора. Улучшение — сохранены >2 месяца и регулярность, а видимая фраза объясняет именно эти ограничения вместо общего повторяющегося вопроса. Это настоящая поправка ответа, но не реализация когорты.

**Оставшаяся граница.** Fixture содержит правило >30 дней и одно подтверждённое посещение около 40 дней назад; она не доказывает отсутствие >2 месяцев или регулярность. Однако только fixture это не объясняет: singleLifecyclePlanState отправляет любые дополнительные entities в clarify, а canonical dormant reader игнорирует caller thresholds и возвращает policy signals. Нужна разрешённая продуктовая семантика/owner route для такого отбора; новое правило или broader source нельзя считать автоматически разрешёнными. В этом turn READ=0, поэтому иного возможного owner path запуск не проверил.

**Каноническое основание.** Скрипт теперь сохраняет period=more_than_two_months и previous_frequency=regular. Production helper даёт закрытое объяснение, canonical pending marker не расширен. Ни reply, ни thresholdDays=30 inventory не являются результатом запрошенного отбора.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/ai-tools/owner-review-plan.ts:26`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L26), [`src/ai-tools/owner-review-plan.ts:40`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L40), [`src/ai-tools/owner-review-plan.ts:91`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L91), [`src/ai-tools/ai-tool-handler.service.ts:867`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L867), [`test/widgets-live/support/core-full-offline-fixtures.ts:229`](../../maya-saas-backend/test/widgets-live/support/core-full-offline-fixtures.ts#L229), [`scripts/conversation-qualification/core-full-offline-model.mjs:470`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L470).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "clients.dormant_list",
      "entities": {
        "period": "more_than_two_months",
        "previous_frequency": "regular"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "actualC8Rule": [
    {
      "ruleKey": "barber_cadence",
      "ruleVersion": 1,
      "thresholdDays": 30,
      "comparison": "gt",
      "evidence": "proven_attendance"
    }
  ],
  "readPerformed": false
}
```

## 10. `mt-retention_drill_down-15:3`

Архивный переход: `semantic_fail → unsupported`. JSON pointers: до `/rows/55`, после `/rows/55`. HTTP status до/после: `201/201`.

Запрос:

```text
Кого из них лучше вернуть первыми?
```

Предыдущие failed assertions: `["ranking_followup_addressed","requested_cohort_scope_explained"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `8fe57560bd1c8aba52814e3c47ae394650f94171e0e7d5fe27493e118ec49d18` | `eb71085c6fc9f07db722e2fe16928f857a9ee1e2a12370bdbfab0ecbeb207aef` |
| actualResponseHash | `d387767f3ed21aa346e406d3ec7592b3c99b4edbd6bc397df5c4d7f4ab46684f` | `9fdef5ad05bde14b56648a812607864e4b646b612e3e54c7491335762558dc6d` |
| actualAuditHash | `ddc1ca5b3010a8323ddf3c1d8a47e45e7c4465793057d6b7c621150fb5f5f4b1` | `4b83f23c833aab65423ec0ddb79c100976e01e21b478c48ba22ec8290ef23cf5` |
| actualHistoryHash | `4e75e2ea95ab233a75b6758801f483c4cbf4265d994c3f74379a6729f0409fb2` | `fc621eaa744dbf1b26f9e350306224e3b59951a65ca43b9aa4c85cfdeb1fc174` |

Предыдущий фактический ответ (полностью):

```text
Не удалось определить выбранный вариант. Проверить до трёх опубликованных оценок давности визитов без дополнительных условий?
```

Новый фактический ответ (полностью):

```text
Отбор клиентов, отсутствующих более двух месяцев, этой проверкой не выполняется. Прежняя регулярность визитов этой проверкой не определяется. Кого вернуть в первую очередь, по такой проверке определить нельзя: ранжирование не выполняется. Могу проверить до трёх опубликованных оценок давности визитов по правилам бизнеса. Это не список клиентов; отдельно запрошенные период, филиал и порог такая проверка не учитывает. Выполнить эту ограниченную проверку без дополнительных условий?
```

**Независимый verdict.** unsupported принимаю только для текущего запрошенного сценария >2 месяцев → регулярные → кого вернуть первым. Исчезла прежняя потеря приоритета: goal=return_priority и прежние условия сохранены, ответ прямо отказывает в ранжировании. Выбранный список и порядок возврата не получены.

**Оставшаяся граница.** Fixture rankingObjectives=[] и текущие C8 policy signals не дают приоритета. Это не доказательство отсутствия ranking во всём продукте: отдельный readHighValueClients и C8 RANKING owner существуют, но для этого запроса не были разрешены/вызваны и не доказывают return probability или право контакта. Следующая зависимость — точное разрешённое правило/цель и source evidence, затем существующий owner route. Подмена приоритета bool dormancy недопустима.

**Каноническое основание.** В фактическом semantic plan присутствуют period, previous_frequency и goal, но toolResults=[]; это сохранение предпочтений и честное ограничение, не canonical ranking result. Одно и то же безопасное объяснение в двух corpus variants не является двумя независимыми доказательствами поддержки ранжирования.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/ai-tools/owner-review-plan.ts:40`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L40), [`src/ai-tools/owner-review-plan.ts:91`](../../maya-saas-backend/src/ai-tools/owner-review-plan.ts#L91), [`src/ai-tools/ai-tool-handler.service.ts:867`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L867), [`src/ai-tools/ai-tool-handler.service.ts:885`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L885), [`test/widgets-live/support/current-candidate-sources.ts:400`](../../maya-saas-backend/test/widgets-live/support/current-candidate-sources.ts#L400), [`scripts/conversation-qualification/core-full-offline-model.mjs:470`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L470).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "clients.dormant_list",
      "entities": {
        "period": "more_than_two_months",
        "previous_frequency": "regular",
        "goal": "return_priority"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "actualC8Rule": [
    {
      "ruleKey": "barber_cadence",
      "ruleVersion": 1,
      "thresholdDays": 30,
      "comparison": "gt",
      "evidence": "proven_attendance"
    }
  ],
  "readPerformed": false
}
```

## 11. `mt-ambiguous_entity_resolution-15:1`

Архивный переход: `semantic_fail → insufficient_evidence`. JSON pointers: до `/rows/56`, после `/rows/56`. HTTP status до/после: `201/201`.

Запрос:

```text
Без догадок: кто записан к Саше на завтра. Ответь только после проверки данных.
```

Предыдущие failed assertions: `["requested_task_preserved","journal_not_roster"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `["journal_owner_resolution_observed"]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `f76c593d461a03069aabdf0d2d2fea7948e0507b9510c1d1a1868f1b0ad7e6be` | `54cfec11c45feb83760f2ab8f6f2941ccb34b8a3229a7b77c53cdf74a9c76375` |
| actualResponseHash | `7f752094e1b9c079883f17e261ad1d8b4ac310f79e4315f70a92087f8469117c` | `8b3fada4bcd424b9ba8dadeb7329a36ebd989427a6e3177b9d22fe5369a6d6d3` |
| actualAuditHash | `f21803c980a6d9786641869dfd167f9ff42cdd174cbef5c6ea64168b1dac797d` | `a66c27479d5eded482ca32894fc1d6e5b7b8094e33866f13c76648e0b63afa11` |
| actualHistoryHash | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

Предыдущий фактический ответ (полностью):

```text
Нужно выбрать одного специалиста: имя и филиал пока не дают подтверждённого однозначного соответствия.
```

Новый фактический ответ (полностью):

```text
Чтобы прочитать журнал записей, нужно выбрать одного специалиста: имя и филиал пока не дают подтверждённого однозначного соответствия.
```

**Независимый verdict.** insufficient_evidence обоснован. Исправлено несоответствие journal→roster в scripted plan: теперь operations.journal_day, tomorrow сохранён, staff.schedule.read не исполняется. Но ответ об отсутствии однозначного специалиста сформирован без operations.journal.read/current staff resolution. Нельзя из безопасной фразы вывести, что реальный owner проверил запрос.

**Оставшаяся граница.** В fixture действительно два Саши. Это основание для ограниченного синтетического сценария, но не observed owner resolution. Canonical readOperationsJournalDay уже существует и проверяет active staff по tenant перед getDayOperations. Отсутствие READ здесь означает незавершённую связь естественного запроса с этим владельцем/неполноту доказательства, а не что journal capability вообще не реализована. Реальная модель в этом прогоне не оценивалась.

**Каноническое основание.** actual semantic plan исправлен на журнал и содержит нужный день; toolResults=[] и journal_owner_resolution_observed отсутствует. Это подтверждённое исправление fixture/scripted intent, но положительный owner traversal не доказан.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`scripts/conversation-qualification/core-full-offline-model.mjs:482`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L482), [`test/widgets-live/support/core-full-offline-fixtures.ts:157`](../../maya-saas-backend/test/widgets-live/support/core-full-offline-fixtures.ts#L157), [`test/widgets-live/support/core-full-offline-fixtures.ts:236`](../../maya-saas-backend/test/widgets-live/support/core-full-offline-fixtures.ts#L236), [`src/ai-tools/ai-tool-handler.service.ts:1896`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L1896), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:2199`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L2199).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "operations.journal_day",
      "entities": {
        "employee": "sha256:d0fe3634c7cfdb0f9fa49295922e63219b676fb6385cc1133ee45f4594023333",
        "period": "2026-10-10"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "currentSyntheticStaff": [
    {
      "name": "Саша"
    },
    {
      "name": "Саша"
    }
  ],
  "readPerformed": false
}
```

## 12. `mt-ambiguous_entity_resolution-15:2`

Архивный переход: `semantic_fail → insufficient_evidence`. JSON pointers: до `/rows/57`, после `/rows/57`. HTTP status до/после: `201/201`.

Запрос:

```text
Про того, кто работает в «основной филиал»
```

Предыдущие failed assertions: `["requested_task_preserved","journal_not_roster"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `["journal_owner_resolution_observed"]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `f76c593d461a03069aabdf0d2d2fea7948e0507b9510c1d1a1868f1b0ad7e6be` | `54cfec11c45feb83760f2ab8f6f2941ccb34b8a3229a7b77c53cdf74a9c76375` |
| actualResponseHash | `a585c42b6edfad3b225e879e381101ef7a2d23dd7a08fdc4b9fb71ae9a647b51` | `93d52f29af4665df215b387b0320e8fb13da61af6d946dcb90a895955c1b22f0` |
| actualAuditHash | `2db07d3cbf77982f4f76000528b8d693e823eed42bc0beb9d764ff8f4aaeeddd` | `ccd5830dec7eed4a4e38cd10bb18aef93d25f27eae09f67b6f9f9eba160fe77a` |
| actualHistoryHash | `3b3493a9f0c72da2466049c4132ce6a119d338700fb3cdba1cf33754b81875d2` | `034b7f03525c87cced3f452fa98dfa2a76eb9dc31b3d0bba7e511d1d62bda008` |

Предыдущий фактический ответ (полностью):

```text
Нужно выбрать одного специалиста: имя и филиал пока не дают подтверждённого однозначного соответствия.
```

Новый фактический ответ (полностью):

```text
Чтобы прочитать журнал записей, нужно выбрать одного специалиста: имя и филиал пока не дают подтверждённого однозначного соответствия.
```

**Независимый verdict.** insufficient_evidence сохраняю. Branch correction реально присутствует в plan, однако второй ответ повторяет необходимость выбора специалиста без canonical source resolution. Пользовательская попытка разрешить неоднозначность не доведена до доказанного результата.

**Оставшаяся граница.** Есть два отдельных ограничения: external Practitioner fixture/contract не содержит staff-to-branch поля, и в turn нет вызова journal owner/current resolver. Поэтому нельзя ни автоматически выбрать Сашу, ни объявить по данным owner, что филиал точно не помогает. Требуется проверка существующей staff/branch source связи либо точное честное указание недоступного источника. Это product/observation gap, не готовность после перехода F→I.

**Каноническое основание.** В source facts есть два одинаково названных staff и нет branchName mapping; в task сохранён branch=основной филиал, но toolResults=[]; новых полномочий или выбора из одного предположения не возникло.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`scripts/conversation-qualification/core-full-offline-model.mjs:482`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L482), [`test/widgets-live/support/core-full-offline-fixtures.ts:236`](../../maya-saas-backend/test/widgets-live/support/core-full-offline-fixtures.ts#L236), [`src/ai-tools/ai-tool-handler.service.ts:1896`](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts#L1896), [`scripts/conversation-qualification/core-full-offline-assessment.mjs:2199`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-assessment.mjs#L2199).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "operations.journal_day",
      "entities": {
        "employee": "sha256:2bd6eb0a8a6f319df3c5563d6fbb5dc7d319c2b88c5a2c317e6a598d4b884197",
        "period": "2026-10-10",
        "branch": "основной филиал"
      },
      "depends_on": []
    }
  ],
  "actualReadTools": [],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "currentSyntheticStaff": [
    {
      "name": "Саша"
    },
    {
      "name": "Саша"
    }
  ],
  "readPerformed": false
}
```

## 13. `mt-cancel_pending_action-15:1`

Архивный переход: `semantic_fail → pass`. JSON pointers: до `/rows/61`, после `/rows/61`. HTTP status до/после: `201/201`.

Запрос:

```text
Без догадок: перенеси мою ближайшую запись на пятницу. Ответь только после проверки данных.
```

Предыдущие failed assertions: `["requested_task_preserved"]`. Предыдущие missing assertions: `[]`.
Новые failed assertions: `[]`. Новые missing assertions: `[]`.

| Binding | До | После |
|---|---|---|
| actualReplyHash | `ebb742b4698e75bde5f6c7255f157ba2befeac1243fcb5bd8c3716ecd7070913` | `4280b62564df4e4a24925fcd7de24c3f6acc37bd04228dd0c028754acb06c5b9` |
| actualResponseHash | `7c5eb5344505ac51143d467798b81c373241dab3a89f002b66610e4c4a93e631` | `a9e31ef4fe77f8509e89254eca7fec2259b95cb5a34704447ffc50d1d476bd69` |
| actualAuditHash | `e028cf64799b908ac2914efb8f65daaeabe7fdcffee8e023993f18d6fab0886b` | `c5117ee6da4e64522b11fab750c10ad46b222dd9df4912f3bea16ad6f00d6d58` |
| actualHistoryHash | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |

Предыдущий фактический ответ (полностью):

```text
В доступном списке 1 запись. Предстоящих: 1, отменённых: 0.
Ближайшие записи:
10.10.2026, 17:00 (Europe/Moscow) — часовой пояс отображения — настройка салона; филиал записи не указан — Мужская стрижка
Источник: ваши записи в MAYA.
```

Новый фактический ответ (полностью):

```text
В доступном списке 1 запись. Предстоящих: 1, отменённых: 0.
Ближайшие записи:
10.10.2026, 17:00 (Europe/Moscow) — часовой пояс отображения — настройка салона; филиал записи не указан — Мужская стрижка
Источник: ваши записи в MAYA.

Пожелание для переноса: пятница. Возможность переноса ещё не проверена. Для подготовки действия уточните запись, новое время. Подтверждённого результата выполнения пока нет.
```

**Независимый verdict.** Подтверждаю PASS исправления потерянной цели в подготовительном ответе: verified appointments.own.list сопровождается пожеланием Friday и просьбой выбрать запись/время. Ни одну запись не выбирают автоматически, даже когда список содержит одну. Это не PASS выполненного переноса или availability preview.

**Оставшаяся граница.** Потребуются явный выбор нужной собственной записи, допустимое время, current source/authority проверки, confirmation и канонический AE outcome. В этом turn action=null, business writes=0 в наблюдаемом периметре. Reviewer ранее написал personal-reschedule-preparation.ts/spec.ts; поэтому это независимая повторная проверка raw evidence/классификации, а не независимый code review собственного helper. Интеграция AiCore и общий сценарий требуют отдельного reviewer для заявления о независимой проверке реализации.

**Каноническое основание.** Scripted response теперь содержит два validated tasks own_list→reschedule_own с exact depends_on и new_date=friday. Helper принимает только этот порядок/permissions/ready/clarification shape, использует copied single-task view, не меняет plan; root подавляет selector trigger до READ. Actual persisted work — SETTLED appointments.own.list, без mutation receipt. Даты внутри tool audit сериализованы как {}, поэтому displayed instant дополнительно сверяется с отдельным sourceFacts.ownAppointments, а не с выдуманным восстановлением этих {}.

Source pointers (строки frozen runtime `49c37804`, до следующей разработки): [`src/ai-tools/personal-reschedule-preparation.ts:4`](../../maya-saas-backend/src/ai-tools/personal-reschedule-preparation.ts#L4), [`src/ai-tools/personal-reschedule-preparation.ts:9`](../../maya-saas-backend/src/ai-tools/personal-reschedule-preparation.ts#L9), [`src/ai-tools/ai-core.service.ts:2641`](../../maya-saas-backend/src/ai-tools/ai-core.service.ts#L2641), [`scripts/conversation-qualification/core-full-offline-model.mjs:495`](../../maya-saas-backend/scripts/conversation-qualification/core-full-offline-model.mjs#L495).

**Наблюдаемое evidence.**

```json
{
  "semanticTasks": [
    {
      "intent": "booking.list_own",
      "entities": {
        "period": "nearest"
      },
      "depends_on": []
    },
    {
      "intent": "booking.reschedule_own",
      "entities": {
        "new_date": "friday"
      },
      "depends_on": [
        "sha256:afca714ef6d2fc521c6b493ec42949fe74ddcd39c6bc3655daf90b3afa9faea1"
      ]
    }
  ],
  "actualReadTools": [
    "appointments.own.list"
  ],
  "effects": {
    "businessHashUnchanged": true,
    "businessWrites": [],
    "forbidden": [],
    "outboundCalls": 0
  },
  "sourceOwnAppointments": [
    {
      "start": "2026-10-10T14:00:00.000Z",
      "end": "2026-10-10T14:30:00.000Z",
      "status": "confirmed"
    }
  ],
  "observedAction": null,
  "persistedReadWork": [
    {
      "taskKey": "appointments.own.list",
      "state": "SETTLED",
      "resultHash": "e5dfbe7068d77a6510be5a12bf18f1309e1f1ebc76d383ff0187958629787929"
    }
  ]
}
```

## Общие пределы квалификации

Оба сравниваемых прогона имеют 81 фактический attempted turn (80 HTTP 201 и один отдельно ожидаемый auth 401), без пропущенных turns. До: 49 pass / 13 semantic_fail / 10 unsupported / 9 insufficient_evidence. После: 52 / 0 / 14 / 15. Рассматриваемые 13 строк дают ровно 3 / 4 / 6; у остальных 68 status сохранён. Новый terminal status — completed-with-semantic-limitations, exit 2. Нулевой semantic_fail не превращает 29 limited outcomes в выполненные функции.
После: 91 scripted model responses, upstream 0, paidAuthorized=false, credentialAdmission=false. Сохранённые reports подтверждают closed/absent шесть owned groups, broker closed, PG stopped и отсутствие postmaster.pid; отдельные процессы для этой проверки не запускались. По каждому из 13 audit: businessHashUnchanged=true, businessWrites=[], forbidden=[], outboundCalls=0 — это наблюдаемый периметр proof, не общий census любых возможных эффектов.
Синтетические ответы модели менялись между запусками, следовательно эти результаты не доказывают исправление настоящего распознавания естественного языка. Для journal и retention часть улучшения намеренно относится к scripted plan. Положительные owner READ/C9 paths оцениваются по actual receipts/source facts, не по одному тексту ответа.
Нет нового доказательства current React, процесса/PG restart, live CRM, paid model, C10, полного MAYA или корректности исторических интеграций. Первый owner-periods r1 и исходный baseline остаются самостоятельными неизменёнными архивами; данный документ не перекрашивает их. Frozen9/handoff, сайт, права, схемы и владельцы данных не менялись.
Заключение: evidence переходов согласовано; блокера целостности проверенного сравнения не найдено. Для продуктовой готовности остаются перечисленные capability/source и owner-resolution gaps. Считать все 13 функций исправленными по этому aggregate было бы неверно.
