# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 UNRESOLVED IDENTITY RUNTIME REGISTRATION GUARD REPORT

Status: **PASS — GUARD DEPLOYED; HOLD MATERIALIZATION STILL REQUIRED**

Source checkpoint: `4ef659a8`

Implementation commit: `bdcd0aec`

Date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope

This step connected the existing Chapter 2 `ClientIdentityService` registration
owner to the already deployed `UnresolvedClientIdentityHold` foundation. It did
not create a hold row, Client, CrmClientLink, loyalty row, grant, provider
write, FULL_LEDGER migration, or P4-03 cutover.

The deployed path is:

`CRM/HTTP/background initiator`

→ `CrmService`

→ `ClientIdentityService`

→ tenant-qualified active-hold lookup

→ `Client / CrmClientLink` only when allowed.

No separate loyalty identity registration path was introduced.

## 2. Guard contract

The registration owner now normalizes and server-derives:

- tenant from `TenantContextService`;
- provider from the canonical lower-case provider name;
- exact external provider identity from the CRM result.

Before an existing link can be revived or a new Client/link can be created, it
queries the unique tuple:

`(tenantId, provider, externalId)`

An unresolved row (`resolvedAt IS NULL`) rejects registration with:

`client_identity_unresolved`

A lookup error rejects registration with:

`client_identity_guard_unavailable`

Neither condition falls back to a write. The hold lookup and identity write
share one PostgreSQL `SERIALIZABLE` transaction, closing the check/create race.
The duplicate-link convergence path rechecks the guard before returning a
concurrent winner.

`tryRegisterCrmClient` continues to protect the surrounding CRM read from a
shadow-registration failure, but now returns a machine-readable blocked result
and performs no identity write.

## 3. Production-reachable ownership and ratchet

The architecture ratchet scans application source and executable scripts.

| Check | Result |
| --- | --- |
| Production registration owners | `1` |
| Canonical owner | `src/crm/client-identity.service.ts` |
| Production call surfaces outside owner | `1` — `src/crm/crm.service.ts` |
| Direct production registration bypasses | `0` |
| Synthetic rogue HTTP writer detected | yes |
| Synthetic rogue background writer detected | yes |
| Controlled executable-proof fixture | explicitly isolated to disposable DB names |
| Guard precedes link lookup/create | yes |
| Hold lookup and write transaction | `SERIALIZABLE` |

This covers the current production-reachable shadow registration, CRM read and
sync boundary, HTTP callers of that boundary, and background callers. AI/runtime
has no separate identity writer; if it reaches registration, it reaches the
same owner.

## 4. Targeted verification

All commands ran sequentially.

| Gate | Result |
| --- | --- |
| Guard unit + CRM + ownership/cutover architecture suites | `5/5` |
| Assertions | `52/52` |
| Active hold blocks before Client/link access | PASS |
| Hold lookup failure fails closed | PASS |
| Resolved hold permits canonical registration | PASS |
| No hold permits canonical registration | PASS |
| Tenant-qualified lookup | PASS |
| Machine-readable block reason | PASS |
| 23 collision-free structural identities allowed | `23/23` |
| P4-03 executable service remains production-unreachable | PASS |
| Existing Canonical Action Ingress ratchet | PASS |
| Targeted ESLint | PASS |
| Application typecheck | PASS |
| Build + build preflight | PASS |

No full suite, browser, Playwright, watch mode, or parallel heavy gate ran.

## 5. Production preflight and deployment

Before switching the runtime:

| Check | Result |
| --- | --- |
| HEAD/origin | `bdcd0aec` / equal |
| Backend tree | clean |
| Release preflight | PASS |
| Local migrations | `62` |
| Applied production migration rows | `65` |
| Pending migrations | `0` |
| Prisma migration status | up to date |
| Schema drift | NONE |
| Health/readiness | `200 / 200` |
| Client / CrmClientLink / Hold / LoyaltyTransaction | `0 / 0 / 0 / 0` |

Release:

`/opt/maya-saas/releases/20260831-c06-p4-p403-identity-hold-guard-bdcd0aec`

The release installed its own production dependencies and generated Prisma
Client from the 62-migration schema. Release preflight, migration status, and
drift were rechecked before the switch. No migration command was applied.

The first spare-port command omitted `PORT=3199`; it therefore never listened
on the spare port and production was not switched. Its recorded process group
was terminated and verified dead. The corrected spare-port run returned ready
HTTP `200`, had zero priority log errors, terminated its exact process group,
and released port 3199 before the production switch.

Production then switched to the release above. Rollback was not required.

## 6. Read-only post-deploy proof

| Check | Result |
| --- | --- |
| Active release | `20260831-c06-p4-p403-identity-hold-guard-bdcd0aec` |
| Service state | active |
| Health/readiness | `200 / 200` |
| Priority service error entries | `0` |
| Pending migrations | `0` |
| Post-deploy drift | NONE |
| Compiled hold lookup marker | present |
| Compiled machine reason | `client_identity_unresolved` |
| Compiled P02/P03 active-hold dry-run | BLOCK |
| Compiled safe dry-runs | ALLOW `23/23` |
| Dry-run identity writes | `0` |
| Client / CrmClientLink after deploy | `0 / 0` |
| Hold rows after deploy | `0` |
| Canonical LoyaltyTransaction rows | `0` |
| P4-03 executable service wired to module | no |
| Spare-port listener remaining | no |

The post-deploy P02/P03 proof deliberately used the deployed compiled service
with an in-memory active-hold lookup. The accepted P02/P03 production hold row
was not fabricated in this step. Therefore the guard behavior is active and
proven, but the live collision is not durably blocked until the separately
approved materialization step creates its hold row. Safe identity establishment
remains forbidden until that materialization and a subsequent read-only proof.

## 7. Side-effect accounting

`CLIENTS CREATED: 0`

`CRMCLIENTLINKS CREATED: 0`

`HOLD ROWS CREATED: 0`

`LOYALTY VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`FULL_LEDGER MIGRATION STARTED: NO`

`P4-03 CUTOVER STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 8. Process hygiene

All heavy checks were sequential. Four non-trivial temporary/async process
groups were lifecycle-owned: one accidentally broad local read-only search,
one remote dependency-install session that crossed the initial tool yield, and
two spare-port attempts. Each exact PID/process group or unified session was
waited to completion or terminated, then verified dead. No broad kill command
was used.

`TEMP PROCESSES STARTED: 4`

`TEMP PROCESSES TERMINATED: 4`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 9. Verdict

`RUNTIME REGISTRATION GUARD: ACTIVE`

`P02/P03 AUTO-REGISTRATION BLOCKED: YES — FOR AN ACTIVE HOLD; LIVE HOLD MATERIALIZATION PENDING`

`P02/P03 ACTIVE-HOLD DRY-RUN BLOCKED: YES`

`P02/P03 LIVE HOLD MATERIALIZED: NO`

`23 SAFE IDENTITIES REMAIN REGISTRABLE: YES`

`REGISTRATION BYPASS PATHS: 0`

`CLIENTS CREATED: 0`

`CRMCLIENTLINKS CREATED: 0`

`LOYALTY VALUE MUTATIONS: 0`

`READY TO MATERIALIZE P02/P03 HOLD: YES`

`READY FOR SAFE IDENTITY ESTABLISHMENT: NO`

STOP. The next step is the separately approved materialization of the single
P02/P03 collision hold. Safe identity establishment, FULL_LEDGER migration,
P4-03 cutover, Package 5, and Chapter 7 were not started.
