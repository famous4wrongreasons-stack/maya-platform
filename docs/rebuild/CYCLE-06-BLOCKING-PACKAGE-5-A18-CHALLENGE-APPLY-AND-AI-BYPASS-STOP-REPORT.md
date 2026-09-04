# CYCLE 06 — A18 challenge apply and new AI onboarding bypass STOP

Status: **PRODUCTION SCHEMA APPLIED; RUNTIME DEPLOYMENT NOT PERFORMED; PACKAGE 5 INCOMPLETE**

Date: 2026-09-04. Accepted user checkpoint: `84696bc9`.
Foundation source applied: `77c611c79248fce887c6aa22fb817958ef672c8d`.

## Outcome and exact stopping reason

Stages 1 and 2 of the approved ClientLinkChallenge/TTL cycle are complete.
Work continued into Stage 3. It did not stop merely because schema migration
finished or because a previously approved authority decision needed repeating.

Tracing the shared production onboarding call graph found **B4**, an additional
production-reachable post-tenant mutation path not included in the three
previously enumerated endpoint blockers. The user explicitly required STOP on
another bypass. B4 was found before deployment; it cannot be ignored until a
later final-gate run or mislabeled as an approved pre-tenant exemption.

No runtime deployment, real consent/trial operation, complete 13-family Final
Gate rerun or Package 5 completion is claimed. The three accepted blockers are
still open in production. A26 implementation was not changed after B4 discovery.
This report records an architectural blocker, not a request to reopen the
approved challenge schema, TTL, D2-A, D3-A or accepted Waves 1–6.

## B4 — public AI onboarding owns post-tenant A26/A28 mutations

Production endpoint:

`POST /api/onboarding/ai/drafts/:draftId/confirm`
→ `OnboardingController.confirmAiDraft`
→ `AiOnboardingService.confirmDraft`
→ `OnboardingService.createTrialSignup` returns an already committed tenant
→ `AiOnboardingService.provisionInternalCalendar`
→ four legacy InternalCalendarService bootstrap writers.

The deployed module/controller metadata confirms OnboardingModule is imported
by AppModule, AiOnboardingService is provided, method POST and public=true.
The route still requires its draft secret and normal domain preconditions;
public=true does not mean an arbitrary unauthenticated request automatically
performs these writes. Existing production SELF_SERVE_TRIAL_SIGNUP=true was
already established by the accepted final inventory. No draft was created or
confirmed to demonstrate reachability.

| Deployed method | Direct business writes after tenant creation |
| --- | --- |
| bootstrapCreateService | InternalService.create; InternalProviderService.createMany |
| bootstrapCreateProvider | InternalProvider.create; InternalAvailabilityRule.createMany; InternalProviderService.createMany |
| bootstrapUpdateProvider | InternalProvider.updateMany |
| bootstrapReplaceWeeklyAvailability | InternalAvailabilityRule.deleteMany + createMany |

The same confirmation method directly calls BrandingSettings.update on its CRM
branch. Its catch calls `releaseCompletedTenant(createdTenantId)` and then
`prisma.tenant.delete`, resetting a completed activation before physical tenant
delete. This is not rollback of the atomic pre-tenant transaction.

D3-A explicitly requires post-creation tenant/user/branch/branding commands to
use Action Engine and forbids tenant hard delete. Accepted A28 commands own
prospective calendar configuration. Naming these writers “bootstrap” does not
make their post-tenant execution exempt. No wider allowlist was introduced.

Read-only deployed-source fingerprints:

- confirmDraft: `9cf5b5c03e1d66d1ae955cacb6bc60891dc965369478eeb8cb4b97a4f4fabab5`.
- provisionInternalCalendar: `e5df75d1b88f83e85069249560eb375069086c0206d4b007885aec8c5f443b80`.
- bootstrapCreateService: `a5a3c3285539878036a6bb40e154d978510e00fee7c7b2d9402bd83ac9e6a75e`.
- bootstrapCreateProvider: `18c525ca542a996f8c05bcee7fd75b89996a93f4893d50a90e8861d53e37501b`.
- bootstrapUpdateProvider: `4cf01b0351942e606cfc5ed62e0719095c7e84f15d8e68128958c07514f9d444`.
- bootstrapReplaceWeeklyAvailability: `757b3116c41d2b6204227cf81a9efb5dce6f7b69f3c1f515b9a80dc6e6753424`.

The machine-readable evidence retains the exact method sources and route/module
metadata. It contains code and structural facts, not customer records or secrets.
The first metadata probe omitted runtime environment initialization and failed
configuration validation; it made no business calls. The subsequent correctly
configured read-only probe completed and health/readiness remained green.

## Completed schema boundary

