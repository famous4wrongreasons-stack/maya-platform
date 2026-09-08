# Chapter 7 — Consolidated Owner Decision Pack

Status: **13/13 decisions presented; 0 approved in this preflight.**
Baseline: `9feff8db`, Chapter 6 complete; production `20260908-p5-rc-8bc03454` unchanged.
Companion: [Preflight and finite scope](CYCLE-07-PREFLIGHT-AND-SCOPE.md).

Это один пакет product/business choices перед реализацией. Он не повторяет approval для A18/Client, Action Engine, CD, B35, P4, A29 или завершённых R-C packages.
Вариант A рекомендуется в каждой строке; пользователь может утвердить их одним ответом либо указать отличия.
Альтернативы, меняющие конечный scope, требуют обновить Q/package manifest **до** начала implementation, не в конце главы.

**No schema proposal in this cycle.** Exact models/fields/actions and FK/retention mapping deliberately remain unchosen. После решения владельца нужен один combined exact schema/action assessment на всю главу; это не восемь/двенадцать последовательных product STOPs.
Runtime/schema/migration/production changes: **0**. No consent, expense, cash, team, community, feedback, provider or delivery effects.

## Decisions

## D01. Конечный scope Chapter 7 и граница consumers

**Packages:** P01, P02, P03, P04, P05, P06. **Requirements:** Q01, Q05, Q06, Q07, Q08, Q09, Q10, Q11, Q16, Q19, Q20.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Принять Q01–Q22 / P01–P06 как полный C7 scope: measured outcomes, финансовая семантика, earnings/goals, reputation facts и только их current consumers. Включить узкую C7 financial disclosure часть 4.2/4.20/4.26; сохранить deferred broader conversation/UX work Chapter 9. Уже закрытые источники/owners повторно не строить.

**Option B:** Сузить главу до action attribution; earnings/goals/reputation/financial carry-forward явно перенести новой owner-правкой canonical chapter plan. Это не позволяет объявить исходные C7 requirements выполненными.

**WHY:** §18/19 architecture gate и Phase A §9.3 прямо относят эти семьи к C7. Узкое только-attribution определение потеряло бы обязательные carry-forward items.

**WHAT USER/BUSINESS LOSES:** Нет новых специализированных агентов, общего redesign кабинета, новых CRM/provider интеграций или автономии в этой главе.

**Contract boundary:** C6 architecture is fixed; речь о C7 product scope, не новом approval для canonical Client/Action Engine/CD.

## D02. Что означает атрибуция и какую пользу можно заявлять

**Packages:** P01, P03. **Requirements:** Q02, Q12, Q13, Q14, Q15.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Публиковать подтверждённую цепочку approved action → effect receipt → exact Appointment/Client outcome как attribution under named deterministic rule. Одно business outcome получает один credit в агрегате. Несколько конкурирующих доказанных кандидатов без уникальной связи — ambiguous/unattributed, не guessed last-touch. Temporal/phone-only association показывать отдельно без зачёта «Maya вернула». Incremental/causal uplift не заявлять без отдельного валидированного measurement/valuation proof.

**Option B:** Показывать только observed outcomes без attribution credit даже при exact linkage; перенести весь attribution product в будущий scope и скорректировать C7 requirement.

**Option C:** Предложить отдельную multi-touch/experimental causal policy с business choice по weights/holdout. Она не следует из существующего старого marketing roadmap и увеличивает текущий scope.

**WHY:** Execution success не доказывает causal revenue; непротиворечивый exact lineage даёт проверяемую атрибуцию без обещания контрфактического эффекта.

**WHAT USER/BUSINESS LOSES:** Меньше эффектных «Maya заработала X» чисел: неоднозначный исторический контакт и неподтверждённая причинность не попадают в credited totals.

**Contract boundary:** Не менять A29 historical attribution assignment. Новое C7 измерение обязано явно указывать источник/правило/уровень доказательства; одного timestamp недостаточно.

## D03. Поздние отмены/возвраты и неизменность исторического отчёта

**Packages:** P01, P03. **Requirements:** Q04, Q12, Q18.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Разделить A29 attribution assignment, current measured outcome и immutable as-reported snapshot. Новое authoritative evidence отмены/возврата меняет текущую C7 оценку результата отдельной revision, даже если старый отчёт показывал успех. Frozen attributionWindowDays A29 не расширять и не менять его final assignment вне approved window. Старые source facts и snapshots сохраняются; без свежей доступной evidence показывать asOf/unknown, не «успех навсегда».

