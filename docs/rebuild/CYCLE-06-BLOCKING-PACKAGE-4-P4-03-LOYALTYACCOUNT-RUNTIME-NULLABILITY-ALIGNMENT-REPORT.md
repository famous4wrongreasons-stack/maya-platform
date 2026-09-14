# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 LOYALTYACCOUNT RUNTIME NULLABILITY ALIGNMENT REPORT

Status: **PASS — CLIENT-OWNED RUNTIME ALIGNED; NO ACCOUNTS OR VALUE CREATED**

Source checkpoint: `04d9a8b6`

Date: 2026-08-31

Branch: `codex/maya-brain-systemic-release-20260815`

## 1. Scope and safety boundary

This step aligned the existing P4-03 loyalty runtime with the already approved
ownership contract:

```text
value owner = tenant-qualified Client
requester/actor = User + Membership only when the action requires an actor
```

It did not create or bind a LoyaltyAccount, migrate a ledger row, mutate a
balance, issue or consume a grant, change P02/P03, write to a provider, deploy
runtime, or start P4-03 cutover, Package 5, or Chapter 7.

## 2. Five compile failures classified

Fresh Prisma Client compilation reproduced exactly five nullable-owner errors.

| Location | Classification | Resolution |
| --- | --- | --- |
| Grant issue Shadow: `account.membership` | Historical owner-is-member assumption. Issue planning is system/policy derived; the guest value owner does not need Membership. | Resolve the established account by `(tenantId, clientId)` and do not read owner Membership. Executable issue still requires `server_resolved_eligible_requester`. |
| Grant consume Shadow: `account.membership` | Historical owner-is-member assumption. Consume does require a privileged actor, but that actor is not the grant owner. | Resolve owner account by Client. Keep requester AuthIdentity, active Membership, role and server cashier allowlist mandatory. |
| `LoyaltyService.isSameAdjustment`, call 1 | P4-02 adjustment remains an explicit User-targeted action. Nullable account owner must not be asserted non-null. | Accept `string | null`; exact comparison makes a Client-only account fail closed for that User-targeted replay. |
| `LoyaltyService.isSameAdjustment`, call 2 | Same P4-02 historical type assumption. | Same explicit nullable comparison; no non-null assertion. |
| `LoyaltyService.isSameAdjustment`, call 3 | Same P4-02 historical type assumption. | Same explicit nullable comparison; no non-null assertion. |

Compile errors after alignment: `0`.

## 3. Owner and requester separation

The eight P4-03 paths no longer require `Client.userId` to identify the value
owner:

- earn resolves the exact active CrmClientLink to Client;
- expiry, import, backfill, redeem, refund, grant issue and grant consume find
  the already established LoyaltyAccount by `(tenantId, clientId)`;
- the executable family uses the same Client-qualified account key;
- the executable no longer upserts or manufactures an account during a value
  action;
- a missing, merged or account-less Client fails closed;
- no User, Membership or AuthIdentity is created by any aligned path.

Grant consume preserves the independent actor boundary. Its requester must
still resolve through tenant-qualified AuthIdentity to an active Membership
and an eligible server-derived role/allowlist decision. The grant owner may be
a guest Client with `userId = NULL`.

Grant issue Shadow remains physically non-executable. Its executable contract
continues to reject anything other than
`server_resolved_eligible_requester` evidence.

## 4. Read and provider-evidence paths

`LoyaltyService` now exposes internal Client-owned balance and history reads
for callers whose requester authorization has already been established by the
policy layer. These reads:

- tenant-qualify Client and LoyaltyAccount;
- reject missing or merged Client ownership;
- do not create an account;
- do not require User or Membership;
- decrypt history exactly as the existing user-owned read does.

Guest import/backfill no longer depend on a User phone. They start from the
already exact CrmClientLink external id:

- backfill reads the complete provider registry, requires the same provider,
  and selects exactly one matching external id;
- import uses a centralized read-only external-id evidence boundary, which
  maps the exact provider id to the provider's legacy phone-based read and
  verifies that the returned card resolves back to that same id;
- neither read performs shadow registration, identity writes or provider
  writes.

## 5. P02/P03 and authority invariants

The unresolved collision remains fail closed:

- P02/P03 have no canonical CrmClientLink/Client account path;
- the live `UnresolvedClientIdentityHold` registration guard remains active;
- aligned loyalty paths require an exact active link and established
  Client-owned account;
- no legacy mutating fallback was added.

Tenant isolation, one-time redemption, revocation/expiry checks, bulk
caps/approval, Action Engine policy, and `UNKNOWN != FAILED` behavior were not
weakened.

## 6. Targeted verification

All checks ran sequentially.

| Verification | Result |
| --- | --- |
| Guest-owner behavior and registration guard | `11/11` suites, `88/88` tests |
| Existing P4-03 Shadow/executable architectural ratchets | `10/10` suites, `40/40` tests |
| Total targeted verification | `21/21` suites, `128/128` tests |
| Targeted ESLint for every changed TypeScript file | PASS |
| Application typecheck | PASS — `0` errors |
| Scripts typecheck | PASS — `0` errors |
| Build + build preflight | PASS |

The targeted set proves:

1. a guest Client account loads with `userId = NULL`;
2. balance and history read by exact Client identity;
3. system earn planning accepts a guest owner;
4. expiry, backfill and import planning accept a guest owner;
5. refund planning accepts a guest owner;
6. privileged consume uses a separate authenticated actor;
7. a missing/ineligible actor fails closed;
8. no fake User or Membership is created;
9. unresolved identity registration remains blocked;
10. executable mutations require a pre-established Client-owned account;
11. direct mutation and legacy fallback ratchets remain active.

No full suite was run; the user authorized targeted verification for this
alignment step.

## 7. Production and data safety

`PRODUCTION WRITES: 0`

`LOYALTY ACCOUNTS CREATED: 0`

`LOYALTY LEDGER MUTATIONS: 0`

`LOYALTY BALANCE MUTATIONS: 0`

`GRANTS CREATED OR CONSUMED: 0`

`PROVIDER WRITES: 0`

`P02/P03 HOLD CHANGES: 0`

`FULL_LEDGER MIGRATION STARTED: NO`

`P4-03 CUTOVER STARTED: NO`

## 8. Process hygiene

All verification commands were foreground, bounded, and observed through
normal completion. No watcher, test server, browser, temporary database, or
background worker was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

## 9. Verdict

`RUNTIME NULLABILITY ALIGNED: YES`

`COMPILE ERRORS REMAINING: 0`

`CLIENT-OWNED ACCOUNT WORKS WITHOUT USER: YES`

`ACTOR AUTHORITY STILL ENFORCED: YES`

`FAKE USER/MEMBERSHIP REQUIRED: NO`

`P02/P03 HOLD PRESERVED: YES`

`PRODUCTION WRITES: 0`

`READY FOR LOYALTYACCOUNT ESTABLISHMENT: YES`

STOP. LoyaltyAccount establishment, control binding, FULL_LEDGER migration,
P4-03 cutover, Package 5, and Chapter 7 remain separate explicitly authorized
steps.
