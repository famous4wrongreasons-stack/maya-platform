# MAYA: единый ограниченный разговорный batch

**Единый batch реализован и проверен локальным HTTP-прогоном:** 9 сценариев,
17 ответов и одна явно пропущенная зависимая реплика после синтетического FAIL.
Внешних вызовов и бизнес-изменений нет. Это подготовка по запросу владельца
о полном автоматическом прогоне с одним вводом ключа.
Здесь «полный» означает все девять выбранных диагностических диалогов,
18 пользовательских реплик. Это не полный продуктовый acceptance MAYA.

Предыдущие два дефекта закрыты локально в
[corrective checkpoint](MAYA-RECORDED-DEFECTS-CHECKPOINT-20261009.md),
code/evidence `c6db033e02009bda523c393e65e45ba61c3bcefc`.
Исторический failed live A run остаётся неизменным:
`e8a6001019074dbed4b7669a211c9b568bcd6c46`.

## Исполнение и граница подготовки

Closed profile `core-union-20261009/1` использует существующие runner, broker,
проверку допуска и CandidateBudgetGate. Набор — точная упорядоченная конкатенация
A и B, без замены вопросов. Предлагаемый общий cap: 36 provider attempts,
$6 reservation и 30 минут; concurrency 1, spacing 6 секунд, request timeout
30 секунд, output до 2048 tokens за попытку. Лимит не обнуляется между диалогами.

Один broker получает один скрытый terminal input и держит ключ в памяти на весь
run. Runner ключ не получает. Existing broker ledger ограничивает provider
расход, existing runner ledger зеркалирует тот же профиль: два ledger-файла,
один логический cap. Это не две суммы разрешённого расхода. Подготовка создаёт
только manifest и plan; она не запускает broker/runner, не создаёт permit,
не читает ключ и не выполняет сетевой запрос. Запуск остаётся последовательностью
существующих broker и runner команд, без нового общего orchestrator.

Новый профиль требует отдельного свежего допуска, привязанного к его source,
manifest, limits и актуальному pricing evidence. Старые A/B grants закрыты
и неприменимы; повышение их лимитов или переиспользование claim не допускается.
`PREPARED_NOT_AUTHORIZED` и `NO_CREDENTIAL_OR_MODEL_CALL` остаются явными.

В batch обычный semantic FAIL сохраняет actual response и failed check IDs;
неисполненные зависимые реплики этого диалога отмечаются skipped. Следующий
независимый диалог начинается с новой conversation/history. Expected gold
никогда не подставляется вместо ответа. Недопустимый assessment, transport или
usage UNKNOWN, provider error, unsafe effect, privacy/source boundary failure,
budget/expiry/revocation и cleanup failure останавливают run целиком.
HTTP non-201 пока тоже глобальный STOP: безопасная отдельная классификация
known application errors этим checkpoint не добавляется.

Standalone live broker теперь проверяет usage по immutable serialized-body
reservation до передачи ответа приложению. Missing, inconsistent, over-reserve
usage и incomplete provider responses терминальны. Reservations не возвращаются;
после STOP нет retry/resume или второго бюджета. Batch не повторяет chat-запросы,
но существующие ограниченные model-stage retries остаются и расходуют общий cap
36 попыток. Safe semantic FAIL не должен
получать `passed-ungraded`; полный результат и coverage должны оставаться видны.

## Exact planned coverage

| Partition / case | Turns | Runtime question exercised |
| --- | ---: | --- |
| A `core-client-create-followup` | 2 | Booking availability → explicit17:00 preview and retained source choices. |
| A `core-owner-compound-clarification` | 2 | Unsupported today scope → explicit bounded acceptance → one C9/evidence/proposal, or recorded semantic failure. |
| A `core-admin-private-data-refusal` | 1 | Secrets/owner-contact refusal without unauthorized READ. |
| B `followup-client-carry-over` | 3 | Today → tomorrow → different staff, retaining service/context. |
| B `followup-client-entity-correction` | 2 | Change staff and time while retaining unchanged booking fields. |
| B `followup-admin-typo-ambiguous-period` | 1 | Ambiguous/contradictory period and typo clarification. |
| B `followup-owner-topic-switch` | 3 | Business overview → staff schedule → return to prior business topic. |
| B `followup-owner-compound` | 1 | One coherent bounded business + cancellation-window review. |
| B `followup-admin-general-chat` | 3 | General conversation/clarification/closure without fabricated business facts. |

This covers **development diagnostic** natural-language routing, current source qualification, persisted semantic follow-up, bounded C9 evidence and booking preview. It does not exercise booking commit/move/cancel, real YCLIENTS writes, restart, current React, voice, background C10, full agents acceptance or model quality on a held-out corpus. B has not yet been observed with the real model in the archived pilots.

## Cost arithmetic from archived pilots only

Sources in `docs/rebuild/evidence/`:

- `local-actual-model-20261008/terminal-outcome.json`: 3 provider responses; input49,674/output1,017; cache hits1,280/misses48,394; reserved$0.33911196; archived peak estimate$0.06796372 (off-peak$0.03398186).
- `local-ab-actual-20261009/summary.json`: 6 provider responses; input102,153/output1,784; cache hits18,304/misses83,849; reserved$0.7009398; archived peak estimate$0.118550696. B attempts0; six responses arose from five HTTP turns.

Pooled observed mean: 16,869.67 input +311.22 output tokens per provider response. Historical peak rates used in those artifacts: cache miss$1.32/M input, cache hit$0.044/M, output$3.96/M. These are **archived arithmetic**, not a current pricing verification or an actual invoice.

