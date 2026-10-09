# Следующий C8 calendar gap — read-only assessment

Qualification: **STATIC_SOURCE_ASSESSMENT_NOT_EXECUTED_NOT_ACCEPTANCE**.
Source: `602c9e257504abded8767297151e615808959fbf`. Все 23 finite source bindings сверены byte-for-byte с этим коммитом; SHA256 и Git blobs сохранены в соседнем JSON. Runtime, corpus, evaluator, reports не изменены. Тесты, сервисы, сеть не запускались.

## Рекомендуемый следующий шаг

Узко запретить несуществующее/неоднозначное локальное время в existing `c8ShiftWindow`, сохранив утверждённое wall-time/month-end поведение. Основание: `docs/rebuild/CYCLE-08-P01-FOUNDATION-IMPLEMENTATION.md:21`; exact elapsed/calendar evidence contract: `docs/rebuild/CYCLE-08-WAVE-2-VALUE-AND-PROSPECTIVE-TARGETS.md:11`; mapping `docs/rebuild/CYCLE-08-COMBINED-SCHEMA-MODEL-EVALUATION-MAPPING.md:274`.

`maya-saas-backend/src/valuation/c8.time.ts:44` принимает результат двух итераций `internal-calendar.utils.ts:62` без roundtrip/uniqueness проверки. `c8.deterministic.ts:150` непосредственно сравнивает t0 с этим deadline. Существующие тесты `c8.time.spec.ts:53` и `:60` явно покрывают только однозначный local noon.

Статические входы для последующего RED (не запускались):
- New York `2026-01-08T07:30:00Z + 2 calendar_month` → желаемое `2026-03-08 02:30`, которого нет.
- New York `2026-09-01T05:30:00Z + 2 calendar_month` → желаемое `2026-11-01 01:30`, имеющее два instant.

Нельзя автоматически выбирать сдвиг/offset. Безопасный исход — unsupported/unavailable с сохранением исторического результата, не новый boolean. Это hardening текущего owner chat; **ни один исходный ход81 этим отчётом не закрывается**.

## PENDING и уже опубликованные результаты

`c8.producer.ts:478–497` не переводит ошибку compute в unavailable. `c8.store.ts:714–721` откатывает failed compute; `c8.worker.ts:47–53` сохраняет PENDING. Простое добавление throw оставляет повторяемую работу. Для следующего исправления нужен только распознанный календарный domain error → существующий lease-fenced `publishUnavailable`; ошибки ACL/БД нельзя глотать. Existing reasons: `qualified_model_unavailable`, `required_evidence_unavailable`, `source_or_model_unavailable`. Calendar-specific code в просмотренном коде не найден; store проверяет синтаксис reason (`c8.store.ts:645–656`), не содержит новой схемы reason enum.

**Отказать уже опубликованному результату без recompute/записи можно на текущем READ.** В `c8.read.ts:199–218` уже проверяются refs и та же подтверждённая policy. Дополнительная проверка однозначности календарного отображения admitted `last_proven_visit_at` может вернуть current=false/parameters=null. Это не пересчитывает valuesJson. `c8.explanation.ts:9–39` скрывает values и добавляет existing `current_source_or_policy_unavailable`; `snapshotDormancy:575–590` отказывает `c8_result_unavailable`; `c9.lifecycle-source.ts:175–194` и final exposure `c9.orchestrator.ts:473–491` пользуются тем же reader. State/revision/snapshotHash исторической строки не меняются; publishUnavailable не вызывается для PUBLISHED.

Граница: только этого guard недостаточно для глобального обещания обо всех C8 consumers. Ranking indicator использует `c8Explanation(fact,true)` (`c8.read.ts:244`), Opportunity — `store.refsCurrent`; его recursive dependencies (`c8.store.ts:771–810`) пока проверяют refs/policy/population, а не корректность календарного отображения. Для claims по rank/opportunity нужен также конечный dependency guard. Новая policy version для read-time отказа не требуется; автоматическая replacement publication не предлагается.

## Исходные81: текущие blockers

Baseline score source `586c71779eb3743a318436e5316811375b3204af`: **57 PASS / 0 fail / 12 unsupported / 10 insufficient / 2 clarification_pending**, unclosed24. Никакой reclassification.

- Finance8: READ уже есть; `measurement.finance.ts:517–528` намеренно выдаёт confirmed_cash/refunds/net_profit NOT_MEASURED. Gross не подтверждает кассу.
- Retention6: исходные sourceFacts содержат 30-day policy. Exact2month path не даёт права подменить её; regularity/ranking требуют точных approved cohort/objective (`c8.policy.ts:121–175`, `c8.deterministic.ts:231–245`).
- Public-info2: recipe `core-full-offline-model.mjs:402–404` теряет branch при уже существующем product route `ai-core.service.ts:1471–1512`. Это input/harness gap, не новая доменная возможность.
- Journal2: старые fixture не доказывают canonical staff/source link; текущий owner уже подключён.
- Inventory2: `TenantCatalogItem` (`schema.prisma:1085–1116`) tenant-only, без branch/store mapping.
- Pricing2 вне скоупа; Reviews2 ожидают явного выбора оценки.

No schema, retention, autonomy, pricing, website, production, frozen9, handoff or credentials changes.