**Option B:** Публиковать только отчёты as-of без current-result view; late facts отражать только в новых периодах с явной пометкой. Для 7.1 пришлось бы сузить требование о текущей конверсии отдельным owner решением.

**WHY:** Так исправляется «навсегда конверсия» без заднего изменения источников и без повторного открытия approved A29 correction contract.

**WHAT USER/BUSINESS LOSES:** Итог старого отчёта и текущее значение могут отличаться; пользователь увидит причину/revision/asOf вместо одного постоянно зелёного числа.

**Contract boundary:** Никаких бесконечных provider polls. Новая authoritative evidence принимается только существующим owner; freshness/expiry measurement не разрешает новый external effect после UNKNOWN.

## D04. Деньги, возвраты, валюта и fiscal meaning

**Packages:** P01, P02, P03. **Requirements:** Q01, Q03, Q05, Q11.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Отдельные booked value, confirmed cash, confirmed refund и confirmed salary с явной валютой/периодом/полнотой. Net/outcome money публикуется только при доказанной полноте cash/refund/expense evidence для данного basis. Unknown finances_operation discriminator сохраняется в quarantine; отсутствие refund support не значит refunds=0. Currency totals раздельны, FX/conversion не вводить. A08/settlement/fiscal writers остаются disabled/outside scope.

**Option B:** Оставить C7 только операционные counts; денежные результаты всегда unavailable до отдельной finance-data главы. Потребуется явное переназначение денежных C7 carry-forward requirements.

**WHY:** Источник и полнота важнее приятного общего итога. Чтение финансового события не означает право исполнять платежи/фискальные операции.

**WHAT USER/BUSINESS LOSES:** При неполных provider данных нет certified net/recovered-money total, несмотря на известные отдельные оплаты. Нет автоматического FX и полноценной бухгалтерии.

**Contract boundary:** CashDeclaration — подтверждённое наблюдение физической наличности, не ledger. P4 value owners и источник зарплаты не заменяются финансовыми гипотезами.

## D05. Overlap расходов и импортные labels

**Packages:** P02. **Requirements:** Q06, Q11.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Учитывать exact durable source identity/linkage; никогда не дедуплицировать по похожим датам/суммам/именам. Неразрешённый overlap помечать отдельно и не выдавать итог как certified net. Принятый source raw category label сохранять как evidence, canonical category может оставаться «Прочее». Категории и сортировка раздельны по валюте. Нового автоматического CRM-import writer не включать.

**Option B:** Показывать каждый источник только отдельной книгой без combined net; explicit combined-report requirement перенести. Source import label и currency boundary всё равно обязательны.

**WHY:** Это сохраняет P407 authority и не выдаёт эвристическое слияние двух разных расходов за доказанный факт.

**WHAT USER/BUSINESS LOSES:** Пока нет exact source связи, Maya показывает ambiguity/раздельные суммы, а не автоматически «исправленный» расход или точную прибыль.

**Contract boundary:** Нет date-wide replacement, массового backfill, автоматической correction или нового finance executor.

## D06. Начисление мастера, personal configuration и месячные цели

**Packages:** P02, P04. **Requirements:** Q08, Q09.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Показывать только actual confirmed accrued salary; если нет допустимого зарплатного источника — not_measured. Удалить default 0.5 и fabricated monetary potential/upside из C7 measured output. Monthly revenue plan/fact считать детерминированно по existing A22 finance preference revision, exact owner/user/tenant configuration и verified Staff mapping; revenue target не превращать в salary target. Нет goal — нет progress. Staff видит только authorized own facts; owner-private target не становится автоматически tenant-global/staff-shared.

**Option B:** Сохранить старую мотивационную оценку только как явно не-measured legacy scenario, без смешивания с salary/plan fact; потребует отдельного утверждения метода и disclosures, не просто переименования default 0.5.

**Option C:** Новый commission/payroll/bonuses либо shared goal owner. Это расширяет C7 scope и потребует отдельного contract/schema mapping; сейчас не рекомендуется.

**WHY:** 4.22 прямо оставлен до owner decision. Actual salary, revenue и goal configuration — разные факты; исправление вложенного чтения не должно незаметно утвердить модель оплаты труда.

