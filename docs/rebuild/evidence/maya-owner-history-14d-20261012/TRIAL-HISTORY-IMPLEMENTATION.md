# H-2 Option A — ordinary full-trial personal-history configuration

Date: 2026-10-12, Europe/Moscow.
Branch: `codex/maya-local-crm-setup-20261010`.
Qualification: local implementation and synthetic tests, not release certification
or live personal-history/AChat acceptance.

## Approved boundary

The owner approved [H-2 Option A](TRIAL-HISTORY-DECISION.md). All ordinary tenants
use the same rule; there is no salon/founder exception. The existing
`client_capabilities` v1 namespace contains only `client_self_visit_history`.
For this namespace, current `status=trial`, `trialFullAccess=true` and a valid
future `trialEndsAt` now qualify alongside the existing active-tenant path.
An exact expiry instant is already expired. Missing/malformed expiry,
setup-only trial, suspended/cancelled tenant and inactive User/Membership fail
closed. Existing staff read roles are preserved; tenant writes remain owner-only.

The read owner, A22 command admission/planning, execution and successful receipt
replay all recheck applicable current authority. Namespace comes from the parsed
canonical command or verified stored input, not a caller-authored bypass flag.
Receipt replay checks admitted Membership identity and role again, including a
concurrent winner. A historical success is not current permission to disclose it.
Missing retained trusted input does not become a fallback authorization.

Explicit confirmation, same-intent idempotency, expected revision/generation,
canonical Action Engine transaction and audit remain required. Other trial
configuration namespaces and personal staff preferences remain refused. Existing
active-tenant paths remain available. This setting grants no Client identity,
privacy consent, booking authority, `widgets.runtime` entitlement or HANDOFF.

## Implementation provenance

- `4264bdef`: the three product owners below implement H-2.
- `8a84c108`: synthetic authority proof and canonical tenant resolution checks.
- `a8d554b4`: disposable proof respects the kernel Membership foreign key.
- `8d5720dbdd0cafb29c935c01bb6d4d437e2fb4d9`: unique mutation anchor and
  typed test mocks; no product or HTTP proof source changes from `a8d554b4`.

Product changes are confined to:

- `maya-saas-backend/src/package5-wave1/governed-settings.read.ts`
- `maya-saas-backend/src/package5-wave1/package5-wave1-canonical-cutover.service.ts`
- `maya-saas-backend/src/package5-wave1/package5-wave1.service.ts`

There are no schema, migration, carrier, UI, headless runtime, provider adapter,
entitlement, Client identity or booking source changes in this unit. Test database
creation/migration is exclusively in disposable synthetic PostgreSQL clusters.

## HTTP/PostgreSQL evidence

Executed source: `a8d554b4a844f17c914d3f066f6342aec9ceb1bd`.

The H-2 proof uses the compiled AppModule, actual HTTP authentication/guards and
A22 owners. It passes 16 checks: full-trial enablement; exact revision/audit;
concurrent same-key receipt without duplicate effect; changed intent/stale CAS;
unconfirmed/extra authority fields; other-namespace refusal; owner-only writes;
tenant substitution; expiry/setup-only/lifecycle refusal; revoked membership and
User; permission changes between READY admission and execution; one winner for
distinct concurrent keys; active-tenant/personal-preference regression; and no
widget grant, booking, Client link or external request.

An unrelated `X-Tenant-Id` header is not a tenant selector: the HTTP route uses
the authenticated principal and returns only its tenant's exact revision. A
conflicting internal tenant context is refused and the foreign tenant is unchanged.

The database refuses deleting an admitted actor membership because of the
existing ActionExecution actor-pair FK. To test admitted row identity separately,
the synthetic pending fixture changes only the membership primary key while
preserving the tenant/User pair. No schema/FK/trigger is disabled; resume refuses
the changed membership, with zero mutation, revision or attempt committed.

