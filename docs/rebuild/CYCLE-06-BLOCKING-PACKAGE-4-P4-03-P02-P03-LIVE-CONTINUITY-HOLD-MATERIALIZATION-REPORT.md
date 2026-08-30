# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 P02/P03 LIVE CONTINUITY HOLD MATERIALIZATION REPORT

Status: **PASS — ONE LIVE COLLISION HOLD MATERIALIZED**

Source checkpoint: `6a425784`

Date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Authorized scope

This step created exactly one production `UnresolvedClientIdentityHold` for
the already approved P02/P03 collision group. It did not create a Client,
CrmClientLink, ActionExecution, loyalty ledger row, grant, redemption, merge,
provider mutation, or historical value correction.

The schema intentionally has no child membership table. The two source
principals are represented exactly as approved:

- `unresolvedPrincipalCount = 2`;
- immutable `sourceEvidenceHash` binding the source namespace, tenant-qualified
  provider identity, two opaque legacy-principal references, and two opaque
  provider-record references;
- no raw name, phone, Telegram id, provider record id, bearer, balance, or
  ledger payload in the hold.

## 2. Immediate pre-apply revalidation

The complete provider registry and legacy SQLite source were read again
immediately before the transaction. The provider operation was the existing
read-only registry-search contract; no provider mutation endpoint ran.

| Required fact | Result |
| --- | ---: |
| Provider snapshot complete | yes |
| Provider pages loaded | `29` |
| Legacy principals | `25` |
| Exact provider mappings | `25/25` |
| Unique provider identities | `24` |
| Collision groups | `1` |
| Collision principals | `2` |
| Collision principal identities distinct | yes |
| Historical provider records still bind the collision card | `2/2` |
| P02/P03 ledger partition | `2 rows / 490` + `1 row / 90` |
| Collision aggregate | `3 rows / 580` |
| Safe principals | `23/23` |
| Safe identity collision groups | `0` |
| Safe ledger partition | `118 rows / 64,221` |
| Complete legacy ledger | `121 rows / 64,801` |
| Source stable during snapshot | yes |
| Existing hold rows | `0` |
| Existing Client / CrmClientLink rows | `0 / 0` |
| Existing canonical loyalty/grant/redemption rows | `0 / 0 / 0` |

The earlier report's 12-character display references did not document their
hash-domain separator and therefore were not treated as runtime authority.
Continuity was instead re-proven from the stronger accepted evidence: the two
distinct stable legacy source principals, their unchanged ledger partition,
the single exact current provider-card mapping, and both historical provider
records still resolving to that same card. No fuzzy or PII-based match was
used.

## 3. Materialization transaction

One PostgreSQL `SERIALIZABLE` transaction repeated the canonical database
preconditions and required:

- exactly one active tenant integration for the exact provider company;
- no existing hold for the tenant/provider/external-id tuple;
- no existing CrmClientLink for the collision tuple;
- no active hold among the 23 safe provider identities;
- unchanged zero counts for Client, CrmClientLink, canonical loyalty,
  grant, and redemption rows.

It then inserted one active row with:

- provider `yclients`;
- reason `loyalty_identity_unresolved`;
- source namespace `legacy-sqlite:barbershop-bot-production:v1`;
- immutable 64-hex evidence hash;
- unresolved principal count `2`;
- no resolution timestamp or resolution ActionExecution.

The transaction verified its own postcondition before commit:

`Hold +1; Client +0; CrmClientLink +0; LoyaltyTransaction +0; Grant +0; Redemption +0`.

## 4. Live guard proof

After commit, the deployed production `ClientIdentityService` was invoked for
the real tenant-qualified collision identity. It stopped before link lookup or
creation with:

`client_identity_unresolved`

The same deployed read-only guard evaluated the exact 23 safe provider
identities:

`SAFE ALLOWED: 23/23`

No fixture override or in-memory hold was used in this proof. The decision came
from the live production hold row.

The existing architectural ratchet was rerun locally:

| Gate | Result |
| --- | --- |
| Registration guard suites | `2/2` |
| Assertions | `21/21` |
| Production registration owners | `1` |
| Production registration bypass paths | `0` |
| Synthetic direct HTTP/background owner still detected | yes |

## 5. Post-apply production verification

| Check | Result |
| --- | --- |
| Hold rows / active holds | `1 / 1` |
| Canonical reason rows | `1` |
| Approved source namespace rows | `1` |
| Principal count = 2 rows | `1` |
| Valid 64-hex evidence rows | `1` |
| Client rows | `0` |
| CrmClientLink rows | `0` |
| Canonical LoyaltyTransaction rows | `0` |
| Grant / redemption rows | `0 / 0` |
| ActionExecution rows | unchanged — `509` |
| Legacy ledger | unchanged — `121 / 64,801` |
| Collision value | preserved read-only — `580` |
| Health / readiness | `200 / 200` |
| Priority service error entries | `0` |
| Active runtime | `20260831-c06-p4-p403-identity-hold-guard-bdcd0aec` |

## 6. Side-effect boundary

`HOLD ROWS CREATED: 1`

`CLIENTS CREATED: 0`

`CRMCLIENTLINKS CREATED: 0`

`ACTIONEXECUTIONS CREATED: 0`

`LOYALTY VALUE MUTATIONS: 0`

`GRANTS CREATED: 0`

`PROVIDER WRITES: 0`

`P02/P03 MERGED: NO`

`REFUND 800 CORRECTED: NO`

`FULL_LEDGER MIGRATION STARTED: NO`

`P4-03 CUTOVER STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 7. Process hygiene

All commands ran sequentially. Five bounded helper processes were
lifecycle-owned: two read-only provider/identity audit processes, the final
materialization audit process, its single foreground Node database child, and
the targeted Jest process. Every process completed and was waited; no
background server, watcher, browser, Playwright process, or temporary database
was started.

`TEMP PROCESSES STARTED: 5`

`TEMP PROCESSES TERMINATED: 5`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES CREATED: 0`

`TEMP DATABASES REMAINING: 0`

## 8. Verdict

`P02/P03 LIVE HOLD MATERIALIZED: YES`

`P02/P03 AUTO-REGISTRATION BLOCKED BY LIVE HOLD: YES`

`23 SAFE IDENTITIES STILL REGISTRABLE: YES`

`CLIENTS CREATED: 0`

`CRMCLIENTLINKS CREATED: 0`

`LOYALTY VALUE MUTATIONS: 0`

`HOLD COLLISION VALUE PRESERVED: 580`

`REGISTRATION BYPASS PATHS: 0`

`READY FOR SAFE IDENTITY ESTABLISHMENT: YES — IDENTITY LAYER ONLY`

STOP. The 23 safe principals were not registered. FULL_LEDGER migration,
P4-03 cutover, Package 5, and Chapter 7 were not started.