**WHAT USER/BUSINESS LOSES:** Исчезают недоказанные «можешь заработать» суммы; без verified salary/цели остаются факты и объяснение отсутствия, а не мотивационное денежное обещание.

**Contract boundary:** Existing A22 owner remains sole configuration writer. Прогнозный заработок/valuation — C8, персональный агент — C9.

## D07. Сравнение периодов и current incomplete day/month

**Packages:** P02, P06. **Requirements:** Q01, Q07, Q16.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Главный процент/вывод сравнения только для одинакового basis/currency/timezone и доказанно comparable complete windows. Для текущего MTD допустим equivalent elapsed interval предыдущего периода, если обе стороны полны именно по этим bounds; не сравнивать неполный текущий месяц с полным прошлым. Raw observed totals можно показать с completeness/asOf без inferred роста/падения. Период текста берётся из canonical fact, не provider day-label fallback.

**Option B:** Вообще отключить comparisons на открытых периодах; показывать только закрытые полные месяцы/дни. Более простой, но менее полезный отчёт.

**WHY:** Сравнение неполноты с полным периодом даёт ложные бизнес-выводы, даже когда арифметика технически верна.

**WHAT USER/BUSINESS LOSES:** При недостаточной coverage исчезают привычные проценты/рекомендации; значения остаются с указанием ограничения.

**Contract boundary:** Не создаёт новый reporting period owner и не переносит весь C9 разговорный UX в C7.

## D08. Reputation measurement и источники отзывов

**Packages:** P05. **Requirements:** Q10.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Считать counts/average/observed delta по canonical source-qualified review/NativeFeedback facts и tenant-local calendar month. Источники/шкалы/denominator и verified author/Appointment evidence показывать отдельно; anonymous community не превращать в verified Client review. Никакого автоматического reputation score или AI improving/declining как canonical факта. Изменение/withdrawal source учитывается current revision.

**Option B:** Только source-qualified списки/счётчики, без average/delta; сознательно меньшая аналитическая capability с сохранением source/timezone requirements.

**WHY:** B34/R08 уже решили authority. C7 нужен владелец измерения над их фактами, а не второй review writer или Reputation agent.

**WHAT USER/BUSINESS LOSES:** Нет единого красивого «индекса репутации», смешивающего несопоставимые/анонимные данные; нет auto-replies и auto-publication.

**Contract boundary:** Invitation/marketing consent rules R08 не меняются. Сбор отзывов и provider mutations не добавляются.

## D09. Видимость Client facts, prompts и exports

**Packages:** P01, P06. **Requirements:** Q02, Q16, Q17, Q21.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Сохранить текущие exact-role/tenant/branch/Staff finance/read entitlements без автоматического расширения. Owner/admin видит только разрешённые facts; Manager не получает finance access из-за нового отчёта; Staff только own scope. В LLM — минимальный authorized fact envelope без raw identifying Client data. Existing admitted OwnerReport snapshot download разрешён по его текущему contract; массового contact-list/PDF export в C7 нет. Tenant audit read Q21 — только TENANT_OWNER/BUSINESS_OWNER текущего tenant, scope=tenant, safe metadata allowlist, bounded pagination/time window; platform rows и raw payloads не выдавать.

**Option B:** Добавить contact-list/manual-call export сейчас: отдельные approved purpose, recipient, exact Client fields, expiration/download audit и retention должны быть выбраны до schema mapping. Это увеличит scope/packages; generic PDF authority использовать нельзя.

**WHY:** Текущий downloadable report не даёт права на экспорт базы клиентов. Этот выбор сохраняет C6 privacy/authority и позволяет не смешивать measurement с новой рассылкой/контактной базой.

**WHAT USER/BUSINESS LOSES:** В C7 не появится готовый файл телефонов для обзвона; будут permitted факты и существующие snapshot reports.

**Contract boundary:** Scoring/audience/owner approval ≠ consent. Revoked access проверяется текущим owner, исторический report не даёт вечного права на чтение.

## D10. Lifetime новых derived measurement facts

