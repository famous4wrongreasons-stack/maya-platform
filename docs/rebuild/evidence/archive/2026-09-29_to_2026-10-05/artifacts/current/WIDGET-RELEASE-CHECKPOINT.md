<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: f04151e5d039631c9b6dde3a9f872bcd5b1df9a380f768fb1dcf1692bdcb5da2 -->

# Widget Release Programme — checkpoint 29 сентября 2026

Изолированная backend/docs/evidence ветка. Локальные receipts приложены в WIDGET-RELEASE-EVIDENCE.zip. Production activation и owner self-booking остаются заблокированы каноническими решениями. Изменения не означают готовность booking для реального пользователя.

- Branch: `codex/widget-release-programme-20260929`
- Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/widget-release`
- Canonical baseline: `62bb81b871b772efe43cc566423727b653a9635a`
- Проверенный code/test target: `67166a247d5b191ef5a3e32ef5077e30c1a4ff36`
- Финальный HEAD: `223d81c25aa8fb59863e72b96c7927a096eccb9d`; рабочее дерево чистое. Полный снимок ownership — `checkpoint.json`.

## Изменения и ownership

Изменены только `maya-saas-backend` и выделенный `docs/rebuild/widget-release-programme`. Runtime delta — 5 backend-файлов: truthful selector facts/completeness, actor/principal/tenant fences, terminal-line validation, immutable confirmed-receipt ownership и COMMIT-only reconciliation. Остальное — тесты, mutation harness и документы.

**Пересечение с Claude: 0 файлов.** Проверка включает все пути, изменённые Claude между 9e4b266d и baseline, весь последующий committed/uncommitted delta его ветки, а также maya-carrier, maya-chat-shell, iOS, UI/CSS. Этот workstream не выполнял записи в ветку/worktree Claude; Claude продолжал свою работу независимо. Merge/rebase/cherry-pick не выполнялись. Результат `check.mjs` и список путей сохраняются в checkpoint.json.

Влияние: неизвестные поля enabled/consultation/availability возвращаются как NOT_MEASURED; это может потребовать от будущего UI/owner read model честного ограниченного представления. Изобретённые true/false/FREE больше не выдаются как факты. React acceptance этим не доказан.

## Gates до / после

| Статус | До | После |
|---|---:|---:|
| L | 113 | 113 |
| L-T | 4 | 4 |
| U | 17 | 17 |
| false | 31 | 31 |

Строго: **3/15**; с U: **6/15**, принятие U владельцем остаётся OD-3. 31 false = **24 EVIDENCE_MISSING + 3 IMPLEMENTATION_MISSING + 4 OWNER_DECISION_REQUIRED**. Три NAVIGATE-строки дополнительно имеют STALE_DOC (`built: false`); отсутствие пары HTTP/BIN сохраняет false. Старое утверждение об отсутствии shell submission опровергнуто текущими source probes. Ни одна строка не повышена на основании только unit/GW proof.

| Clause | Классификация |
|---|---|
| G6-6 | IMPLEMENTATION_MISSING |
| G6-8 | EVIDENCE_MISSING |
| G6-9 | EVIDENCE_MISSING |
| G6-10 | EVIDENCE_MISSING |
| G6-11 | EVIDENCE_MISSING |
| G6-12 | EVIDENCE_MISSING |
| G6-13 | EVIDENCE_MISSING |
| G7-4 | EVIDENCE_MISSING |
| G7-5 | EVIDENCE_MISSING |
| G7-6 | EVIDENCE_MISSING |
| G7-BOOK1 | EVIDENCE_MISSING |
| G7-FR6b | EVIDENCE_MISSING |
| G7-FR6d | EVIDENCE_MISSING |
| G8-3 | OWNER_DECISION_REQUIRED |
| G8-4 | OWNER_DECISION_REQUIRED |
| G8-5t | OWNER_DECISION_REQUIRED |
| G8-DENY | OWNER_DECISION_REQUIRED |
| R-1a | EVIDENCE_MISSING |
| 9.6 | IMPLEMENTATION_MISSING |
| G11-I9 | EVIDENCE_MISSING |
| G12-R1b | EVIDENCE_MISSING + STALE_DOC metadata |
| G12-I11 | EVIDENCE_MISSING + STALE_DOC metadata |
| G13-R2 | EVIDENCE_MISSING + STALE_DOC metadata |
| G13-R6 | EVIDENCE_MISSING |
| G13-R8 | IMPLEMENTATION_MISSING |
| G13-R9 | EVIDENCE_MISSING |
| G13-I3 | EVIDENCE_MISSING |
| G13-I7 | EVIDENCE_MISSING |
| G14-a | EVIDENCE_MISSING |
| G14-b | EVIDENCE_MISSING |
| G14-c | EVIDENCE_MISSING |

Тексты всех clauses, source owners и reasons находятся в baseline.json. Состояние пересчитано после каждого атомарного unit; history — gate-recomputations.json.

## OD и self-booking

- OD-3: OPEN — отдельно принять U-class или оставить только strict denominator.
- OD-4: OPEN — принять G5-f как U в этом cycle либо утвердить route/step-up contract.
- OD-5: OPEN — owner-shaped output для текущего scope либо новый carrier для principal-narrowed masking.
- Activation: STOP — нет утверждённых threshold, approver, activation owner/writer и ratchet unlock. Production activation не реализована.
- Owner self-booking: STOP — CLIENT_ROLES не расширен, TENANT_OWNER != CLIENT. Канонический resolver требует active membership + verified maya_user ClientChannelLink; наличие такой связи у реального владельца не проверялось в production DB. Даже наличие связи не даёт owner роли права на CLIENT-only chat capability. В DECISIONS.md описаны отдельный client context, narrow self-booking capability или сохранение отказа.

## FBE2E

**13 закрыто; 3 частично; 12 открыто.** Частичные: L12 (ограниченный охват мутаций), L16 (новое partitioning без измеренного remote headroom), L20 (unknown cells проверены; реальная неопределённость AE/provider ещё не доказана).

| ID | После | Disposition |
|---|---|---|
| L1 | CLOSED | BACKEND_EVIDENCE — HTTP tags corrected; targeted MINT-M20 and P-M11 receipts now record HTTP kills. This is not a whole-clause L claim. |
| L2 | OPEN | OWNER_DECISION — Advisory workflow blocking status requires acceptance-owner ruling; Prisma-generation repair alone cannot certify the green badge. |
| L3 | OPEN | PRESENTATION_DEPENDENCY — Real shell network transport belongs to Claude. Backend HTTP proof does not close this. |
| L4 | OPEN | PRESENTATION_DEPENDENCY — Built carrier plus backend binary journey needs joint artifact acceptance; current FBE2E still uses source shell/AppModule. Existing 15-case BIN corpus does not cover FBE2E. |
| L5 | OPEN | OWNER_DECISION — Fixed tomorrow/tenant-local window ownership and policy must be settled with L24 before a policy-preserving date fix. |
| L6 | CLOSED | BACKEND_IMPLEMENTATION — Unknown enabled/consultation/slot availability are NOT_MEASURED/NOT_COLLECTED, without fact refs. No fabricated FREE/true/false. Totals are null without completeness evidence. |
| L7 | CLOSED | BACKEND_IMPLEMENTATION — All three actor/authority/tenant fences restored before quote; selector no longer fabricates A1/no-divergence. Three negative tests and three mutants. |
| L8 | CLOSED | BACKEND_IMPLEMENTATION — PARTIAL, totalCount null, hasMore true, NOT_COLLECTED; malformed list refuses. No second invented COMPLETE fact. |
| L9 | OPEN | PRESENTATION_DEPENDENCY — Shell child harness does not return its COMMIT gate trace. Existing backend H2 asserts 14 gates but cannot substitute for this path. |
| L10 | CLOSED | BACKEND_EVIDENCE — Runner executes a plain live baseline even for exclusively neutralised live mutants; independent neutraliser-only self-test passes. |
| L11 | CLOSED | BACKEND_EVIDENCE — Three selector kinds assert the selector emission path and no generic emit; WR-M17 detects substitution. |
| L12 | PARTIAL | ACCEPTED_LIMITATION — Presenter, selector adapter, noun identity, preview adapter and router now have targeted mutants. The ports file has type declarations, not an executable branch; typecheck covers their use. This is targeted coverage, not exhaustive mutation certification. |
| L13 | CLOSED | BACKEND_EVIDENCE — Foreign-principal and lock-time-principal-change cases plus WR-M18/M19. BUILD-level recording-store tests, not a new HTTP admission claim. |
| L14 | CLOSED | BACKEND_IMPLEMENTATION — Confirmed publication excludes any different confirmed COMMIT. Same-token immutable retry remains allowed. PostgreSQL injected-record test proves a second receipt cannot substitute the first line. |
| L15 | CLOSED | BACKEND_EVIDENCE — WR-M12/M13/M14 remove ownership, effect/space narrowing and monotonicity respectively; additional WR-M15 tests same-token exception. |
| L16 | PARTIAL | ACCEPTED_LIMITATION — P-mint now has four disjoint shards; full tests/controls retained. Planner and assembler pass. Remote elapsed-time/headroom is unmeasured; no timing guarantee. |
| L17 | CLOSED | BACKEND_IMPLEMENTATION — Reconciliation receipt query requires its record be tenant-scoped AE COMMIT. PostgreSQL CONTROL-token call returns false; WR-M16 pins it. |
| L18 | OPEN | PRESENTATION_DEPENDENCY — Same dependency as L9; literal gate count from the shell-owned submission remains absent. |
| L19 | OPEN | PRESENTATION_DEPENDENCY — Receipt-to-chat network/React acceptance belongs to Claude; server thread-page validation is now stronger but does not close this hop. |
| L20 | PARTIAL | PRODUCTION_EFFECT_PROOF — Nearest-availability unknown branch and unknown cells now asserted and mutation-tested. Actual Action Engine uncertainty/fault-produced UNKNOWN is still not proven by the supplied-verdict trace. |
| L21 | CLOSED | BACKEND_IMPLEMENTATION — Server thread reader enforces seven terminal outcomes and nonempty receipt iff CONFIRMED; malformed storage is filtered before the wire. WR-M06/M07/M08. |
| L22 | CLOSED | BACKEND_EVIDENCE — Recording double keys existing receipts by upsert identity and checks empty update. Test explicitly proves immutable retry, not rejection of caller-shaped input on a first write. |
| L23 | OPEN | PRESENTATION_DEPENDENCY — Shell network ratchet is Claude-owned. |
| L24 | OPEN | OWNER_DECISION — Specify canonical date/window/timezone policy owner; no tenant policy invented in widgets. |
| L25 | OPEN | OWNER_DECISION — Tap-as-delivered/rendered semantics need a lifecycle ruling; existing fences unchanged. |
| L26 | OPEN | OWNER_DECISION — Historical mutation-receipt admissibility/revocation rule is unresolved. New receipts have green baselines; historical audit builder is unchanged. |
| L27 | OPEN | PRESENTATION_DEPENDENCY — Conversation append deduplication is Claude-owned. |
| L28 | CLOSED | BACKEND_EVIDENCE — HTTP dismiss before COMMIT now executed: terminal storage null/page lines empty, control dismissed, ActionExecution count zero. |

## Проверки

- Backend regression: 571/572 suites; 5348 passed, 0 pending, 1 failed (отсутствует maya-chat-shell/dist/web).
- Widgets-live: 24/24 suites; 341 tests PASS.
- Built backend HTTP corpus: 15/15 PASS; health 200. Это прежний корпус, не FBE2E binary proof.
- Новые мутации: 21/21 BUILD-killed; baseline green. Запуск ограничен относящимися к изменениям suites.
- MINT-M20 и P-M11: live-killed, HTTP:1 каждый; это targeted partitions, не полный corpus.
- Mutation runner: 18/18 self-checks; planner/assembler: 34/34; 32 batteries / 53 shards / 394 declarations запланированы.
- Build, application/scripts/widgets-live/contract typechecks, lint changed files: PASS.
- K3 planned/readiness + entitlement writer guards: 10/10 PASS. Contract checker: 31/31, 4 ранее известных pending mechanisms.
- Полный live прогон первоначально нашёл старую CONTROL fixture в B-29. Тест исправлен на явно объявленную AE COMMIT/U fixture; окончательный полный прогон PASS.
- GitHub CI для этой ветки: NOT RUN. Ветка не pushed, workflow/settings не изменены. Старые CI receipts не присвоены новому HEAD.

## Остаток и интеграция

Общий backend-прогон не зелёный: единственный сбой — ENOENT для maya-chat-shell/dist/web в beget-relay-release.architecture.spec.ts. Этот неизменённый тест требует presentation build artifact. В защищённом shell-пакете не создавались файлы и не запускалась сборка. Это же препятствует полному mutation baseline, использующему общий unit corpus.

**SAFE TO INTEGRATE: NO.** Это review checkpoint; для допуска в integration нужны отсутствующий shell artifact с полным зелёным backend baseline, актуальные branch CI receipts и обязательная полная mutation-сертификация без ограниченного набора tests. Отдельно production widgets.runtime запрещён до решения AR-1 и применимых OD.

Точные открытые блокеры: 24 whole-clause HTTP/BIN admissions; 3 implementation/presentation dependencies (G6-6, G13-R8, 9.6); 4 Gate 8 source/scope decisions; OD-3/4/5; activation contract; SB-1; L2/L5/L24/L25/L26 owner rulings; L3/L4/L9/L18/L19/L23/L27 presentation dependencies; остатки L12/L16/L20. Эти списки пересекаются и не суммируются в общий процент.

Production deploy/config/DB writes: 0. Real YCLIENTS effects: 0. Новые migrations/schema changes: 0; только replay 99 существующих migrations в отдельной loopback proof-БД; созданный для задачи PostgreSQL остановлен после проверок. Chapter 10, website, UI, iPhone reinstall: не затронуты.

## Файлы

- `docs/rebuild/widget-release-programme/BASELINE.md`
- `docs/rebuild/widget-release-programme/CHECKPOINT.md`
- `docs/rebuild/widget-release-programme/DECISIONS.md`
- `docs/rebuild/widget-release-programme/baseline.json`
- `docs/rebuild/widget-release-programme/check.mjs`
- `docs/rebuild/widget-release-programme/fbe2e-disposition.json`
- `docs/rebuild/widget-release-programme/gate-recomputations.json`
- `docs/rebuild/widget-release-programme/verification.json`
- `maya-saas-backend/scripts/widgets-mutation-battery.mjs`
- `maya-saas-backend/scripts/widgets-mutation-ci.mjs`
- `maya-saas-backend/scripts/widgets-mutation-ci.test.mjs`
- `maya-saas-backend/src/widgets/booking/booking-noun-identity.spec.ts`
- `maya-saas-backend/src/widgets/booking/booking-selector.presenter.spec.ts`
- `maya-saas-backend/src/widgets/booking/booking-selector.presenter.ts`
- `maya-saas-backend/src/widgets/composition/chat-read.trigger.spec.ts`
- `maya-saas-backend/src/widgets/emission/booking-successor-boundary.spec.ts`
- `maya-saas-backend/src/widgets/owner-ports/booking-selector.adapter.spec.ts`
- `maya-saas-backend/src/widgets/owner-ports/booking-selector.adapter.ts`
- `maya-saas-backend/src/widgets/resolve/thread-page.service.spec.ts`
- `maya-saas-backend/src/widgets/resolve/thread-page.service.ts`
- `maya-saas-backend/src/widgets/routing/effect-router.service.spec.ts`
- `maya-saas-backend/src/widgets/routing/effect-router.service.ts`
- `maya-saas-backend/src/widgets/stores/intent-audit.store.ts`
- `maya-saas-backend/src/widgets/stores/widget-stores.service.spec.ts`
- `maya-saas-backend/test/widgets-live/e2-booking.live-spec.ts`
- `maya-saas-backend/test/widgets-live/gate13-routing.live-spec.ts`
- `maya-saas-backend/test/widgets-live/h2-terminal-line-ownership.live-spec.ts`
- `maya-saas-backend/test/widgets-live/mutations/gateWR.json`
