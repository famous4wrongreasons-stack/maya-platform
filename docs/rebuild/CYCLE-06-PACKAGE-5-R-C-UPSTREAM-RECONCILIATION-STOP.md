# R-C upstream reconciliation — exact A18 authority conflict

2026-09-08. Accepted WIP checkpoint **524846ff**. **COMBINED BASELINE CERTIFIED: NO.** Stages 0–2 and proof classification are complete; Stage 3 and further R-C implementation are held by an exact contract contradiction, not a merge/test failure. No upstream or WIP runtime was edited, reverted or reapplied. No new Bxx discovery sequence is started.

## Stage 0 — preserved work

All eight package commits, shared integration and schema commit remain unchanged. The [preservation record](evidence/package5-rc-upstream-reconciliation/preservation.json) pins 11 existing commit trees and verifies SHA-256 of all three synthetic PostgreSQL dumps. Original proofs, nine approved migrations, ratchets and dumps remain available through the [524846ff STOP handoff](CYCLE-06-PACKAGE-5-WAVE-R-C-BASELINE-DIVERGENCE-STOP.md). None was deleted or rewritten. That report's remaining implementation/proof items are still outstanding.

Read-only source/test snapshot: `work/package5-rc-upstream-reconciliation-524846ff/upstream-b6c53ff9` under the existing Codex workspace. It was extracted from Git, is not a new deployment or a transfer of R-C WIP, and contains no running application. Its test dependency symlink is local-only; it must never be used as a production release artifact. No database was started or connected for this review.

## Stage 1 — exact diff and production match

Exact ancestry: `0ad0eef2 → e5ec27fd → b6c53ff9`. [Machine-readable file/overlap evidence](evidence/package5-rc-upstream-reconciliation/exact-diff.json), [first full diff](evidence/package5-rc-upstream-reconciliation/e5ec27fd-exact.diff), [second full diff](evidence/package5-rc-upstream-reconciliation/b6c53ff9-exact.diff).

### e5ec27fd — fix(client): restore verified native consent linking

Eight changed files, paths relative to repository root:

- `maya-saas-backend/src/crm/maya-user-client-association-issuer.ts` — new trusted-resolution adapter.
- `maya-saas-backend/src/crm/client-channel-runtime.service.ts` — selects the new issuer when the current channel has no active link.
- `maya-saas-backend/src/crm/client-profile-read.architecture.ts` — admits the new profile-reader owner and checks its query markers.
- `maya-saas-backend/src/crm/maya-user-client-association-issuer.spec.ts`.
- `maya-saas-backend/src/crm/client-channel-challenge-routing.service.spec.ts`.
- `maya-saas-backend/src/crm/client-profile-read.architecture.spec.ts`.
- `maya-saas-backend/src/action-engine/native-consent-client-link.architecture.spec.ts`.
- `сайт и приложение/app.html` — AMayaConsent changes from PATCH profile to status → issue challenge → consume → canonical consent, with a browser-held command identity.

Production path: existing PWA consent screen → existing `/api/client-channel/challenges` → `ClientChannelRuntimeService.issue` → **new `MayaUserClientAssociationIssuer.resolve`** → existing `ClientLinkChallengeService.issue`; then existing consume/link owner and A18 consent owner. Family **A18**, with downstream B6/B25/B35 and B31–B33 consumers of verified Client authority. The new class is an authority resolver, not a new ORM mutation executor.

Authority implication: a unique `Client.userId` plus a unique same-user CustomerProfile is treated as sufficient verified first-link provenance. The profile's `clientId` may be null. No independent provenance receipt/source is read. This contradicts the already-approved first-link precondition; see U1 below.

Consent/policy implication: explicit privacy/marketing decisions still enter canonical consent. However, the resulting binding can be based on the unproven association. The PWA does not directly write consent, profile, Appointment, or Client. Its identity-creation step is no longer only a passive projection.

Communication/AE implication: no new provider call, send, Communication Delivery owner or Action Engine class; downstream canonical consent writes remain in existing A18/AE. No schema/migration change. Compatibility change affects the existing first-link path and new PWA flow. **Exact file overlap with R-C: only `сайт и приложение/app.html`**; runtime dependency overlap includes Client-bound R06/R08 behavior and assembled PWA consumers.

### b6c53ff9 — fix(client): support installed native consent flow

Four changed files:

- `maya-saas-backend/src/customers/customers.controller.ts`.
- `maya-saas-backend/src/crm/client-channel-runtime.service.ts`.
- `maya-saas-backend/src/crm/legacy-native-consent.service.spec.ts`.
- `maya-saas-backend/src/action-engine/legacy-native-consent-compatibility.architecture.spec.ts`.

