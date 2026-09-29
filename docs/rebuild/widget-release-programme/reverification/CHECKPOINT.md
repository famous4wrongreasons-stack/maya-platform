# SB-1 OTP re-verification — persistence decision checkpoint

Branch: `codex/widget-release-programme-20260929`.
Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/widget-release`.
Pass start: `54540cde208a5c8ced1418fae8b67fcb4519def4`.
Backend proof HEAD: `dc783dbf58118aeb38e2d1982fc1331793997cbe`.
Final documentation HEAD is recorded in the delivery receipt.

```yaml
SELF-BOOKING CONTRACT: BLOCKED
PERSONAL CONTEXT CONSUMER: IMPLEMENTED
REVERIFICATION CANDIDATE RESOLVER: IMPLEMENTED
STRICT EXISTING SMS ADAPTER: IMPLEMENTED
NEW VERIFIED BINDING PATH: BLOCKED
BLOCKER: FOUR IMMUTABLE JSON V2 CORRELATION MEMBERS — OWNER DECISION PENDING
FALSE CLAUSES: 18
EVIDENCE_MISSING: 11
IMPLEMENTATION_MISSING: 1
OWNER_DECISION_REQUIRED: 6
SAFE TO INTEGRATE: NO
```

## Выполнено

Решение Option B принято: fresh OTP на canonical channel exact Client, без authority из owner-роли, phone equality, Telegram login или revoked evidence. Дополнительная оговорка о VERIFIER TRANSPORT MISSING сохранена.

Код SMS.ru provider/path уже существует в Maya. Добавлен строгий entry существующего PhoneAuthDeliveryService: debug, SMSRU_TEST, unknown/unconfigured provider отказывают до отправки. Новый entry использует назначение Client verification и не раскрывает OTP/phone через provider errors/logs. Существующий phone-login путь сохраняет прежнее поведение. Реальные SMS не отправлялись; tests полностью подменяют network fetch. Production configuration/delivery не проверены.

Новый server-only candidate resolver использует authenticated User/tenant, существующую exact User/Client lineage, latest revoked maya_user episode, active session/membership и identity holds. Канал определяется по exact CRM provider/externalId через существующий registry owner. Нет phone-match выбора, User.phone fallback или caller-selected Client. Повторная проверка после provider read отказывает при изменении lineage. Channel HMAC покрывает tenant, Client, CRM source identity и телефон. Resolver ничего не записывает и не возвращает verified authority.

Не зарегистрированы новый HTTP endpoint, challenge issuer, OTP consumer или successor writer. Это завершённые независимые foundation units; они не считаются завершённым binding flow.

## Единственное новое решение

Текущий ClientLinkChallenge не сохраняет явную correlation User/channel/predecessor: fixed V1 JSON schema отвергает новые поля, initial outcome требует supersedesLinkId IS NULL.

Минимум: четыре immutable members внутри существующего issuanceEvidenceJson для отдельной V2:

- mayaUserId;
- mayaSubjectHash;
- verificationChannel {kind, crmLinkId, addressHash};
- predecessorLinkId.

Новых SQL-колонок или моделей не требуется. Они всё же являются дополнительными persistent correlation fields; поэтому исполнено ваше требование STOP до отдельного schema-решения. V1 не ослаблен; старые строки, revoked predecessor и migration files не изменены.

Реальный PostgreSQL design proof на временной копии действующих CHECK constraints подтвердил V1 positive и четыре extra-key refusals плюс V2 refusal. Весь proof — ROLLBACK; без persistent schema/identity writes. Это proof необходимости явного schema extension, а не proof успешного successor flow.

Точный packet: SCHEMA-DECISION.md. Статус всех 12 запрошенных successor proofs: REQUESTED-PROOF-STATUS.md. Happy successor, OTP comparison, replay/expiry и concurrent consume остаются BLOCKED и не объявлены выполненными.

## Проверки и widget work

- Полный backend: 576 suites, 5434 PASS, 0 FAIL, одна отдельно выделенная integration-only проверка.
- Candidate/strict transport + старый phone delivery: 45/45 PASS.
- Widgets live: 349/349 PASS.
- HTTP WR/SB1/E1: 8/8 PASS; built production-binary harness: 17/17 PASS.
- Source/decision audit self-tests: 32/32 PASS; lineage/mutation receipt tools: 47/47 PASS.
- Build, application/live/scripts typechecks и changed-source lint проходят; receipts сохранены.
- Integration-only check отдельно выполнен: ENOENT maya-chat-shell/dist/web. Assertion и Claude artifact/source не изменялись.

Свежие receipts привязаны к dc783dbf, а не перенесены со старого source HEAD. SBV — восемь целевых candidate/transport mutants; WR/H-harness/AB повторно проверяют widget create, provenance и action-boundary evidence. Полное количество/статусы и раскрытые filters записаны в verification.json. Это scoped local receipts, не новый full remote CI certificate; весь mutation inventory — 418 declarations / 35 batteries / 56 jobs.

Матрица полностью пересчитана из свежих source/evidence receipts. Условия закрытия оставшихся 18 clauses не изменились: 126 L, 4 L-T, 17 U, 18 false; strict gates 4/15, with U 7/15. Новых false-to-live promotions в этом проходе нет. FBE2E сохраняет 13 CLOSED / 6 PARTIAL / 9 OPEN.

## Оставшиеся blockers и изоляция

- Четыре JSON V2 correlation members: решение ожидается, persistent re-verification sub-unit STOP.
- G6-6/G13-R8: destination-owner receiving contract; отдельно от обычного booking.
- G8-3/G8-4/G8-5t/G8-DENY: canonical bounds/normalizer/text/deny owner/scope.
- 11 evidence gaps — полные non-draft, NAVIGATE, effect/tier и Gate-6/14 disagreement proofs; точные строки сохранены в CLAUSE-MATRIX.md и clause-disposition.json.
- 9.6: canonical persisted user-turn identity на интеграционном checkpoint; mirror writer отсутствует.
- AR-1: STOP, activation envelope NOT READY. widgets.runtime остаётся planned/fail-closed.
- Интеграционный artifact/acceptance и свежий remote CI отсутствуют. SAFE TO INTEGRATE: NO.

Commits: 8a23de66 — strict existing SMS adapter; dc783dbf — candidate resolver, targeted mutants и planner inventory.

Application edits только maya-saas-backend; documentation/evidence — Widget Release Programme. Полный список — FILES-TOUCHED.md. Ownership proof сравнивает весь branch delta с текущими committed/uncommitted Claude paths: overlap 0. Schema migration, production deploy/config/DB write, real OTP, real YCLIENTS effects, merge/cherry-pick/rebase Claude и Chapter 10: 0.
