<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: ce5d9222c4f7c3d9e9bfc8c3be6e65c1a6158114324a8bf92062643309f36d4c -->

# Widget Release Programme — checkpoint после owner decisions

**Delivery HEAD: `54540cde208a5c8ced1418fae8b67fcb4519def4`. Worktree clean.**

Ветка: `codex/widget-release-programme-20260929`.

Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/widget-release`.

Начало прохода: `d7eaf17c153929bbf01f86aae13753bacd955e84`.
Runtime proof HEAD: `a46b228bcc2c8912f2b25d194944be7ea0dee365`.
Последний backend/evidence HEAD: `b2a8c8a2bd0ab34ed18456536086ae04ace73f9c`.
Документация и сохранённые receipts идут отдельным завершающим коммитом. Его точный HEAD указан в delivery receipt.

```yaml
FALSE CLAUSES ORIGINAL: 31
FALSE CLAUSES AT PASS START: 19
FALSE CLAUSES: 18
EVIDENCE_MISSING: 11
IMPLEMENTATION_MISSING: 1
OWNER_DECISION_REQUIRED: 6

OD-3: APPROVED A
OD-4: APPROVED B
OD-5: APPROVED B
SB-1: APPROVED A

SELF-BOOKING CONTRACT: BLOCKED
PERSONAL CONTEXT CONSUMER: IMPLEMENTED
NEW VERIFIED BINDING PATH: BLOCKED
SELF-BOOKING DECISION PACKET: READY

AR-1 ACTIVATION ENVELOPE: NOT READY
9.6: BLOCKED

FBE2E CLOSED: 13
FBE2E PARTIAL: 6
FBE2E OPEN: 9
FBE2E NEW WHOLE CLOSURES THIS PASS: 0