Production path: existing installed-native `PATCH /api/customers/me/profile`, exact two-boolean consent payload → `submitLegacyNativeConsent` → if unlinked, issue/consume through the new issuer → `submitConsent` → existing Wave 3 A18/AE. Other profile payloads remain on the existing service route. The HTTP bearer is converted to a `maya_jwt` channel proof; current signed session, tenant, User and Membership checks remain in `ClientChannelAuthenticatorService`.

Authority implication: this automatically exposes the U1 first-link source through an existing compatibility route. A successful `status().linked` alone does not authorize the final write: `resolve` and canonical consent still recheck the binding. Nevertheless, those consumers cannot repair missing original provenance.

Consent/policy implication: explicit booleans are preserved, but the compatibility method derives idempotency solely from `(tenantId, linkId, privacyConsent, marketingConsent)` and ignores the route caller's separate idempotency header for this branch. A later repeated choice is indistinguishable from the first occurrence of that choice (U2 below). No direct ClientConsentFact or CustomerProfile writer was added.

Communication/AE implication: same A18/AE execution owner; no provider/delivery call or new action class. No schema/migration change. **Exact file overlap with R-C: none**; shared authority dependency and assembled compatibility behavior still require integration proof. No new HTTP route, scheduler, provider, channel or independent production surface is introduced.

### Actual production

Read-only verification found `/opt/maya-saas/releases/20260908-native-consent-compat-b6c53ff9`, active `maya-saas` / `barbershop-bot`, health/readiness HTTP 200. The three changed runtime modules (issuer, channel runtime, customers controller) were read and compared with compilation of the exact upstream snapshot.

Initial raw hashes differed. The exact difference was **only the absent final `sourceMappingURL` comment in production**. After removing that single build trailer, every executable byte matches, 3/3. [Compiler/production hashes](evidence/package5-rc-upstream-reconciliation/compiled-production-comparison.json). This certifies the reviewed code's presence in that release; it does not claim a complete new production artifact/schema certification.

## Stage 2 — consent compatibility and exact conflicts

### U1 — unproven FK association becomes verified Client authority (blocking)

Approved source of truth:

- [ClientLinkChallenge schema, Authority boundary](package5-a18-client-link-challenge-schema-v1-proposal.md): “Already proven Maya User↔Client provenance may supply the resolver result.” It then rejects a bare User FK or a combination of heuristics, and explicitly says schema approval does not authorize a heuristic resolver.
- [Approved resolution rules](package5-final-a18-client-channel-link-schema-v1-proposal.md): a bare `Client.userId` or phone-derived association is not retroactive verification evidence; consent consumes an already verified binding.
- [A18 schema assessment](CYCLE-06-BLOCKING-PACKAGE-5-FINAL-A18-BINDING-V1-SCHEMA-ASSESSMENT.md): CustomerProfile/ClientConsentFact are projection/consent effects, not identity-link authority.
- [Challenge implementation report](CYCLE-06-BLOCKING-PACKAGE-5-A18-CHALLENGE-APPLY-AND-AI-BYPASS-STOP-REPORT.md) explicitly retains cold-start denial where trusted resolution has not been proved. Synthetic trust fixtures never supplied production provenance.

Upstream [issuer source](evidence/package5-rc-upstream-reconciliation/issuer-upstream.txt), lines 65–115, selects one Client with `userId = current Maya User`, then one profile by User or Client. It accepts `profiles[0].clientId === null`, and constructs a new hash containing `clientUserBinding: true` / `profileUserBinding: true`. Those booleans and a digest attest what this code observed; they do not establish how the original Client association was verified. Even non-null matching FKs have no queried provenance. An authenticated session proves channel control, which the approved contract explicitly treats as separate from Client authority.

The [executable reconciliation proof](evidence/package5-rc-upstream-reconciliation.proof.cjs) loads **unchanged b6c53ff9 code** from the Git snapshot. With a valid authenticated-channel precondition, no verified link or independent Client-authority receipt, a Client User FK, and a legacy profile whose Client FK is **null**, the real runtime/issuer/challenge path creates a synthetic challenge. It also accepts matching FKs without provenance. Missing/conflicting profile and Telegram first-link cases are correctly denied; those safeguards do not resolve the accepted unproven case. [Observed result](evidence/package5-rc-upstream-reconciliation/contract-proof.json): `CONTRACT_CONFLICT_REPRODUCED`.

Proof limits: in-memory repository fixture, no real database or live user mutation; it proves the actual code's admission predicate and resulting challenge creation, not that a specific production account has exploited it. This is sufficient to withhold certification of the newly introduced authority source. It is not a claim that direct phone matching appears in the new method.

