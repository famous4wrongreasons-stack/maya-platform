# Cycle 06 Blocking Package 4 — P4-04 Runtime Contract-to-Value Alignment Report

Date: 2026-09-01

Starting checkpoint: `ce177106`

Scope: local runtime alignment only; no ALL-4 executable proof, production deployment, cutover, or business/value write.

## Outcome

The four existing P4-04 canonical Shadow paths now use the durable contracts approved by the Contract-to-Value Closure Gate and deployed by the production schema migration gate.

No additional schema is required.

## Frozen reward value

`issue_referral_rewards` now derives one of two explicit, native discount entitlements:

- `FIXED_MONEY_DISCOUNT`: frozen `amountKopecks`, currency, and identical maximum liability;
- `PERCENT_DISCOUNT`: frozen basis points, currency, and an explicit maximum liability.

The issuance plan freezes the policy snapshot/version, denomination, value fields, maximum liability, expiry, recipient/slot, presentation key version, deterministic reward identity, and claim lookup hash. A later policy change cannot rewrite an already-issued reward, and a qualified referral with an existing issuance fails closed before the current program is read.

No kopeck/percent-to-points conversion exists. P4-04 does not create or plan `LoyaltyTransaction`.

## Exact fulfillment target

`fulfill_referral_reward` now requires a provider-qualified external record identity and resolves one exact canonical `Appointment` server-side. The canonical target contract freezes:

- tenant and recipient Client;
- canonical Appointment;
- provider record identity and optional provider visit identity;
- sorted service identity set;
- eligible gross amount and currency;
- deterministic `targetIdentityHash`;
- exact applied discount derived from the frozen reward.

Changed tenant, Client, record, visit/service evidence, eligible value, or currency fails closed. The path no longer treats a LoyaltyAccount as the reward application target.

## Crash-safe bearer presentation

The issue and consume sides share `referralRewardClaimLookup.v1`. A separate versioned presentation PRF derives a bearer from immutable issuance/reward facts. Only the lookup HMAC, key version, and non-secret presentation reference are planned for persistence.

The internal presentation service:

- resolves immutable reward facts server-side;
- selects the retained key by `presentationKeyVersion`;
- re-derives the same bearer after restart;
- verifies the derived lookup against the durable `codeHash`;
- fails closed for a missing key, wrong recipient, or mismatched lookup;
- performs no database write.

Repeated presentation is therefore not repeated issuance. Raw bearer material is never stored by the aligned path.

## Scheduler envelope and caps

A registered Shadow-only scheduler envelope capability now records one deterministic batch `ActionExecution` before child planning. It enforces the approved contract:

- maximum 25 referrals;
- maximum 50 recipients;
- maximum 50,000 kopecks liability per reward;
- maximum 100,000 kopecks liability per referral issuance;
- maximum 2,500,000 kopecks aggregate envelope liability;
- one tenant and one currency;
- exact 15-minute policy window;
- owner approval scope;
- deterministic exact audience and child identities;
- bounded per-referral fan-out;
- restart/resume over unfinished child identities without creating new value capacity.

The capability remains `SHADOW_ONLY`, `L2_5_SHADOW`, with executor `shadow.none` and zero value mutations.

## Preserved boundaries

- Shadow 4/4 remains physically non-executable.
- Canonical Action Ingress / Action Engine remains the planning owner.
- Caller-supplied entitlement, policy, approval, value, target, executor, and binding authority remains rejected.
- One-time fulfillment uniqueness and tenant-qualified durable bindings are unchanged.
- P02/P03 unresolved identity hold is not changed or bypassed.
- P4-03 canonical loyalty is not changed.
- No legacy loyalty fallback was introduced.
- There is no external dispatch in these aligned Shadow paths, so no artificial `UNKNOWN` state was introduced.

## Verification

- Targeted Jest: `18/18` suites, `99/99` tests — PASS.
  - all four P4-04 Shadow service/contract/architecture regressions;
  - Action Engine registry;
  - frozen fixed/percent value;
  - exact target and changed-target rejection;
  - presentation/re-presentation and raw-secret non-persistence;
  - deterministic envelope, caps, bounded fan-out, and resume;
  - positive contract-to-value architecture ratchet.
- Python bridges: `4/4` tests — PASS.
- Targeted ESLint — PASS.
- Application typecheck — PASS.
- Scripts typecheck — PASS.
- Build + build preflight — PASS.
- Full suite — not run; it is outside this targeted alignment step.
- ALL-4 executable proof — not run.

## Side effects and scope control

`PRODUCTION DEPLOYMENT: NO`

`PRODUCTION CUTOVER: NO`

`PRODUCTION REFERRAL/REWARD/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`ADDITIONAL MIGRATIONS: 0`

`P4-02/P4-03 CHANGED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## Verdict

`P4-04 RUNTIME CONTRACT ALIGNMENT: COMPLETE`

`FROZEN REWARD VALUE USED BY RUNTIME: YES`

`EXACT FULFILLMENT TARGET USED BY RUNTIME: YES`

`CRASH-SAFE PRESENTATION WIRED: YES`

`SCHEDULER ENVELOPE/CAPS WIRED: YES`

`IMPLICIT REWARD→POINTS CONVERSION: NO`

`SHADOW 4/4 PRESERVED: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`PRODUCTION VALUE MUTATIONS: 0`

`READY TO RE-RUN P4-04 ALL-4 EXECUTABLE PROOF: YES`

## Process hygiene

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`
