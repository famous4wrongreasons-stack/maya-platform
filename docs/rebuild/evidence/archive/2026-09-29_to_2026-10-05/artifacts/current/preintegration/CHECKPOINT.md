<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: f3adb6e3bd4b5574c41c5e7dacb152b5701c95a882e50939977a985f8480943c -->

# Widget Release Programme — pre-integration checkpoint

**Закрыто 12 из 24 evidence gaps.** False clauses: **31 → 19**. Gate 14 теперь имеет исполняемую HTTP/BIN-пару через действующий Action Engine; строгий счёт **4/15**, с отдельно учитываемым U — **7/15**. Это не разрешение на production activation.

Ветка: `codex/widget-release-programme-20260929`.
Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/widget-release`.
Final HEAD: `d7eaf17c153929bbf01f86aae13753bacd955e84`. Worktree clean.

Backend proof HEAD: `000ed08f3769f8ec78f634c7c10f4643e2d3fe11`. Backend bytes финального HEAD совпадают с proof HEAD; последующие commits содержат CI-подготовку и evidence/docs.

## Область изменений

В этом проходе изменены backend evidence/тесты, проверка lineage в evidence verifier, наблюдаемость persisted successor relation, профили backend/integration-проверок, CI-подготовка Prisma и документы. Единственное добавление в application runtime этого прохода — логирование уже сохранённой связи successor → predecessor. Admission, authority, entitlements и lifecycle не менялись ради evidence.

Правки runtime из предыдущего прохода остаются в этой ветке и покрыты свежими полными backend/widgets-live прогонами. Ничего из ветки Claude не cherry-picked, merged или rebased. Его carrier, React/AChat, CSS, renderer, Capacitor/iOS и ratchets не изменялись.

Проверка пересечения сравнивает весь delta от общего base с текущей историей ветки Claude, его незакоммиченными файлами и защищёнными префиксами. **CLAUDE PATH OVERLAP: 0.** Claude HEAD при проверке: `36fc31d7fa1ba5af758254912fa324093b4d954b`. Точный список обеих сторон — `ownership-proof.json`.

## Clauses и решения

| Классификация false clauses | До | После |
|---|---:|---:|
| EVIDENCE_MISSING | 24 | 12 |
| IMPLEMENTATION_MISSING | 3 | 1 |
| OWNER_DECISION_REQUIRED | 4 | 6 |
| Всего false | 31 | 19 |

Промотированы: **G6-8…G6-12, G7-4, G7-6, G13-R6, G13-R9, G14-a/b/c**. Полный список всех 31 строк, owners, proof/result и ограничений — `CLAUSE-MATRIX.md` и `clause-disposition.json`.

Три NAVIGATE metadata rows (`G12-R1b`, `G12-I11`, `G13-R2`) исправлены в новом current audit: реализация существует, `built: true`. Документальный drift закрыт, whole-clause live claims не добавлены. Исторический audit сохранён. Текущий audit: 125 L, 4 L-T, 17 U, 19 false.

G6-6 и G13-R8 переклассифицированы в OWNER_DECISION_REQUIRED: принимающий HANDOFF route/lookup/authority contract не определён. Подпись opaque handle его не заменяет. 9.6 остаётся IMPLEMENTATION_MISSING с dependency на общий conversation writer/turn identity; пересекать owned carrier/runtime ports Claude или вводить второй writer нельзя.

OD-3/4/5 остаются **OPEN**, final packet **READY** в `DECISIONS.md`. Варианты и последствия сокращены до актуальных. Решения не выбраны. AR-1 остаётся STOP: канонического activation contract нет; `widgets.runtime` остаётся planned, запрет production grant и A2.2 сохранены.

## FBE2E и self-booking

**13 CLOSED / 6 PARTIAL / 9 OPEN.** Новые частичные закрытия: L2 (Prisma generation перед contract compilation), L4 (реальный built-backend booking journey), L26 (строгий admission новых receipts). Presentation-owned части не зачтены. Полный список 28 limitations — `fbe2e-disposition.json`.

Read-only snapshot production в 2026-09-29T16:56:28Z: User есть; Telegram identity — 1; личный Client — 1; активный CrmClientLink — 1; matching maya_user link history — 1, эта связь revoked; активных verified maya_user links — 0. Все чтения выполнены в READ ONLY transaction, затем ROLLBACK; идентификаторы и PII не выведены.

```text
SAME-HUMAN BINDING EXISTS: YES (явная историческая связь)
MISSING LINK: действующий canonically verified maya_user binding episode; прежний отозван
EXISTING CANONICAL ROUTE CAN SUPPORT SELF-BOOKING: NO (из текущего tenant_owner context)
CONTRACT DECISION REQUIRED: YES
SELF-BOOKING DECISION PACKET: READY
```

TENANT_OWNER != CLIENT. CLIENT_ROLES не расширен; данные, роли и отозванная связь не менялись. Даже новая верификация сама по себе не создаёт authority для owner self-booking.

## Проверки и пределы receipts

- Backend: **5348 PASS / 0 FAIL**, 572 suites; 1 явно помеченная integration-only проверка исключена из backend-профиля.
- Widgets-live: **348/348 PASS**.
- Built backend HTTP: **16/16 PASS**, health 200; новый booking create идёт через реальный catalog route, DRAFT и COMMIT, подтверждён durable ActionExecution и отказ повторного COMMIT.
- Evidence verifier: **8 lines / 6 claims**, HTTP/BIN по 10 captured mints, 0 violations; source fixtures не пишут widget/action rows.
- Все **398 declarations / 32 batteries**: **263 build-killed, 132 live-killed, 1 equivalent, 2 pending**; 0 unexpected, 0 red baseline. Запуск ограничен заявленными killers; каждый receipt сохраняет filters. Это **не полный unfiltered CI certificate**. M17b/M18b остаются pending: независимость policy/source fences ещё не доказана.
- Build, application/scripts/widgets-live/contract typechecks, lint изменённых TS: PASS; K3 — 10/10; contract checker — 31/31, 4 ранее известных pending mechanisms.
- Lineage self-test 12/12; mutation runner 18/18; planner/assembler 35/35; новый current-audit consumer 13/13; canonical audit self-test 17/17.
- CI repair: Prisma generate локально PASS; advisory workflow policy сохранена. **Fresh GitHub CI: NOT RUN**. Ветка не pushed.

`npm test` сохраняет все проверки. Единственный `npm run test:integration` check исполнен и остановлен отсутствием `maya-chat-shell/dist/web`: **INTEGRATION-ONLY CHECK**, не backend failure. Его assertions сохранены; source/artifact Claude не копировались и не собирались. Отдельный backend-профиль не подменяет этот integration check.

## Exit

```text
FALSE CLAUSES BEFORE: 31
FALSE CLAUSES AFTER: 19
EVIDENCE_MISSING REMAINING: 12
IMPLEMENTATION_MISSING REMAINING: 1
OWNER_DECISION_REQUIRED: 6
FBE2E CLOSED: 13
FBE2E PARTIAL: 6
FBE2E OPEN: 9
OD-3/4/5 FINAL PACKET: READY (решения OPEN)
SELF-BOOKING DECISION PACKET: READY
CLAUDE PATH OVERLAP: 0
PRODUCTION EFFECTS: 0
REAL YCLIENTS EFFECTS: 0
SAFE TO INTEGRATE: NO
```

Backend regression зелёный. Общий integration acceptance ещё не подтверждён: нужен отдельный artifact check Claude и свежий branch CI/полный mutation certificate. Это ограничения интеграционной проверки, отдельно от production release blockers ниже.

Точные production/programme blockers:

- 12 whole-clause evidence gaps: G6-13, G7-5, G7-BOOK1, G7-FR6b, G7-FR6d, R-1a, G11-I9, G12-R1b, G12-I11, G13-R2, G13-I3, G13-I7.
- 9.6 — canonical conversation-writer dependency; G6-6/G13-R8 — receiving HANDOFF authority; G8-3/G8-4/G8-5t/G8-DENY — owner-approved bounds/normalizer/text sources or scope decision.
- OD-3/4/5 и AR-1 activation envelope/threshold/approver/writer/rollback contract; SB-1 identity re-verification plus authority contract.
- FBE presentation dependencies L3/L4/L9/L18/L19/L23/L27; policy/evidence rulings L2/L5/L24/L25/L26; remaining proof limits L12/L16/L20. Списки пересекаются, они не суммируются в общий процент.

Production deploy/config/DB writes: 0. Real YCLIENTS effects: 0. Schema changes / новые migrations: 0. Использована только отдельная loopback proof-БД с существующими migrations; после проверок её PostgreSQL остановлен. No merge, no Chapter 10, no website changes, no carrier redesign.

## Файлы этого прохода

- `.github/workflows/widget-contract.yml`
- `docs/rebuild/widget-release-programme/preintegration/CHECKPOINT.md`
- `docs/rebuild/widget-release-programme/preintegration/CLAUSE-MATRIX.md`
- `docs/rebuild/widget-release-programme/preintegration/DECISIONS.md`
- `docs/rebuild/widget-release-programme/preintegration/NAVIGATE-CURRENT-EVIDENCE.md`
- `docs/rebuild/widget-release-programme/preintegration/README.md`
- `docs/rebuild/widget-release-programme/preintegration/clause-disposition.json`
- `docs/rebuild/widget-release-programme/preintegration/current-audit.json`
- `docs/rebuild/widget-release-programme/preintegration/current-audit.mjs`
- `docs/rebuild/widget-release-programme/preintegration/current-audit.test.mjs`
- `docs/rebuild/widget-release-programme/preintegration/evidence/database-before-teardown.jsonl`
- `docs/rebuild/widget-release-programme/preintegration/evidence/evidence-manifest.jsonl`
- `docs/rebuild/widget-release-programme/preintegration/evidence/mint-provenance.jsonl`
- `docs/rebuild/widget-release-programme/preintegration/evidence/verification-report.json`
- `docs/rebuild/widget-release-programme/preintegration/fbe2e-disposition.json`
- `docs/rebuild/widget-release-programme/preintegration/gate-recomputations.json`
- `docs/rebuild/widget-release-programme/preintegration/mutation-receipts/H-harness.json`
- `docs/rebuild/widget-release-programme/preintegration/mutation-receipts/WR.json`
- `docs/rebuild/widget-release-programme/preintegration/owner-identity-readonly.cjs`
- `docs/rebuild/widget-release-programme/preintegration/owner-identity.json`
- `docs/rebuild/widget-release-programme/preintegration/ownership-proof.json`
- `docs/rebuild/widget-release-programme/preintegration/verification.json`
- `maya-saas-backend/package.json`
- `maya-saas-backend/scripts/widgets-evidence-lineage.mjs`
- `maya-saas-backend/scripts/widgets-evidence-lineage.test.mjs`
- `maya-saas-backend/scripts/widgets-evidence-verify.mjs`
- `maya-saas-backend/scripts/widgets-http-proof/gateWR-release.cases.ts`
- `maya-saas-backend/scripts/widgets-mutation-battery.mjs`
- `maya-saas-backend/scripts/widgets-mutation-ci.test.mjs`
- `maya-saas-backend/src/action-engine/beget-relay-release.architecture.spec.ts`
- `maya-saas-backend/src/widgets/emission/emitter.service.ts`
- `maya-saas-backend/test/widgets-live/harness.live-spec.ts`
- `maya-saas-backend/test/widgets-live/mutations/gateH-harness.json`
- `maya-saas-backend/test/widgets-live/mutations/gateWR.json`
- `maya-saas-backend/test/widgets-live/support/fixtures.ts`
- `maya-saas-backend/test/widgets-live/support/mint-provenance.ts`
- `maya-saas-backend/test/widgets-live/support/release-booking-proof.ts`
- `maya-saas-backend/test/widgets-live/wr-release.live-spec.ts`