**Classification:** A18 security/business authority contradiction; `LEGACY FALLBACK` / Client-authority provenance gap within already-inventoried surfaces. No new business/schema model is proposed. The unresolved prerequisite is an approved independently verifiable User↔Client provenance source (or preserving fail-closed first linkage where it is absent). Merely naming two FKs “dual durable” does not satisfy that prerequisite. The reviewer does not approve that new trust rule or silently replace it with another one.

### U2 — compatibility decision identity collapses later fresh decisions

The exact unchanged compatibility method produces the same key for first `privacy=true, marketing=true` and a later new `privacy=true, marketing=true` after `marketing=false`. The proof reproduces that key collision. The unchanged Wave 3 planner (`package5-wave3.service.ts`, existing-execution branch in `build`) restores the original consent timestamps and resumes the original source identity, rather than creating a fresh decision. Thus the compatibility adapter cannot represent a new grant after an intervening revoke under the same link. It can return the old successful receipt while current projection/facts remain at the later decision.

The fixture proves the key collision; the last consequence is traced from the existing canonical replay code, **not a claimed live/PG ledger experiment**. This is an implementation defect of the new adapter, not a reason to weaken canonical idempotency or add schema. It is recorded for correction together with the blocking U1 resolution. No runtime fix was made during this incompatible-baseline STOP.

### Preserved invariants and limits

| Required invariant | Review result |
| --- | --- |
| ROW EXISTENCE IMPLIES CONSENT: NO | Preserved at the consent/marketing predicate: explicit decision and canonical facts are still required. **Separate violated invariant:** unproven FK-row existence supplies Client authority in U1. |
| PHONE MATCH AS CLIENT AUTHORITY: NO | No direct phone lookup/match added. Origin/provenance of historical User↔Client FKs is not verified. |
| LEGACY SESSION AS CONSENT AUTHORITY: NO | Installed-native compatibility still requires current signed Maya JWT/AuthSession/User/Membership; no Python legacy session is promoted. |
| MARKETING AUDIENCE == CONSENT: NO | B35 remains unchanged: latest privacy/marketing facts must be grants, profile projection/current preferences must allow dispatch. Audience selection is insufficient. |
| OWNER APPROVAL BYPASSES CLIENT CONSENT: NO | Current owner approval is checked separately and does not bypass ClientConsentFact/preferences gates. |
| Hidden Client creation | None added; the issuer reads an existing Client. Canonical challenge/link writes do occur, on U1's inadequate authority. |
| New direct consent/business ORM writer | None added. Existing challenge/link owners and existing A18/AE own writes; using those writers does not validate the new resolver's trust source. |
| Notification preferences | No code/schema/default change in upstream. B6 preference ≠ consent semantics remain. |
| B25/B35/CD admission | No new delivery bypass or UNKNOWN retry mechanism. Client-bound end-to-end assurance still depends on correct original link provenance. |

## Proof results and ratchet limitation

- Exact upstream targeted tests: **6 suites / 27 tests PASS**.
- Relevant existing link/schema, Client appointment/realtime authority, AE approval-binding, bulk consent and delivery tests: **8 suites / 98 tests PASS**.
- Exact upstream project TypeScript compilation: PASS; no application started.
- Separate negative-authority proof: **U1 conflict reproduced**, plus U2 key collision. No production effects or database connections.

[Targeted output](evidence/package5-rc-upstream-reconciliation/upstream-targeted-tests.txt) and [shared-boundary output](evidence/package5-rc-upstream-reconciliation/shared-boundary-tests.txt). The upstream tests expressly expect the unproven FK-pair case to be accepted. The changed profile-read ratchet permits that issuer and checks query/PII markers; it does not require independent Client-authority provenance. Passing those tests is therefore not a contract compatibility certificate. Do not edit the approved contract to match these positive fixtures.

## Stage 3 — WIP application gate

**NOT RUN**, because contracts are incompatible. R05/R06/R08/R09/R11/R12/R13/R14 `WIP APPLIES CLEANLY` is **NOT TESTED / BLOCKED BY U1**, not a merge conflict result. No rebase, cherry-pick, merge or history rewrite occurred. A file-intersection check found only the canonical PWA overlapping; this is not proof of semantic applicability.

## Stage 4 — UNCHANGED / MUST RERUN

Historical executable evidence remains valid for its original fixture and code. No package's incomplete local acceptance at 524846ff is upgraded here.