CLAUDE PATH OVERLAP: 0
PRODUCTION EFFECTS: 0
REAL YCLIENTS EFFECTS: 0
SCHEMA MIGRATIONS: 0
SAFE TO INTEGRATE: NO
```

## Что выполнено

1. Решения OD-3 A / OD-4 B / OD-5 B зафиксированы отдельным addendum. Все 17 U сохраняют четыре обязательства и отдельный счётчик. G5-f остаётся U с code-only refusal; G12-R5 сохраняет owner-shaped scope. Решения не превращают false в live и не разрешают активацию.
2. SB-1 A реализован в backend: явный request-local personal-client context, серверное разрешение текущего verified maya_user link, повторные проверки перед admission и dispatch, сохранение фактических User/session/membership/context в durable ActionExecution и audit. TENANT_OWNER != CLIENT; CLIENT_ROLES не расширен.
3. Добавлен `POST /api/personal-client/appointments` с обязательным `x-maya-authority-context: personal_client`. Caller-selected Client/link/role/tenant поля отвергаются. Обычный owner-вызов без personal context отказывается. Existing Client creator/Action Engine остаются владельцами booking.
4. G13-I7 (F33/F76) закрыт executable proof: независимые HTTP/BIN server-minted COMMIT, сохранённый authenticated_request source и ALLOW policy, отказ на подставленные widget/source поля, whole-tree architecture ratchet и два изолированных мутанта. Runtime semantics этой evidence-единицей не менялись.
5. Полная матрица 165 clauses пересчитана: 126 L, 4 L-T, 17 U, 18 false. Strict gates 4/15; with U-class 7/15. Три NAVIGATE metadata corrections предыдущего прохода сохранены; whole-target live proof по-прежнему не заявлен.
6. HANDOFF receiving contract подготовлен отдельно. Его STOP не блокирует обычный DRAFT/COMMIT create или backend personal booking.

## Почему новая binding-связь остаётся STOP

Сохранённый read-only snapshot от 2026-09-29T16:56:28.580Z: User/Telegram/Client/CrmClientLink и историческая V1 maya_user связь существуют; связь отозвана. Активных verified maya_user links — 0, активных ClientChannelLinks этого Client — 0. Повторного production-чтения или изменения данных в этом проходе не было.

```text
SAME-HUMAN BINDING EXISTS: YES — историческая точная связь
MISSING LINK: новый текущий verified maya_user binding episode
EXISTING CANONICAL ROUTE CAN SUPPORT SELF-BOOKING: NO — для текущего владельца без нового episode
CONTRACT DECISION REQUIRED: YES — свежий exact-Client verifier / successor-consumption contract
```

Personal context consumer завершён и доказан на синтетической канонической active link. Это не создаёт новую связь владельца. Existing public challenge — initial-only: service запрещает историю, а database outcome guard требует supersedesLinkId IS NULL. Guard последующих link episodes, наоборот, требует latest revoked predecessor. Обхода этих правил нет.

Нужны конкретный доверенный issuer и протокол свежего exact-Client подтверждения. Если выбран ClientLinkChallenge, минимальное решение — versioned successor-consumption contract с точным tenant/subject/Client/predecessor, свежим evidence, expiry, atomic single use и отказом на replay/substitution. Необходимость дополнительных полей зависит от issuer format; новая таблица не придумана. Packet: SB-1-REVERIFICATION-DECISION.md.

## Проверки

| Проверка | Результат и граница |
|---|---|
| Полный доступный backend regression | 573 suites, 5387 PASS, 0 FAIL; одна явно выделенная integration-only проверка пропущена и выполнена отдельно |
| Widgets live | 25 suites, 349 PASS |
| SB-1 unit | 66 PASS; входит в backend run |
| Новая F33/F76 boundary unit группа | 12 PASS, включая 6 добавленных после полного backend run |
| HTTP/BIN | SB-1 и WR positive/negative proofs проходят; весь BIN harness 17/17 PASS |
| Evidence verifier | 15 lines, 13 claims, 28 captured mints; 0 violations |
| Audit / decision admission self-tests | 32/32 PASS |
| Lineage / mutation planner / receipt rejection self-tests | 47/47 PASS |
| Build, application/live/scripts typechecks, changed TS lint | PASS |
| Widget Contract checker | 31/31 PASS; 4 прежних pending |
| Свежие mutants | 56: 33 build-killed, 23 live-killed; 0 mismatches, 0 red baselines |
| Integration-only artifact check | BLOCKED: maya-chat-shell/dist/web отсутствует в isolated checkout; assertion сохранён |
| Remote CI | Свежий run не выполнялся; receipt не заявлен |

Полный backend run прошёл на Node 22.23.2. Первоначальный Node 24 процесс завершился crash 139 и не считается успешным proof. После полного backend run изменились только семь явно перечисленных test/evidence файлов; application runtime идентичен a46b. Новые проверки выполнены отдельно. Числа пересекающихся тестовых наборов не суммируются.

В инвентаре 410 mutation declarations / 34 batteries / 55 planned CI jobs. Этот проход заново выполнил SB1, WR, H-harness и AB — 56 мутантов с раскрытыми filters. Остальные 354 здесь не повторялись. Старые receipts не переименованы в новые. Полного свежего 410-mutant CI certificate нет; M17b/M18b сохраняют pending. Scoped receipts не проходят за whole-programme certification.

Синтетический SB-1 fixture не содержит canonical branch для staff inbox: существующий R06 guard отказывает публикации уведомления. Booking/action/audit проверены; доставка staff notification не заявлена.

## Точные оставшиеся blockers

| Область / clauses | Что требуется |
|---|---|
| G6-6, G13-R8 | Destination owner, receiving route, lookup/current principal/tenant, expiry/replay и correlation contract. STOP по указанию владельца; отдельный packet |
| G8-3, G8-4, G8-5t, G8-DENY | Канонический registered bounds/normalizer/text/deny owner либо явное scope decision. Отсутствующую регистрацию нельзя назвать U только решением OD-3 |
| G6-13 | Реальное Gate-6 allow / Gate-14 re-resolution disagreement + metric в HTTP/BIN; injected verdict недостаточен |
| G7-5, G7-BOOK1, G7-FR6b, G7-FR6d, G11-I9, G13-I3 | Whole-clause evidence, включая non-draft ancestry/appointment identity/pairing и отдельно no-MONEY/F80 duties. Create proof не подменяет эти пути |
| R-1a | Whole effect/tier ingress duty, включая spoken half; typed create недостаточен |
| G12-R1b, G12-I11, G13-R2 | Production-minted HTTP/BIN evidence всех требуемых NAVIGATE target classes; current implementation drift закрыт, whole-clause proof ещё нет |
| 9.6 | Один канонический persisted user-turn identity и writer на Claude+Codex integration checkpoint; byte parity, retries/deduplication/error proof. Mirror writer не добавлен |
| Новый SB-1 binding | Свежий exact-Client verifier и согласованный successor persistence/consumption contract; отдельный STOP |
| AR-1 | После settlement release contracts/evidence — threshold, approver, entitlement writer, rollback/revocation, ratchet unlock, activation proof. Сейчас envelope NOT READY; widgets.runtime остаётся planned/fail-closed |
| Интеграционная готовность | Авторизованный combined candidate со своим built artifact и свежие CI/acceptance receipts. Claude artifact не копировался |

FBE2E остаётся 13 CLOSED / 6 PARTIAL / 9 OPEN. Carrier transport/trace/receipt-to-chat/network-ratchet/dedup — presentation dependencies. Date/window/timezone policy, tap-as-delivered, historical evidence admission — owner decisions. Actual AE fault-produced UNKNOWN — production-effect proof gap. Remote timing и exhaustive mutation coverage не доказаны. Полный список 28 строк — fbe2e-disposition.json.

## Изоляция и atomic commits

Application changes только в maya-saas-backend; docs/evidence — в docs/rebuild/widget-release-programme/postdecision. Точные paths — FILES-TOUCHED.md и ownership-proof.json. Checker сравнивает весь delta ветки с committed и uncommitted paths текущего Claude checkout, а также запрещёнными carrier/UI/CSS/TSX prefixes. Пересечение — 0. widgets.runtime planned и точный CLIENT_ROLES проверены.

- 97e1b6c — owner decisions.
- a46b228b — explicit personal context + actual actor evidence + tests.
- a274b8a8 — F33/F76 executable boundary proof.
- b2a8c8a2 — mutation planner inventory ratchet для SB1/AB.
- Финальный docs/evidence commit — delivery receipt.

Ни merge/cherry-pick/rebase Claude, ни production deploy/config/DB write, ни реальные YCLIENTS effects, ни schema migration, ни C10 не выполнялись. Использован только отдельный local proof PostgreSQL; после проверок он остановлен.
