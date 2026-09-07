# Package 5 — единый Owner Decision Pack: R05 / R06 / R08 / R09 / R11 / R12 / R13 / R14

**PROPOSAL — NOT APPROVED. Все восемь решений представлены для одного следующего owner response.** Combined baseline сертифицирован после исправления только двух R01 patch artifacts: [сертификация](CYCLE-06-PACKAGE-5-COMBINED-BASELINE-CERTIFICATION.md). Runtime/schema оставшихся packages не реализовывались.

Scope, blocker membership и dependencies взяты из [закрытого master inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md). Полные подготовленные sheets прочитаны, их SHA-256 проверены и сохранены в [machine-readable pack](evidence/package5-owner-decision-pack.json); их contracts и schema mappings не переписаны. Этот pack консолидирует выбор, а не изобретает девятый contract. Исторические STOP reports сохраняются; их execution hold разрешён новой certification.

Для **всего каждого package по рекомендованной A**: EXISTING FOUNDATION SUFFICIENT = NO; BUSINESS DECISION REQUIRED = YES; SCHEMA REQUIRED = YES; MIGRATION REQUIRED = YES; BACKFILL REQUIRED = NO; RUNTIME-ONLY = NO. Это не повторное approval уже утверждённых B36/B45/B48/B49/B53 subscopes. Option B в каждом sheet имеет нулевой schema/action delta и осознанно убирает спорную функцию. Option C не предложен.

NEW FIELDS означает физические DB columns, включая поля новых моделей. Виртуальные Prisma relations и constraints не считаются колонками. NEW ACTION CLASSES = AE + AC6; каждый AC6 cleanup scope утверждается явно, без расширения существующих generic delete permissions. Числа ниже — proposal, не выполненные изменения.

| Package | Blockers | Models | Fields | AE + AC6 = classes | Migration | Backfill |
| --- | --- | ---: | ---: | --- | --- | --- |
| R05 | B36, B43 | 0 | 0 | 0 + 0 = 0 | YES | NO |
| R06 | B44, B45, B48, B49 | 1 | 14 | 0 + 1 = 1 | YES | NO |
| R08 | B47 | 2 | 41 | 3 + 1 = 4 | YES | NO |
| R09 | B52 | 2 | 36 | 2 + 1 = 3 | YES | NO |
| R11 | B51, B59 | 1 | 12 | 2 + 1 = 3 | YES | NO |
| R12 | B53, B58 | 2 | 46 | 4 + 2 = 6 | YES | NO |
| R13 | B37 | 2 | 30 | 0 + 1 = 1 | YES | NO |
| R14 | B55 | 1 | 18 | 2 + 1 = 3 | YES | NO |
| **TOTAL A** | **14 blockers / 8 packages** | **11** | **197** | **13 + 8 = 21** | **8 proposals** | **0** |

197 columns = 188 в новых моделях + 9 nullable binding columns на existing ActionExecution. Общий Membership(id,tenantId) constraint создаётся один раз. R05 — forward CHECK extension при 0 новых columns/models, **не повторная B36 schema migration**.

## PACKAGE: R05

**BLOCKERS INCLUDED:** [B36, B43]. **CANONICAL OWNER:** OwnerReportsService / OwnerReportRun / existing A12 / Communication Delivery.

**RECOMMENDED OPTION: A.** Расширить существующий OwnerReportRun на два конечных вида morning_owner и morning_staff. Утренние owner/staff отчёты используют immutable manifest v2 и порядок INBOX → TELEGRAM → APNS; daily v1 не меняется. PDF — только авторизованный download сохранённого snapshot/static help.

**ALTERNATIVE OPTION(S): B.** Только daily B36: убрать все B43 non-daily доставки; сохранить разрешённые чтения и download daily/static help. 0 моделей / 0 полей / 0 classes; migration NO, backfill NO. Option C: NONE.

**WHY:** Сохраняются утренние отчёты и персональный Staff-срез через уже утверждённого владельца, без второго report/execution owner.