| Package | UNCHANGED evidence/contract | MUST RERUN after compatible reconciliation |
| --- | --- | --- |
| R05 | Report schema CHECK, owner/slot order, B36 concurrency/restart mechanics | Composed PWA; full outstanding B36 and package acceptance/shared-wave checks already listed in the WIP handoff |
| R06 | OperationalAlertRun/Inbox source and retention mechanics | Client-bound B25/B48/B49 flows with newly established link authority; consent/preferences/CD and composed PWA/integration |
| R08 | Exact model/constraints, feedback revision/retention mechanisms | End-to-end Client identity, own Appointment/feedback access, invitation marketing consent, link revocation and CD admission |
| R09 | Anonymous facts/moderation/schema contract | Composed public/PWA artifact integration; remaining local acceptance from the handoff |
| R11 | A22 tenant settings and personal preferences schema/ownership | PWA/settings consumers and Client history/access integration; shared consent/preferences checks |
| R12 | Team schema, storage, same-object restart and AC6 mechanisms | Assembled PWA/native session integration plus pending package-local checks |
| R13 | R02 staff principal/P407 intake/reminder/retention schema and proofs | Assembled PWA/auth integration plus pending package-local checks |
| R14 | Cash schema, confirmation/revision/restart/retention mechanics | Assembled PWA/auth integration and pending AE/package-local checks |

Shared required reruns after remediation of U1/U2: first-link provenance and negative fixtures; ClientConsentFact grant/revoke/new-grant; notification preferences; B6/B25/B35 policy; Communication Delivery admission/reconciliation; B31/B32/B33 Client ownership; affected R06/R08 execution paths; ActionExecution/kernel regressions; combined schema interaction/clean replay and pending/drift checks on the final merged schema. **No upstream Prisma/migration/action-class diff exists**, so the approved 11/197/21 schema envelope and all eight Option A decisions remain valid. This review does not substitute a static no-schema-diff result for the previously required final combined PostgreSQL proof.

No blind full mandatory suite or Package 5 Final Gate was run. The final wave gate remains after local package completion, and the final Package 5 gate remains after 14/14 packages / 24/24 blockers production PASS.

## Surface/accounting verdict

This changes behavior inside existing **S01 HTTP, S02/S03 PWA, S05 compatibility, S28 identity and S32 legacy projection** coverage. A new internal resolver file is not a new independently un-inventoried production surface. Existing Client-channel and profile routes were present in the certified inventory; no new route/provider/worker/channel was discovered. **NEW PRODUCTION SURFACES: 0; INVENTORY DEFECT: NO.** U1/U2 are upstream reconciliation conflicts, not additional Bxx inventory entries.

```text
COMBINED BASELINE CERTIFIED: NO
UPSTREAM COMMITS REVIEWED: 2/2
PRODUCTION RELEASE MATCHES b6c53ff9: YES
UPSTREAM CHANGE REOPENS APPROVED CONTRACT: YES — A18 first-link trust source
UPSTREAM CHANGE INVALIDATES R-C SCHEMA: NO
UPSTREAM CHANGE INVALIDATES R-C RUNTIME PROOF: YES — Client-authority end-to-end assurance
UPSTREAM CHANGE CREATES NEW PRODUCTION SURFACE: NO
NEW PRODUCTION SURFACES: 0
INVENTORY DEFECT: NO
R-C PACKAGES INVALIDATED: R06/R08 Client-authority proofs; all assembled PWA proofs require reconciliation
R-C SCHEMA CHANGES STILL VALID: YES
R-C BUSINESS DECISIONS STILL VALID: YES
PROOFS REQUIRING RERUN: A18 provenance/consent lifecycle; B6/B25/B35; Client identity/B31-B33; R06/R08; CD/AE; merged PWA; combined schema
WAVE R-C WIP: PRESERVED
WAVE R-C READY TO RESUME: NO
WAVE R-C PRODUCTION CUTOVER: NO
ADDITIONAL PRODUCTION MIGRATIONS: 0
PACKAGES COMPLETE AT LAST CERTIFICATION: 6/14
BLOCKERS REMEDIATED AT LAST CERTIFICATION: 10/24
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION MUTATIONS/MESSAGES/PROVIDER EFFECTS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
PROCESS HYGIENE: 0
```

[Verdict JSON](evidence/package5-rc-upstream-reconciliation/verdict.json), [hygiene](evidence/package5-rc-upstream-reconciliation/hygiene.json): main 24 entries / 22 hashes unchanged, 85 protected historical schema/inventory files unchanged, owned processes/watchers/browsers/databases zero. Only this report and evidence/proof script are committed on the isolated branch. Canonical `b6c53ff9` and all R-C WIP commit trees are preserved. **STOP pending a contract-compatible first-link provenance resolution.**