The existing compiled personal-history + actual-child IPC proof also passes
16 checks on this source. It retains exact-Client filtering, catalogue refresh
without reimport and the local effect restrictions. Its private HTTP projection
can contain the requesting Client's own notes; the old check label mentioning
notes is not a blanket redaction claim. See the [projection clarification](LIVE-RESULT.md#projection-clarification).

Both disposable clusters stopped, their PID files were absent and source pins
remained unchanged. H-2 rejects any external fetch; the older actual-child proof
additionally uses external-network denial for the child. Neither run used real
provider credentials, the retained owner database or customer rows.

## Exploratory failures retained

- HTTP proof 01 incorrectly expected a caller header to switch tenant and return
  403. Actual behavior was safe authenticated-tenant resolution; the assertion
  was corrected to verify the returned tenant and foreign-state absence.
- HTTP proof 02 attempted delete/recreate of an admitted membership; the canonical
  FK refused it. The final fixture explicitly proves that refusal, then checks
  admitted row identity as described above.
- Mutation attempt 01 refused an ambiguous text anchor before mutating anything.
  Its baseline/restored tests passed; it is not a completed mutation receipt.
- Initial test lint reported mock typing/style issues. These are test-only
  corrections; the product files separately passed lint and typechecking.

No timeout was raised and no product safeguard was removed to satisfy a fixture.

## Completed local qualification

| Surface | Executed HEAD | Result |
| --- | --- | --- |
| Full `test:backend` command | `a8d554b4` | 9,611 PASS, zero FAIL, 18 filtered |
| Explicit completion of 17 multiline-name cases | `8d5720db` | 17 PASS, zero FAIL |
| Wave1 focused final suites | `8d5720db` | 98 PASS across seven suites |
| H-2 authority mutations | `8d5720db` | 8/8 killed by the expected assertions; baseline/restored each 28 PASS |
| Compiled H-2 HTTP/PG proof | `a8d554b4` | 16/16 PASS |
| Existing compiled history/IPC/child regression | `a8d554b4` | 16/16 PASS |
| Product typecheck and scoped product lint | `a8d554b4` product bytes | PASS |
| Final H-2 test lint | `8d5720db` test bytes | PASS |

The existing `test:backend` name filter uses `.` without multiline coverage;
besides the single labelled `[INTEGRATION-ONLY]` R01 case, it excluded 17 tests
whose interpolated Error/input names contain newlines. All 17 were explicitly
run with a newline-name filter in their six source suites and passed. Their
identities were matched to the original skipped cases. Combined coverage is
**9,628 passed, zero failed, one integration-only case not executed**. The
supplement's other 188 filtered cases were already covered by the main run;
they are not 188 further omissions. The shared package command was not changed
as part of this narrowly scoped H-2 unit.

The three product files and both compiled proof runners are byte-identical
between the two reported HEADs. The final test-only change adjusts mocks and a
mutation anchor; subsequent documentation commits are not independently tested
release candidates. [trial-history-proof-summary.json](trial-history-proof-summary.json)
records exact HEADs, hashes, results and local receipt provenance. A manifest
hash is provenance, not a substitute for an executed receipt.

Gitleaks 8.30.1 found zero findings in the new committed source history
(`1bc241a9..8d5720db`) and the five new/updated documentation artifacts. Only
allowlisted aggregate projections and receipt hashes are archived; real retained
state, secrets, raw customer rows and raw logs are not copied into these files.

**H-2 OPTION A: IMPLEMENTED / SYNTHETIC PASS.**
**RETAINED REAL HISTORY SETTING: NOT CHANGED IN THIS UNIT.**
**LIVE PERSONAL HISTORY / ACHAT: STILL NOT PASSED.**
**RELEASE / PRODUCTION CERTIFICATION: NOT CLAIMED.**

## Real execution remains separate

The prior imported journal (162 rows, with four matching the verified personal
Client in the historical aggregate) and saved consent remain local. This unit
did not start or change that retained database, enable its history setting,
refresh its trial status, reread YCLIENTS or repeat the import. The prior live
403/500 outcomes remain historical failures, not retroactive passes.

A future authorized local continuation must freshly verify the current trial,
principal, Client link and consent, then use the existing confirmed A22 command
and personal reader against the saved journal. It must not rerun the one-import
launcher merely to read saved history. Model/AChat calls and real external
effects require their own applicable allowance. No production or C10 work was
performed or authorized here.