**WHAT USER/BUSINESS LOSES:** Отдельные legacy growth/director прогнозы и manager-only pushes прекращаются или сходятся в morning_owner. Нет arbitrary-period raw-SQL PDF и Telegram document send; finance в двух новых утренних видах исключён.

**Schema mapping:** Новых таблиц/колонок нет. Только forward CHECK extension: daily_report | morning_owner | morning_staff, reportVersion=1; существующие daily guards сохраняются. Encrypted manifest v2 — явный JSON contract, не колонка.

**Contract boundaries:** Текущий User + exact tenant Membership; staff-срез требует canonical Staff binding. daily_brief и действующая eligibility проверяются при admission/dispatch. План/контент/каналы заморожены; UNKNOWN или terminal failure блокирует следующие slots recipient без fallback. Payload 7 дней, audit horizon 365 дней; B36 cleanup owner сохраняется.

**Existing approval:** B36 runtime repair уже APPROVED; весь R05 требует только решения по B43. Сначала исправить/доказать B36 key и concurrent-write defects, затем принимать B43 extension.

**DEPENDENCIES:** R02; B43 contract/schema approval; B36 proof PASS before any extension acceptance. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R06, R08, R09, R11, R12, R13, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0 (0 AE + 0 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R05 Decision Sheet](package5-remainder-e3-r05-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R06

**BLOCKERS INCLUDED:** [B44, B45, B48, B49]. **CANONICAL OWNER:** Communication Delivery; exact producer owner; OperationalAlertRun proposed only for finite B44.

**RECOMMENDED OPTION: A.** Добавить OperationalAlertRun только для двух B44 occurrences: canonical shift reminder за 60/30 минут и notice о новом canonical ClientWantedSlotInterest. B44 v1 — INBOX ONLY. B45/B48/B49 сходятся к своим уже утверждённым владельцам и Communication Delivery.

**ALTERNATIVE OPTION(S): B.** Убрать всю B44 delivery; B45/B48/B49 всё равно исправляются по существующим contracts. Дополнительных моделей/полей/classes 0; migration NO, backfill NO. Option C: NONE.

**WHY:** Два полезных события уже имеют canonical source authority; новая запись хранит недостающий immutable occurrence/recipient plan, а AE/CD продолжают владеть попытками и outcome.

**WHAT USER/BUSINESS LOSES:** GOD/founder, dual-role, legacy hanging-lead, unresolved waitlist, community и native staff-request pushes прекращаются. Для двух сохранённых B44 notices нет Telegram/APNS/Web Push. Option B дополнительно убирает их Inbox notices.

**Schema mapping:** OperationalAlertRun: 12 columns; ActionExecution: operationalAlertRunId + operationalAlertSlotKey. 1 AC6 class purge_operational_alert_payloads; 0 AE classes. Exact tenant/source/slot FK, same-transaction complete admission, immutable plan.

**Contract boundaries:** Recipient — текущий canonical User/Membership/Staff scope; ClientWantedSlotInterest допускает Client без Maya User при exact Client/link/create-execution proof. Membership не означает Client consent. Shift first admission [due,due+5m), interest — только новые canonical rows в пределах 24h. UNKNOWN сохраняет исходный AE; partial resume не добавляет slots. Payload 7 дней с unresolved-work hold; tombstones минимум 365 дней, без automatic row purge.

**Existing approval:** B45/B48/B49 — уже утверждённая runtime convergence; новый owner/schema decision только для B44. OperationalAlertRun не заменяет B25/B35/A23/report/expense owners.

**DEPENDENCIES:** R01; R02; B44 contract/schema decision. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R08, R09, R11, R12, R13, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 1
NEW FIELDS: 14
NEW ACTION CLASSES: 1 (0 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R06 Decision Sheet](package5-remainder-e3-r06-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R08

**BLOCKERS INCLUDED:** [B47]. **CANONICAL OWNER:** Native feedback request/revision owner; existing A12/A13 Communication Delivery.

**RECOMMENDED OPTION: A.** Отдельные NativeFeedbackRequest и immutable NativeFeedbackRevision для private feedback exact Client/Appointment. Management явно запрашивает отзыв; verified Client отвечает, исправляет или отзывает ответ. B34 external BusinessReview не меняется.

**ALTERNATIVE OPTION(S): B.** Убрать first-party request scheduler/callback/comment/follow-up writes, сохранить historical storage и B34 imports. 0/0/0; migration NO, backfill NO. Option C: NONE.

**WHY:** External source review не доказывает Client/request authority и не имеет нужной correction history. Отдельный native owner сохраняет полезный feedback loop; AE/CD исполняют delivery.

**WHAT USER/BUSINESS LOSES:** Нет raw Telegram ratings, next-message comments и автоматических запросов из retired payment flow. Appointment без доказанного attendance=arrived, включая internal calendar, не eligible. Нет staff edits Client rating и cross-channel fallback.

**Schema mapping:** NativeFeedbackRequest: 22 columns; NativeFeedbackRevision: 16; ActionExecution: nativeFeedbackRequestId + nativeFeedbackRevisionId + nativeFeedbackSlotKey. AE: request_native_feedback, submit_native_feedback_revision, withdraw_native_feedback; AC6: purge_native_feedback_payloads.

**Contract boundaries:** Client без Maya User поддержан через verified binding. Earliest invite endAt+3h; response window 7 дней от later(admission,eligibleAt). Marketing consent/preferences нужны для invite: verified Client Telegram, иначе до 5 frozen Web Push endpoints, иначе no delivery. Management follow-up — Inbox only. SAME key changed intent → conflict; UNKNOWN блокирует следующие slots того же recipient, другие продолжаются. Payload 365 дней; no fake historical promotion.

**Existing approval:** Весь B47 owner/schema proposal пока NOT APPROVED. Внешние B34 imports и их authority остаются отдельными.

**DEPENDENCIES:** R01; R02; B47 owner/schema decision. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R06, R09, R11, R12, R13, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 2
NEW FIELDS: 41
NEW ACTION CLASSES: 4 (3 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R08 Decision Sheet](package5-remainder-e3-r08-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R09

**BLOCKERS INCLUDED:** [B52]. **CANONICAL OWNER:** Anonymous public source-fact acceptance and tenant moderation owner, distinct from Client and external review.

**RECOMMENDED OPTION: A.** PublicCommunityComment/Interaction как exact-tenant anonymous source facts; human moderation и human-approved brand reply через AE/ActionTargetMutation. Pending queue durable, без внешних notification slots.

**ALTERNATIVE OPTION(S): B.** Убрать comment/like/view и moderation mutations; оставить static editorial content. 0/0/0; migration NO, backfill NO. Option C: NONE.

**WHY:** Сохраняет публичное обсуждение, не превращая browser identity в verified Client или moderator. Existing AE уже хранит moderation history; второй moderation journal не нужен.

**WHAT USER/BUSINESS LOSES:** Нет AI auto-publication/automatic brand replies, owner Telegram alerts, anonymous self-edit/delete. Модерация ручная; старые недоказанные comments/counters не входят в новый canonical feed/counts.

**Schema mapping:** PublicCommunityComment: 21 columns; PublicCommunityInteraction: 15; existing-model columns 0. AE: moderate_public_community_comment, publish_public_community_reply; AC6: purge_public_community_payloads.

**Contract boundaries:** Verified gateway фиксирует tenant/allowed publication; guest всегда anonymous, с explicit publication consent и anti-abuse. Moderator — current exact-tenant management Member. Guest source uniqueness и moderator AE/CAS обеспечивают retry/concurrent winner; view — отдельный explicit request, read не пишет. Provider UNKNOWN/fanout не применимы: нет provider delivery. Payload 365 дней, retained tombstones; no historical backfill.

**Existing approval:** B52 — самостоятельное решение, не зависит от R08 feedback schema. Уже inventoried production-only Python modules и оба gateway остаются в scope.

**DEPENDENCIES:** R02; B52 owner/schema decision. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R06, R08, R11, R12, R13, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 2
NEW FIELDS: 36
NEW ACTION CLASSES: 3 (2 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R09 Decision Sheet](package5-remainder-e3-r09-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R11

**BLOCKERS INCLUDED:** [B51, B59]. **CANONICAL OWNER:** A22 governed configuration owner with distinct tenant-rule and personal staff-preference scopes.

**RECOMMENDED OPTION: A.** A22: immutable tenant business configuration revisions отдельно от personal staff Telegram mute в existing DashboardPreference. Tenant namespaces: business_rules, client_self_visit_history capability, staff_ai_provider из existing catalogue.

**ALTERNATIVE OPTION(S): B.** Убрать legacy rule/capability/provider-changing commands и /mute; оставить существующие canonical settings/reads. 0/0/0; migration NO, backfill NO. Option C: NONE.

**WHY:** Tenant guidance требует собственного canonical revision owner; personal preference уже имеет exact tenant/User storage. AiMemoryFact и global SQLite config не становятся tenant policy authority.

**WHAT USER/BUSINESS LOSES:** Нет founder-wide изменений чужих tenants и silent global provider fallback. До explicit config: rules empty, Client history OFF, provider-dependent tenant advice unavailable. Mute — только Telegram, максимум 24h; без mute других сотрудников/tenant.

**Schema mapping:** TenantBusinessConfigurationRevision: 12 columns; existing-model columns 0. AE: update_tenant_business_configuration, update_staff_notification_preferences; AC6: purge_superseded_business_configuration_payloads. Membership(id,tenantId) constraint — один общий, без новой колонки.

**Contract boundaries:** Tenant revisions подтверждает current tenant_owner/business_owner; personal mute — только сам current Member. /mute default120m, range1..1440m, off=null; absolute expiry фиксируется и не продлевается retry. Только registry auth/security exemptions; caller mandatory flag не работает. Secrets/platform credentials не управляются package. Ciphertext только superseded revisions старше365 дней; current revision не стирается.

**Existing approval:** B51/B59 — одно A22 package decision. Telegram eligibility интегрируется с consumers при общем cutover; не создаёт новую master dependency, не расширяет frozen plans и не возобновляет UNKNOWN.

**DEPENDENCIES:** R02; B51/B59 owner/schema decisions. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R06, R08, R09, R12, R13, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 1
NEW FIELDS: 12
NEW ACTION CLASSES: 3 (2 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R11 Decision Sheet](package5-remainder-e3-r11-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R12

**BLOCKERS INCLUDED:** [B53, B58]. **CANONICAL OWNER:** Tenant team-message/attachment lifecycle owner; B53 existing erasure retirement.

**RECOMMENDED OPTION: A.** Canonical team/main conversation с TeamMessage/TeamAttachment: own message withdrawal, private media, Inbox-only immutable notification plan. Reservation → quarantined chunks → canonical AE finalization → one-message attachment claim.

**ALTERNATIVE OPTION(S): B.** Убрать team send/delete/upload/fanout и /clear writes; не раскрывать unowned legacy private/media feed. 0/0/0; migration NO, backfill NO. Option C: NONE.

**WHY:** Сохраняет командное общение с receipt, не зависящим от notification success. Existing Membership задаёт team/main аудиторию; отдельные Conversation/slot/execution tables не нужны.

**WHAT USER/BUSINESS LOSES:** Нет automatic MAYA team replies, in-place edits и external Telegram/APNS/Web Push fanout. Старые unattributed messages/media не включаются в новый feed. Text доступен365 дней, media48h; withdrawal не обещает удалить уже полученные копии.

**Schema mapping:** TeamMessage: 22 columns; TeamAttachment: 22; ActionExecution: teamMessageId + teamMessageSlotKey. AE: send_team_message, withdraw_team_message, reserve_team_attachment, finalize_team_attachment; AC6: purge_team_message_payloads, purge_team_attachment_payloads.

**Contract boundaries:** Current exact-tenant permitted Member, включая User без Telegram. Reservation1h; final publish только executor, exact key/hash, никакого route/PHP publish/unlink. UNKNOWN finalize/send продолжает исходные AE/key; не удаляет и не публикует новый объект. Media48h от binding; current membership и lifetime проверяются при read без cleanup. New members могут читать retained team history, но не добавляются в old notification plans. Новый storage provider не выбирается.

**Existing approval:** B53 /clear retirement уже APPROVED по B23; только B58 требует нового решения. Storage executor использует existing surface; доказанный adapter gap позднее должен быть явно остановлен, без автоматического выбора нового provider.

**DEPENDENCIES:** R02; B58 owner/schema decision. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R06, R08, R09, R11, R13, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 2
NEW FIELDS: 46
NEW ACTION CLASSES: 6 (4 AE + 2 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R12 Decision Sheet](package5-remainder-e3-r12-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R13

**BLOCKERS INCLUDED:** [B37]. **CANONICAL OWNER:** P407 expense declaration owner plus durable reminder/reply intent owner; A13/CD and R10 own existing execution lifecycles.

**RECOMMENDED OPTION: A.** ExpenseReminderRun + минимальный ExpenseIntakeBinding: weekly Telegram reminder с opt-in; verified source event фиксирует bundle1..10 existing approval cards. Каждая подтверждённая Expense исполняется P407 через existing AI approval/R10 receipt.

**ALTERNATIVE OPTION(S): B.** Убрать weekly reminders, legacy /rashod intake и next-message interception; оставить canonical Expense UI/HTTP. 0/0/0; migration NO, backfill NO. Option C: NONE.

**WHY:** P407 уже владеет expense outcome, AE/CD — delivery. Недостаёт только weekly audience plan и неизменной source-event → approval связи; второго ledger/approval/execution owner не нужно.

**WHAT USER/BUSINESS LOSES:** Нет неподтверждённой записи из текста, date-wide replacement и arbitrary next-message capture. Telegram v1 — current owner/business-owner, explicit opt-in OFF по умолчанию, exact verified route; подтверждается каждая card. Частичный список не объявляется завершённым периодом.

**Schema mapping:** ExpenseReminderRun: 13 columns; ExpenseIntakeBinding: 15; ActionExecution: expenseReminderRunId + expenseReminderSlotKey. AE classes0; AC6: purge_expense_reminder_payloads. Existing A22 update_assistant_preferences получает allowlisted weekly_expense_reminders; это contract extension, не новая class/column.

**Contract boundaries:** Sunday20:00–21:00 tenant-local first admission, без catch-up; empty run замораживает пустую audience. Weekly identity не меняется от deploy/content version. Telegram UNKNOWN — тот же AE/reconciliation, без resend/fallback. Source replay читает original cards до parse; edited same event conflicts. Same-transaction complete bundle, per-card10min approval TTL; no auto period-complete. Reminder/intake audit horizon7лет минимум, не legal claim и не row-delete permission.

**Existing approval:** Новый B37 contract/schema proposal; P407 и R10 уже доступны. R11 personal Telegram mute учитывается как shared eligibility checkpoint, не как отдельная новая dependency.

**DEPENDENCIES:** R02; B37 owner/schema approval. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R06, R08, R09, R11, R12, R14 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 2
NEW FIELDS: 30
NEW ACTION CLASSES: 1 (0 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R13 Decision Sheet](package5-remainder-e3-r13-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## PACKAGE: R14

**BLOCKERS INCLUDED:** [B55]. **CANONICAL OWNER:** Proposed Cash Declaration owner over human observations; existing AE, separate from Expense/provider accounting.

**RECOMMENDED OPTION: A.** CashDeclaration — immutable human physical cash observation для exact tenant/Branch/day, с подтверждёнными correction/withdrawal и existing AE receipts. Это declaration, не cash-account/reconciliation subsystem.

**ALTERNATIVE OPTION(S): B.** Убрать /kassa, legacy cash_log writer и его report input; оставить provider revenue reads. 0/0/0; migration NO, backfill NO. Option C: NONE.

**WHY:** Без opening cash и полного movement/payment-method ledger нельзя достоверно вычислить cash reconciliation. Полезную человеческую observation можно сохранить без выдуманной бухгалтерской модели.

**WHAT USER/BUSINESS LOSES:** Нет второго legacy day_cash числа, false cash-minus-all-expenses comparison, automatic balance/profit/reconciliation claims. Явно подтверждаются branch/time/count; administrator без предложенных finance roles теряет native entry.

**Schema mapping:** CashDeclaration: 18 columns; existing-model columns0. AE: declare_cash_position, correct_cash_position (withdrawal — subcase); AC6: purge_cash_declaration_reason_payloads. Shared Membership constraint без новой колонки.

**Contract boundaries:** Current tenant_owner/business_owner/accountant + exact branch + cash-specific policy/confirmation; expenses.core только feature gate. RUB integer kopecks0..1e9, explicit non-future countedAt. Correction требует exact current predecessor и reason; withdrawal amount=NULL, не0. Concurrent initial/correction — один winner; lost DB receipt читается по тому же AE. Нет Expense/provider mutations. Reason retention7лет, остальная immutable history сохраняется.

**Existing approval:** B55 — самостоятельный finance owner decision; не зависит от R13 schema и не переиспользует Expense.create как cash authority.

**DEPENDENCIES:** R02; B55 owner/schema decision. Existing package prerequisites — production PASS; собственное owner/schema approval пока pending.

**CAN RUN IN PARALLEL WITH:** R05, R06, R08, R09, R11, R12, R13 — после approval выбранных options и с общей integration/cutover проверкой.

```text
EXISTING FOUNDATION SUFFICIENT: NO — whole package
NEW MODELS: 1
NEW FIELDS: 18
NEW ACTION CLASSES: 3 (2 AE + 1 AC6)
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
OWNER/SCHEMA APPROVAL: PENDING
```

Полный exact contract/fields/constraints/fingerprint/lifecycle/ratchets: [R14 Decision Sheet](package5-remainder-e3-r14-decision-sheet.md). Approval A включает именно этот неизменённый sheet, включая описанные ограничения и retention.

## B36 — сохранённый утверждённый статус

```text
B36 SCHEMA: ALREADY APPLIED
B36 RUNTIME: NOT DEPLOYED
B36 PROOF DEFECT: IDEMPOTENCY KEY
B36 PROOF DEFECT: CONCURRENT WRITE CONFLICT
B36 REPEAT SCHEMA MIGRATION: NO
```

B36 owner/schema/channel order уже APPROVED. R05 approval касается только описанного B43 extension/retirement; существующий daily contract повторно не выбирается. Внутри R05 B36 repair/proof проходит до acceptance B43. До выполнения следующего implementation cycle статус runtime остаётся NOT DEPLOYED.

## Рекомендуемый единый approval block — пока не утверждён

Ниже предлагаемый текст следующего owner response. Он охватывает contract, точную schema mapping, ограничения/retention и permanent ratchets каждого неизменённого linked sheet. Это рекомендация, **не полученное approval**; любой Option B должен быть выбран явно, а не как скрытый fallback во время реализации.

```text
R05: APPROVE A
R06: APPROVE A
R08: APPROVE A
R09: APPROVE A
R11: APPROVE A
R12: APPROVE A
R13: APPROVE A
R14: APPROVE A
```

## Минимальный план следующих production remediation waves

**Рекомендация: одна Wave R-C со всеми восемью packages после batch approval.** Master graph не содержит незавершённой package→package зависимости между этими восемью. R01/R02 и используемые R10/P407 foundations уже production PASS; owner/schema decisions — будущие условия, а B36→B43 — внутренняя последовательность одного R05. Историческое `canRunInParallel: NO` в inventory означало ожидание этих prerequisites и решений, а не вечный запрет одновременной реализации после их выполнения. Master inventory не изменён.

Одна wave не означает параллельные production migrations или восемь независимых deployments. Она объединяет независимую package-разработку и **один согласованный cutover**. Это минимальный план по текущему graph, условный на approvals и успешные proofs, а не обещание заранее обойти будущий доказанный blocker.

| Этап внутри R-C | Порядок и acceptance |
| --- | --- |
| 1. Зафиксировать owner choices | Восемь explicit choices; scopes/fields/classes/retention из sheets. Package-specific commits и владение общими schema/registry/Python/PHP hunks. Пока approval нет, implementation не стартует. |
| 2. Независимые local implementations | R05/R06/R08/R09/R11/R12/R13/R14 могут развиваться одновременно. R05 сначала доказывает B36 idempotency + concurrency + exact channel order, затем расширяет B43. Это не блокирует local work семи других packages. |
| 3. Общая интеграция | Один согласованный schema set: девять непересекающихся AE binding columns, Membership(id,tenantId) constraint один раз, exact tenant/owner FK и CHECKs; отдельные AE/CD/AC6 owners сохраняются. R06 protected Inbox/CD ingress тестируется со всеми новыми consumer manifests. R11 Telegram mute интегрируется с применимыми R05/R06/R13 путями; Inbox-only R06/R12 планы не получают Telegram. Shared Python/PHP variants компонуются из точного production base без потери чужих hunks. |
| 4. Package proof → wave proof | Каждый package закрывает всех своих blockers и оставляет permanent actual-source/alias ratchet. PostgreSQL constraints, concurrent/restart/UNKNOWN/lifecycle proofs на новых owned DB; clean migration replay и upgrade. Затем combined ratchets, lint, application + scripts typecheck, build, schema/pending-migration preflight и full mandatory backend regression. Любой mandatory FAIL запрещает cutover. |
| 5. Один coordinated cutover | По существующему documented deployment process: exact pushed release, baseline/health/readiness/schema preflight, доказанные migrations в согласованном порядке до зависимого runtime, backend + известные Python/PHP/PWA artifacts как один проверенный набор. Старый R01 PHP не восстанавливается; B36 WIP исключается из production до своего PASS. Никаких реальных messages/bookings/provider mutations ради smoke; только structural/read-only verification. Каждому package — отдельный production PASS. |
| 6. После всех 14/14 production PASS | Только тогда один полный Package 5 Final Gate 13/13 families. Его PASS ещё не означает Chapter 6 COMPLETE: Chapter 6 final completion/acceptance — отдельный cycle. Chapter 7 не начинать. |

Самостоятельные production waves R-D/R-E текущим dependency graph не требуются. Если будущая реализация докажет новый contract/schema gap или baseline divergence, действует установленный STOP; нельзя скрыто урезать Option A либо объявлять непрошедший package завершённым ради одной wave. Shared implementation детали существующих blockers не превращаются в новый discovery loop.

## Финальный статус этого checkpoint

```text
COMBINED BASELINE CERTIFIED: YES
PACKAGES COMPLETE: 6/14
PACKAGES REMAINING: 8/14
BLOCKERS REMEDIATED: 10/24
BLOCKERS REMAINING: 14/24
OWNER DECISIONS PRESENTED: 8/8
OWNER DECISIONS APPROVED: 0
PROPOSED REMEDIATION WAVES REMAINING: 1
WAVE R-C: R05, R06, R08, R09, R11, R12, R13, R14
WAVE R-D: NOT REQUIRED BY CURRENT GRAPH
WAVE R-E: NOT REQUIRED BY CURRENT GRAPH
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
R05–R14 RUNTIME/SCHEMA/MIGRATION IMPLEMENTATION: 0
PROCESS HYGIENE: 0
```

Main 24 dirty entries и 17 старых DB не тронуты. Все суммы описывают proposed future additions; ни одной из 11 моделей/197 колонок/21 classes в этом checkpoint не добавлено. Certification + pack + exact evidence → commit/push → STOP; HEAD/origin проверяются после push.