Exactly the approved 14-field model and migration were implemented. TTL is
600 seconds / V1 in code and SQL. HMAC-only bearer representation, immutable
issuance, server clocks, tenant/Client/outcome FKs, atomic consumption and
one-time correlated link outcome are enforced by the applied foundation.

- Foundation PostgreSQL adversarial/concurrency proof: 49/49 PASS.
- Foundation schema/owner and prior-link checks: 33/33 PASS.
- Separate clean replay: 72 migrations; drift NONE; empty link/challenge tables.
- Foundation Prisma validate, both typechecks, project lint, preflight build: PASS.
- Production gate: exactly `20260904100000_a18_client_link_challenge_v1` pending;
  additive DDL, pre-apply drift NONE, health/readiness PASS.
- Apply: PASS; pending 0, post-apply drift NONE, exact guards/FKs/uniques verified.
- Challenge/link row counts after apply: 0/0; no fake historical backfill.

## Undeployed A18 runtime candidate and its limits

The candidate continues the approved D2-A work: authenticated Maya JWT or signed
Telegram credentials resolve a current channel; consent then resolves an active
verified ClientChannelLink. Client/tenant/time/actor payload overrides are
rejected. The canonical consent action carries durable link/evidence references,
not an invented User/Membership. Its policy branch is exact consent-only; other
capabilities retain their existing account/service authority. It rechecks binding
and channel under the shared identity lock and serializable mutation transaction.
Historical consent facts remain append-only; read status creates no mutation.

Local A18 runtime PostgreSQL proof: **21/21 PASS**. It exercises signed Telegram
credentials, real JWT/session records, Client without User, consume replay,
consent retry/restart, concurrent duplicate commands, grant/revoke historical
fact preservation, forged tenant/Client/User/phone/time, invalid/expired/future
Telegram proofs, revoked Maya session and rejection of bare Client.userId.

Ten targeted unit/architectural suites: **84/84 PASS**. Application/script
typechecks and project ESLint: PASS. Five local lint findings in synthetic
Promise fixtures/type assertions were corrected without weakening lint rules.
The runtime release build and full regression gate were not run after B4 STOP.

The initial exact-Client trust receipt in the local first-link proof is an
explicit synthetic fixture. The concrete runtime issuer only reuses an already
verified active channel link to issue for that same Client. A completely unlinked
Client fails closed. This does **not** prove production cold-start identity
resolution, create a heuristic first-link authority or backfill links. No source
User FK is promoted to proof. The candidate's future production wiring needs
review of this trusted issuance context, credential/config handling and initiators.

In particular, Python `/api/consent/submit`, its old SQL helpers and its frontend
command identity handoff have not been switched in this checkpoint. Do not infer
production A18 bypasses=0 from the local backend proof. A26 trial/admin remediation
and B4 are also pending. No stage-4 deployment-gate PASS is claimed.

## Current verdict

```text
CLIENT LINK CHALLENGE SCHEMA V1: IMPLEMENTED
CLIENT LINK CHALLENGE TTL: 600 SECONDS
TTL POLICY VERSION: V1
RAW CHALLENGE TOKEN PERSISTED: NO
CLIENT LINK CHALLENGE DURABLE IN PRODUCTION: YES
PENDING MIGRATIONS: 0
POST-APPLY DRIFT: NONE
FAKE HISTORICAL CHALLENGES/LINKS BACKFILLED: 0
A18 LOCAL RUNTIME PROOF: 21/21 PASS
A18/A26 PRODUCTION REMEDIATION COMPLETE: NO
NEW PRODUCTION BYPASS: B4 — AI ONBOARDING POST-TENANT A26/A28 WRITERS
RUNTIME REMEDIATION DEPLOYED: NO
FULL REGRESSION GATE: NOT RUN — STOP
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — PRIOR VERDICT RETAINED
FULL PACKAGE 5 FINAL GATE RERUN: NO
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY: 13/13 — CANONICAL PRODUCTION COVERAGE NOT PROVEN
TENANT HARD DELETE IN PACKAGE 5: FORBIDDEN
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR PROOF: 0
PRODUCTION SCHEMA MIGRATIONS APPLIED THIS CYCLE: 1
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 AUTOMATICALLY DECLARED COMPLETE: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Next work is the same final remediation, with B4 explicitly accounted for in the
production-reachable inventory. Preserve TrialActivation's one logical tenant
outcome and route post-tenant mutations through the already approved owners;
never reset/recreate a completed tenant outcome or add a hard-delete exemption.
Only after all remediation gates and read-only production verification pass may
the complete all-13-family Final Package 5 Gate restart from the beginning.
No Wave 7 and no automatic Final Chapter 6/Chapter 7 work.