| Provider responses | Pooled token estimate input/output | Historical peak estimate using observed cache mix | Same token estimate with no cache hits |
| ---: | ---: | ---: | ---: |
| 18 (one per planned turn) | 303,654 /5,602 | $0.3730 | $0.4230 |
| 22 (rounded observed6/5 retry ratio applied to18) | 371,133 /6,847 | $0.4559 | $0.5170 |
| 36 (proposed hard attempt cap) | 607,308 /11,204 | $0.7461 | $0.8460 |

Normalizing the two pilots separately gives approximately **$0.36–0.41 for18 responses**, or **$0.71–0.82 for36**, at their archived peak/cache mix. B prompts, retries, zero-model paths and cache behavior are unobserved; these are planning estimates, not upper bounds or a spending authorization.

Reservation is intentionally larger than billed-token estimates: pooled historical reservation extrapolates to $2.0801 at18 responses, $4.1602 at36. At the absolute body/output bounds, each reservation is `(98,304+4,096)*1,320 +2,048*3,960 =143,278,080` nanoUSD, and36 such attempts reserve **$5.15801088**, within the proposed$6 cap. Never refund reservations based on usage and never claim reserved dollars were charged. A future admission still needs fresh exact pricing evidence under the existing contract.

## Ключ между повторными прогонами

[Отдельное исследование Keychain](MAYA-LOCAL-KEYCHAIN-PROPOSAL-20261009.md)
описывает одну локальную generic-password запись и явные enrollment/revocation.
Доступ к Keychain не реализован и не выполнялся. Минимальный reader остаётся
owner-managed same-UID удобством: общий Node или helper ACL не дают OS-гарантию
broker-only. Сохранение/чтение настоящего ключа — отдельное разрешённое действие,
не следствие этого документа.

## Проверка и deliverables

Runtime `6453923b5b3ba4c6b6593518673f8fdac8cc7dd5`; уточнение нового dataset
`c503cdcb83f110283863f2b21854051fe3034331`; final HTTP proof candidate
`e7703c77db47349e77291db616803a8ba6583262`.
Union dataset SHA256:
`2832b5837a1b01a4d0fe6e58f8c8811f318a7402ab2e7052ebb8a8a6f7b9c4ca`.
Cases SHA256 остаётся
`269fdb3331f2fa66b063a1e5c2be2922280f365101ca9cda1e0fa5056abce7e8`.

117 разных targeted Node tests прошли одним serial process; final metadata
повторно проверены 31 profile/admission тестом. Widgets-live types, scoped
ESLint и source diff-check PASS. Independent review нашёл слабый predicate
выбранного времени: теперь проверяются exact TIME_SLOT_SELECTOR, tenant,
provenance, review prompt и единственный slot с точным временем, timezone и
source references. Неподходящие receipt/time/tenant/source не получают PASS.
Также отказ live `/finish` больше не оставляет union success; ответ
`stopping:true` по-прежнему не доказывает завершение внешнего broker — для
будущего live run нужен его отдельный terminal report и OS cleanup check.

Actual AppModule/auth/AiCore/serializer/broker/PostgreSQL dry proof прошёл
на final candidate. Первый ответ сохранён буквально и отдельно помечен
`synthetic_dry_assertion_failure`. Его зависимая реплика не отправлялась;
все остальные восемь независимых cases выполнены с новой conversation.
Итого 17 HTTP 201, один skipped dependent, 16 ungraded ответов, ноль unresolved
и unexecuted. Итоговый `completed-with-semantic-failures` / exit 2 ожидаем
для этой проверки; это не подмена semantic FAIL успешной оценкой.
Provider usage UNKNOWN и другие terminal paths доказаны локальными fake-transport
и replay tests; они не были настоящими provider failures в HTTP-прогоне.
Пропущенный ход выбора 17:00 этим union dry не проверен; его exact receipt
predicate покрыт unit tests, а предыдущий recorded-response HTTP остаётся
отдельным доказательством. Current React и отдельный process/PG restart здесь
не выполнялись. Независимое review сверило сохранённые actual replies,
conversation binding, оба закрытых ledger и raw evidence.

Первый dry attempt на `c503cdcb` остановился до диалогов: закрытый Jest loader
не включал новый assessment helper. Его reports сохранены. В final candidate
добавлен только этот точный модуль; посторонний модуль по-прежнему отвергается.
Оба запуска остановили свои broker и PG. Отдельная OS-проверка подтверждает
отсутствие двух broker PIDs, всех 12 process groups и postmaster.pid; raw source
manifests каждого запуска проверены по 2471 SHA256 против соответствующего Git
commit. Dry broker использует TCP, не UNIX socket; socket removal этим proof
не заявляется. Реального ввода ключа, provider usage или live semantic качества
в этом прогоне не было.

[Evidence manifest](evidence/local-conversation-union-20261009/manifest.json),
[итог и ограничения](evidence/local-conversation-union-20261009/summary.json),
[HTTP report](evidence/local-conversation-union-20261009/dry-http/http-report.json),
[cleanup](evidence/local-conversation-union-20261009/cleanup.json).

После итогового commit подготовка отдельного inert manifest выполняется командой
`node scripts/conversation-qualification/core-local-prepare.mjs --prepare --profile core-union-20261009/1 --output /private/tmp/maya-union-prepared-20261009`.
Она привязывает будущий run к текущему чистому HEAD. Её `local-plan.json` содержит
две команды запуска broker/runner и placeholders свежего permit, а не готовое
разрешение. Чтение ключа/модели не требуется для подготовки. Archived dry manifest
не становится live authority и не используется как новый permit.

Новый платный вызов, действующий permit, Keychain enrollment, настоящий YCLIENTS,
рабочий сайт, production, push/merge/deploy не входят в эту подготовку.
