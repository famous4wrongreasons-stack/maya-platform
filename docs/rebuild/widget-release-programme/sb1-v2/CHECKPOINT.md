# SB-1 JSON V2 — checkpoint

Механизм повторной верификации реализован и проверен локально. Production owner не переверифицирован; реальный OTP не отправлялся.

```yaml
SELF-BOOKING CONTRACT: IMPLEMENTED
NEW VERIFIED BINDING PATH: READY
JSON V2: PASS
SUCCESSOR PROOFS: 12/12
FALSE CLAUSES: 18
EVIDENCE_MISSING: 11
IMPLEMENTATION_MISSING: 1
OWNER_DECISION_REQUIRED: 6
SAFE TO INTEGRATE: NO
```

Branch: `codex/widget-release-programme-20260929`.
Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/widget-release`.
Verification source HEAD: `c94c751ca58342fc7ebf6f83cdec7bc16dd6c3ee`. Последующий documentation-only HEAD записан в outputs `DELIVERY.json`.

## Что реализовано

Authenticated User + tenant → canonical exact Client/CRM channel → strict SMS.ru OTP → immutable JSON V2 → atomic successor ClientChannelLink → явно выбранный personal-client context. TENANT_OWNER != CLIENT; CLIENT_ROLES не расширен. V1 остаётся неизменным. Client/predecessor/channel не принимаются как caller authority. Revoked predecessor не меняется и не реактивируется. Proof ограничен и OTP TTL, и сроком текущей сессии. Actual User/session/membership/business role сохраняются в audit.

Использованы существующие ClientLinkChallenge, ClientChannelLink, AuthRateLimitBucket и SMS.ru adapter. Новых моделей и SQL columns: 0. Подготовлена одна guard-only migration; применена только на двух принадлежащих этому заданию локальных proof-базах. На production она не применялась.

## Проверки

- Backend: 578 suites, 5458 PASS, 0 FAIL; один integration-only тест исключён этим отдельным профилем.
- Widgets-live: 26 suites, 368 PASS. Включены все 12 successor proofs и дополнительные JSON/V1/channel/session/rate-limit/delivery/HTTP проверки.
- HTTP release evidence: 8/8 PASS; built backend BIN: 17/17 PASS.
- Targeted mutations: 77/77 as declared, green controls, 0 mismatches. SV2 13, SBV 8, SB1 10, WR 23, H-harness 21, AB 2.
- V2 mutation receipt сохраняет реальный target `eb200c98f5e9ca47ec5b3eca9b541a2f9512b81b`; единственный последующий backend delta — тест точного числа одобренных миграций. Runtime, V2 tests и battery bytes неизменны. Остальные receipts привязаны к текущему source HEAD.
- Build, application/live/scripts typechecks, changed-source lint: PASS. Receipt/lineage selftests 47; audit selftests 32. Contract checker 31/31, 4 ранее раскрытых pending checks следующего пакета.
- Свежая пустая proof-база прошла обычную цепочку из 100 миграций; ClientLinkChallenge сохранил 14 SQL columns и V1 lifecycle guard.
- Отдельно выполнен INTEGRATION-ONLY CHECK: отсутствует `maya-chat-shell/dist/web`. Claude artifact не копировался; assertion сохранён. Это не backend failure. Fresh remote CI не запускался; scoped receipts не выдаются за полный remote certificate.

Первый full regression обнаружил устаревшее ожидание 99 миграций. Исправление допускает ровно одобренную V2 migration, сохраняет прежние 99 и три widget migrations, запрещает в extension новые таблицы/колонки/Widget tables. Итоговый regression переснят после исправления.

## Матрица и оставшиеся blockers

Полная матрица пересчитана из свежих HTTP/BIN/provenance/mutation receipts: 165 clauses; 126 L, 4 L-T, 17 U, 18 false. Strict gates 4/15, with U 7/15. Programme: 31 → 18; этот проход: 18 → 18. SB-1 identity proof не заменяет widget evidence. FBE2E: 13 CLOSED / 6 PARTIAL / 9 OPEN.

OD-3 A / OD-4 B / OD-5 B: APPROVED. SB-1 и JSON V2 не требуют нового owner/schema решения для реализованного механизма.

Exact remaining blockers:

1. 9.6: один canonical persisted user-turn identity на Claude+Codex integration checkpoint. No mirror writer. Combined carrier artifact/transport acceptance и fresh CI ещё не выполнены в этой ветке.
2. G6-6 / G13-R8: STOP до destination-specific receiving authority contract. Не блокирует независимые booking routes само по себе.
3. G8-3 / G8-4 / G8-5t / G8-DENY: canonical bounds/normalizer/text/DENY owner contract.
4. 11 evidence clauses: G6-13; G7-5, G7-BOOK1, G7-FR6b, G7-FR6d; R-1a; G11-I9; G12-R1b, G12-I11, G13-R2; G13-I3. Точные обязанности перечислены в REMAINING-WIDGET-WORK.md; полная матрица в CLAUSE-MATRIX.md.
5. AR-1: NOT READY / STOP. Threshold, approver, entitlement writer, rollback/revocation, ratchet unlock и activation proof не определяются до оставшихся release evidence/contracts. widgets.runtime остаётся planned/fail-closed.

```yaml
CLAUDE PATH OVERLAP: 0
PRODUCTION EFFECTS: 0
REAL OTP SENT: 0
REAL YCLIENTS EFFECTS: 0
CLAUDE MERGE: NO
CHAPTER 10: NO
```

SAFE TO INTEGRATE остаётся NO для общего programme acceptance до совместного integration checkpoint. Сам backend механизм SB-1 реализован; production use не выполнялся и не сертифицирован этим локальным доказательством.