**Packages:** P01, P06. **Requirements:** Q04, Q17, Q18.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Предложить 365 дней для новых source-minimized derived measurement revisions/drill-down evidence с момента их admission; retry срок не продлевает. Сохранять только необходимые qualified refs, rule/version, measured values, basis/asOf и audit, не копировать контакты/тексты/raw provider payloads. По истечении — удалить/минимизировать только эти новые derived artifacts через явно approved retention owner; источник и immutable source/security/financial/execution/consent history не затрагивать. Исторический report вне доступной evidence не выдавать за current verified.

**Option B:** 90 дней для новых derived artifacts; меньше данных и проще lifecycle, но нет годового drill-down. Источники и их собственные retention rules остаются теми же.

**Option C:** On-demand non-durable calculations only, без сохранения as-reported measurement revisions. Это не выполняет recommended durable audit/restart contract без пересмотра требований.

**WHY:** Нужен конечный, проверяемый lifecycle до добавления measurement persistence. 365 дней — предлагаемая продуктовая политика, **не утверждённый закон/универсальный default и не перенос C5 180-day planning ceiling**.

**WHAT USER/BUSINESS LOSES:** Новые C7 детальные measurement traces не хранятся бессрочно; старые source-owned финансовые/аудитные records продолжают жить по своим approved policies.

**Contract boundary:** Это business retention decision, не схема. Exact AC6/action mapping, holds, tenant deletion и связанные FK must be assessed before schema approval; ни один существующий retention contract не расширяется автоматически.

## D11. Historical admission, refresh и publication

**Packages:** P01, P03, P06. **Requirements:** Q02, Q04, Q12, Q18, Q20.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Новый evidence-linked measurement contract вводить prospectively от согласованного cutover. Исторические данные можно читать как source-labelled/asOf facts, но не придумывать Client/Opportunity/AE/CD lineage и не backfill-ить causal credit. Пересчёт только по admitted existing source observations и bounded permitted reads; future projection consumer работает в existing backend/worker boundary с durable checkpoints. Read endpoint не создаёт новую business command; нового scheduled marketing/report fanout или provider polling cadence не вводить.

**Option B:** До запуска дополнительно сертифицировать ограниченный historical dataset отдельным evidence contract. Если исходная связь недоказуема, attribution unavailable; это более длинная подготовка, не разрешение на эвристический backfill.

**WHY:** У существующих Recovery records нет полного нового lineage. Миграция не должна превращать старую корреляцию в доказанную причинность, а refresh — в новый sender.

**WHAT USER/BUSINESS LOSES:** Нельзя обещать полный «Maya recovered» baseline за прошлые годы; некоторые historical outcomes останутся observed/unattributed.

**Contract boundary:** Existing approved A29 facts/corrections and immutable history сохраняются. Exact current freshness/asOf disclosure требуется; отсутствие нового события не доказывает, что бизнес-состояние не менялось.

## D12. Placement сценария loyal/dormant >2 months и PushSMS

**Packages:** P01, P03, P06. **Requirements:** Q02, Q12, Q16, Q20.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** Зафиксировать split: C7 factual evidence/results; C8 value/CLV/prediction/ranking; C9 end-to-end owner strategy interaction and new initiator over existing approval/bulk/CD; C10 autonomous recurring execution. Existing registry threshold >=3 visits и calendar-month counts остаются source-labelled legacy read definitions, не становятся новым canonical loyalty/value rule. Ни нового >2-month threshold, ни нового contact export, ни PushSMS adapter в C7.

**Option B:** Внести сейчас новый deterministic return-client workflow в C7 (например, explicitly chosen attendance/frequency ranking и owner review list); сначала дополнить product threshold, tie-breakers, permission/retention и package/surface manifest. Это отдельное расширение scope, не скрытый reuse.

**WHY:** C6 handoff explicitly оставил продуктовую стратегию будущим главам. Части уже существуют, но complete flow не принадлежит одному текущему C7 requirement.

**WHAT USER/BUSINESS LOSES:** После C7 ещё не появится весь путь «сам выбрал ценных, предложил стратегию и запустил кампанию/выдал телефоны». Foundation этому пути не препятствует.

**Contract boundary:** Два календарных месяца ≠ автоматически 60 дней; unknown date не dormant; ranking не consent. У PushSMS нет exact assigned numbered chapter: нужен отдельный integration/provider/policy/cost/approval/UNKNOWN contract.

## D13. Early Chapter1 bridge carry-forward: measurement admission vs credential migration

**Packages:** P01, P03, P06. **Requirements:** Q02, Q12, Q22.

