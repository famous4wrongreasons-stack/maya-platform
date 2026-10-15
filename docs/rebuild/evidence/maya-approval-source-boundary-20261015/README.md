# Approval source boundary: diagnostic proof, not release admission

Tested commit: `bd4e9da71000c5a22b855bf896c657cafdff7ce8`, branch
`codex/maya-local-crm-setup-20261010`. Only
`maya-saas-backend/test/widgets-live/approval-source-boundary.live-spec.ts`
changed in that commit. Product, schema, registry, profile and audit bytes did
not change. This archive adds documentation only.

## Measured result

The clean committed-head baseline and restored control both pass **12 HTTP/PG
tests and 53 adapter unit tests**, with live-test types passing. HTTP uses the
actual Nest application, authentication, migrated PostgreSQL, CRM service and
YCLIENTS adapter. A loopback-only server supplies artificial provider wire facts;
there is no model/parser/CRM-service/adapter override in the new HTTP suite.
The 53 pre-existing unit tests separately use mocked transport. These two forms
of proof are not real provider or model acceptance.

The HTTP tests run inside an OS network sandbox. A preceding executable check
proves loopback access and refusal of an external connection. Synthetic tenants,
credentials, entitlements and catalog records exist only in owned disposable
databases. The source-revision helper calls the existing read owner within the
canonical tenant context; it is not a browser/UI end-to-end proof. The HTTP
ingress independently rereads and checks that revision.

One counterfactual changes only the disposable clone's goods permission result
from `can_receive:false` with blockers to `true` with no blockers. **Seven HTTP
tests fail**, including concurrent proposals. The original product bytes are
restored exactly, the clone is clean, and the restored 12 + 53 control passes.
This is one scoped mutation, not the outstanding complete 545-mutant programme.
All owned proof databases were stopped in the runner's cleanup.

## What the actual source permits

1. `POST /api/ai/goods/receipt-review` is a legitimate model-free canonical
   source for a reviewed invoice line. It persists a user turn and calls the
   existing approval owner. However, the actual YCLIENTS permission reader always
   refuses affirmative receipt authority while two scope semantics are unknown.
   Six candidate encodings (empty arrays, numbers, strings, objects, booleans,
   wildcards) all produce HTTP 409 before an approval or action is created.
   Concurrency, stale/foreign source revision and caller-supplied permission
   fields do not bypass that refusal.
2. Without a model key, canonical price chat returns `safe_fallback`, no action
   and no approval. A valid direct price tool preview can create exactly one
   pending approval, including replay, but creates no canonical chat-origin
   audit and no APPROVAL widget. Caller-supplied `T-2a` or user-turn fields cannot
   manufacture that origin. A direct preview is not an admissible substitute for
   the required canonical chat source.

There are zero ActionExecution rows, zero APPROVAL widget emissions and zero
canonical approval-origin audit rows in these diagnostic cases. Only the direct
price-preview case expects one pending AiApprovalRequest. No provider write is
allowed by the artificial wire server.

## Provider contract rechecked

The public [official YCLIENTS documentation](https://developers.yclients.com/ru/)
was fetched without credentials on 2026-10-15. Its embedded OpenAPI still defines
`storages_ids` and `storages_transactions_types` as arrays of unspecified objects;
the prose describes boolean access and does not define elements, empty/all
semantics or selected-store/incoming-operation binding. The fresh capture's
hash and the two relevant schema projections are in
[provider-source-review.json](provider-source-review.json).

This corroborates the previously documented
[provider blocker](../../MAYA-YCLIENTS-RECEIPT-ADAPTER-CHECKPOINT-20261007.md).
It does not replace the historical OpenAPI fixture, qualify real token rights,
or authorize a guessed permission interpretation. The 10 MB raw public capture
is local and hashed in [LOCAL-ARTIFACTS.json](LOCAL-ARTIFACTS.json).

## Exact release implication

The fresh collector from `4a4e5e3d` offered claims for 155 clause IDs. The eight
remaining applicable whole-clause claims are listed below. They include shared
approval duties, not eight isolated goods-only clauses. Their price/goods
positive-source parts remain unqualified; safe source refusal cannot be
relabeled as positive-path evidence or whole-clause U.

| Clause | Required source-dependent behavior still to qualify |
| --- | --- |
| G7-FR6d | Separate exact price and goods MONEY exceptions, while other MONEY/payment handoff stays refused |
| G11-I4 | Approval noun from original canonical source lineage |
| G11-I5 | Changed noun/payload refuses dispatch; exact owners require a fresh proposal |
| G11-I6 | Original approval/user-turn binding plus current source and authority before decision/dispatch |
| G11-I10 | E13: stale approval cannot execute; fresh decision reads and SUPERSEDED require approval again |
| G13-I1 | Decision reaches the exact typed approval owner, never authority inferred from a widget role |
| G13-I2 | Approval routing and R3.11.3 obligations on every applicable source |
| G13-I9 | Current exact approver/requester, tenant, payload and integration/permission binding |

The prior whole-approval U grounds were explicitly withdrawn in the current
development audit. This continuation emits **no L/L-T/U claims**, promotes no
audit row and issues no certificate. The audit remains 163 false/unqualified
plus the two existing global HANDOFF STOP duties. A full fresh mutation run and
release admission are still outstanding. Earlier full CI results remain bound
to their recorded source; this archive does not relabel them as final-HEAD runs.

`closed-input.no-handoff@1` currently includes six price/goods templates and only
excludes G6-6/G13-R8. Personal booking does not call these business operations,
but the current certificate threshold includes them. This is a release-scope
dependency, not evidence that personal Client binding or booking is broken.
See the [owner decision packet](../../MAYA-FIRST-PHONE-SCOPE-DECISION-20261015.md).

## Reproduction and provenance

`executed-source-runner.mjs` is the exact executed runner, with the owned clone
path intentionally retained. Reproduction needs a disposable clone at the named
commit with dependencies, Node 22, local PostgreSQL 16 and the existing migration
tree. Change the machine-local clone path only when preparing a separately
identified run; do not rewrite these receipts. The runner requires a new output
directory, rejects `.env`/`.env.local`, uses a clean environment, creates its own
database, and stops it in `finally`.

`baseline-manifest.json`, `mutant-manifest.json` and `restored-manifest.json` are
exact manifest copies. `*-tests.json` are projections of raw Jest reports with
test names/status/counts; failed payloads and generated bearer/sealed data are
not copied. `mutation.json` records the exact patch and restored control.
`LOCAL-ARTIFACTS.json` records raw hashes and earlier failed test-harness iterations
without counting them as passing runs. One later lint-only test cleanup preceded
the committed-head baseline; no assertion was removed.

No real model/provider/account/OTP/notification request, server update, grant,
phone install, production migration, push or merge was performed. Public
documentation retrieval is the only external request in this investigation.
