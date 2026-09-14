# CYCLE 06 BLOCKING PACKAGE 4 — P4-04 RATCHET SYNCHRONIZATION

Status: **PASS — ratchet synchronized; build/deploy remains a separate step**
Source checkpoint: `5419b313`
Report date: 2026-09-01

## 1. Scope

This checkpoint changes only the Chapter 2 client-registration ownership
ratchet. It does not change P4-04 runtime, schema, referral/reward contracts,
Action Engine wiring, or production configuration.

The accepted P4-04 ALL-4 executable proof remains `PASS`. Production cutover,
build, deploy, and the next Package 4 family were not started.

## 2. Narrow proof-surface classification

The registration scan now classifies exactly these two files as controlled
PostgreSQL proof fixtures:

- `scripts/p4-03-all8-executable-proof.ts`;
- `scripts/p4-04-all4-executable-proof.ts`.

Classification requires both the exact file path and both physical safety
markers assigned to that file:

1. the exact disposable database-name prefix check;
2. the exact refusal marker for non-disposable databases.

The rule does not exclude the `scripts` directory, a filename glob, or an
arbitrary proof-like name. If either required marker is removed, even the exact
fixture path returns to the production-owner set.

## 3. Bypass protection

After removing only the two proven disposable fixtures from the registration
mutation scan, the sole production registration owner remains:

`src/crm/client-identity.service.ts`

That owner still checks the tenant-qualified active
`UnresolvedClientIdentityHold` inside the serializable write transaction before
creating `Client` or `CrmClientLink`.

The ratchet separately proves that:

- direct HTTP and background-job registration owners are rejected;
- a look-alike P4-04 proof file with the same text markers but a different path
  is rejected;
- removing either disposable-database marker from the exact P4-04 fixture makes
  it fail classification.

No production-reachable registration bypass was allowlisted.

## 4. Verification

| Check                                     | Result                                 |
| ----------------------------------------- | -------------------------------------- |
| Synchronized registration ratchet         | PASS — `1/1` suite, `6/6` tests        |
| Exact P4-04 preflight matrix              | PASS — `21/21` suites, `127/127` tests |
| Real direct-registration bypass detection | PASS                                   |
| Look-alike proof path rejection           | PASS                                   |
| Exact-path marker removal rejection       | PASS                                   |
| Runtime/schema/contract changes           | `0`                                    |
| Production writes                         | `0`                                    |
| Referral/reward/value mutations           | `0`                                    |
| Provider writes                           | `0`                                    |
| Build/deploy                              | NOT STARTED                            |

## 5. Verdict

`P4-04 RATCHET SYNCHRONIZED: YES`

`P4-04 PREFLIGHT TESTS: 21/21`

`P4-04 PREFLIGHT ASSERTIONS: 127/127`

`ARCHITECTURAL BYPASS PROTECTION WEAKENED: NO`

`PROOF SCRIPT CLASSIFIED TEST-ONLY: YES`

`PRODUCTION WRITES: 0`

`VALUE MUTATIONS: 0`

`READY TO RESUME BUILD/DEPLOY GATE: YES`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 6. Permanent process hygiene

All verification commands were foreground and self-terminating. No disposable
database, watcher, browser, or background service was started.

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Build/deploy and production cutover were not started.