**RECOMMENDED OPTION: A. STATUS: PENDING.**

**Option A:** В C7 принимать для credited measurement только independently proved tenant/integration/action/Client lineage. Existing server-bound integration guard и immutable execution evidence reusable; bare platform bridge secret плюс body/slug source недостаточны. Legacy observation может остаться source-labelled evidence без credit; не менять его historical A29 fact. Полную per-tenant credential issuance/rotation и body-signing migration явно оставить отдельным security prerequisite before L3 (последующее назначение architecture gate), не считать выполненной C7.

**Option B:** Включить полную multi-tenant bridge credential/body-signing migration в C7. Потребуются отдельные auth/security business/schema mapping и credential cutover, дополнительные proof requirements; оценку 6 packages/4 waves нужно пересчитать до implementation.

**WHY:** Chapter1 оставила 2/7 carry-forward, architecture gate требует более сильный bridge до L3. Этот пункт нельзя потерять или объявить закрытым из-за наличия общего секрета; одновременно нет основания переоткрывать уже certified C6 runtime как новый regression.

**WHAT USER/BUSINESS LOSES:** Некоторые legacy recovery observations не дадут нового C7 credited result, пока нет independently proved lineage. C7 не обещает готовность всех старых мостов к multi-tenant L3.

**Contract boundary:** Existing C6 mutation initiators retain their exact server-bound integration/tenant checks. No fake Client binding, new secret distribution, direct source writer or historical revocation in this preflight.

## Package/decision dependency summary

| Package | Decisions needed before exact mapping/implementation |
| --- | --- |
| P01 measurement/evidence foundation | D01–D04, D09–D13 |
| P02 financial/period/expense/value facts | D01, D04–D07 |
| P03 outcome/attribution/funnel | D01–D04, D10–D13 |
| P04 actual earnings/goals | D01, D06–D07, D09 |
| P05 reputation aggregates | D01, D08–D10 |
| P06 consumers and acceptance | All D01–D13 as applicable to inherited fact contracts |

Shared D07/D09/D10 apply to every consumer even when its producer package is not named as the decision owner.
Recommended implementation DAG: Wave 1 P01 → Wave 2 P02+P05 → Wave 3 P03+P04 → Wave 4 P06/combined gate. One coordinated production cutover after all packages and schema integration pass; no business effects for acceptance proof.

## Recommended approval block — NOT YET APPROVED

The block is proposed wording for the owner's next response, not an instruction to execute now:

```text
CHAPTER 7 PRODUCT/SCOPE DECISIONS:
D01: APPROVE A
D02: APPROVE A
D03: APPROVE A
D04: APPROVE A
D05: APPROVE A
D06: APPROVE A
D07: APPROVE A
D08: APPROVE A
D09: APPROVE A
D10: APPROVE A — 365 DAYS FOR NEW DERIVED MEASUREMENT ARTIFACTS ONLY
D11: APPROVE A
D12: APPROVE A
D13: APPROVE A — QUALIFIED MEASUREMENT ONLY; BROADER BRIDGE CREDENTIAL MIGRATION BEFORE L3

CHAPTER 7 SCOPE: Q01–Q22
EXPECTED IMPLEMENTATION PACKAGES: P01–P06
EXPECTED IMPLEMENTATION WAVES: 4
NEXT STEP: ONE EXACT COMBINED SCHEMA/ACTION ASSESSMENT
SCHEMA/ACTION MAPPING APPROVED BY THIS BLOCK: NO
RUNTIME IMPLEMENTATION AUTHORIZED BY THIS BLOCK: NO
CHAPTER 6 CONTRACTS REOPENED: NO
```

All currently known product decisions are presented together. A real contradiction discovered while mapping requires a precise delta; routine technical naming, FK/index conventions or implementation defects are not new owner product decisions.
The mapping must declare all required models/physical fields/action/AC6 classes and integration constraints before approval; this report deliberately does not choose a schema on the owner's behalf.

```text
OWNER DECISIONS PRESENTED: 13/13
OWNER DECISIONS APPROVED IN THIS CYCLE: 0
SCHEMA PROPOSALS CREATED: 0
CHAPTER 7 IMPLEMENTATION STARTED: NO
PRODUCTION MUTATIONS: 0
```

Docs/evidence → commit/push → **STOP**.
