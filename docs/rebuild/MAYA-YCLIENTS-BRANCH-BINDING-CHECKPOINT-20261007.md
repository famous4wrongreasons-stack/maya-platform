# Explicit YCLIENTS branch binding — qualified development checkpoint

**Useful result:** the existing CRM settings/A17 owner can now store an explicit tenant-owned Maya branch ↔ configured YCLIENTS/Altegio company pair. An active matching source returns branch-qualified availability; missing, foreign, removed or changed attribution fails closed. Actual authenticated HTTP, PostgreSQL and a fresh application process after PostgreSQL restart prove persistence, native adapter reads and removal. No live provider/model call or provider write occurred.

Final tested candidate: **`d1e42074400a9d706ab5ddbac8b4daf3af137346`**, isolated branch `codex/maya-development-integration-20261006`. Production delta is `86ababd0`; three later commits correct only the new proof fixture. The [evidence manifest](evidence/maya-development-integration-20261006/yclients-branch-binding/manifest.json) binds 28 changed code/test paths and retains all failed HTTP attempts. This supersedes the mapping-absent engineering limitation in the [earlier refusal checkpoint](MAYA-YCLIENTS-BRANCH-AVAILABILITY-CHECKPOINT-20261007.md); it does not reinterpret that historical proof as a positive mapping test.

## Existing management contract

Use the existing authenticated `POST /api/integrations/crm/connect` settings input. For example, this **synthetic** settings fragment selects one pair:

```json
{
  "companyId": 424242,
  "branchBinding": {
    "contract": "maya.crm-branch-binding/1",
    "companyId": 424242,
    "branchId": "an-existing-tenant-owned-branch-id"
  }
}
```

The company must match configured `companyId`; the branch must exist in the same tenant. No mapping is inferred from names, numeric similarity, membership, the only branch, or `tipsCompanyId`. Explicit `branchBinding: null` removes attribution. A changed company cannot inherit a mismatched prior pair. The normalizer accepts only the three binding fields and rejects malformed versions/IDs/extra fields. Public integration status returns only the normalized projection.

Changes use existing `install_crm_credentials` → `pending_activation` → explicit `activate_crm_integration` → `confirm_crm_import`. They are not a silent live patch. Existing same-provider credentials can be reused by the server; this work read no actual credential. A changed pair can be staged with an unchanged credential, while identical pending material remains rejected. Active membership, target generation and tenant ownership are checked again inside the existing serializable A17 transaction. No migration, new persistence owner, retention policy or background authority was added. The normative authority remains the [Wave 3 runtime gate](CYCLE-06-BLOCKING-PACKAGE-5-WAVE-3-A15-A17-A18-RUNTIME-CONTRACT-GATE.md).

## Current source and booking protections

Selected-branch availability uses the branch timezone, with tenant fallback. Native adapter output carries the selected branch only when the stored tenant/company pair matches. Unscoped configured-company output retains `branch_id: null`. The CRM read compares source, integration revision/settings/base URL, branch and effective timezone after fetching; multi-day reads also reject a mixed source across batches. Both registered availability READ paths bind persisted receipts to current source state; same-key and C9 completed-read replay cannot reuse an old source generation. Chat timezone metadata now matches the branch's slot facts.

Newly available native slots must not bypass existing booking safeguards. Verified Client create uses its immutable booking timezone. Verified Client reschedule retains the original persisted source witness, canonical start and branch timezone, and rejects cross-branch moves. Native adapter callbacks recheck current authority/source immediately before POST/PUT. A changed source after an accepted response produces UNKNOWN before mirror success. Reconciliation also checks source before/after reads and interprets provider detail in the bound timezone. Guest/website write flows were not extended.

For bound Client reschedule, current binding alone cannot prove which company owns an old provider-local appointment ID. The existing AE kernel reads at most two matching tenant/capability/SUCCEEDED create receipts, verifies the original encrypted booking snapshot HMAC and Client, and projects only the original calendar target/branch. Current Appointment provider/source/branch and configured company must match. Missing or ambiguous provenance refuses. **Imported/legacy appointments without this canonical origin remain unavailable for this newly enabled bound reschedule path.** No fallback by phone, name or provider ID alone was introduced.

## Executed evidence

**388 tests / 16 suites PASS**, covering existing CRM, A17, Action Engine, availability runtime/handler, Opportunity lifecycle and C9 conversation/Occupancy. Seven owned-driver tests pass. Full widgets-live TypeScript, scoped ESLint and diff checks pass. Unit negatives include source drift, nullable-branch timezone fallback, revoked/foreign ownership, stale original witnesses, old provider/company, no PUT after mid-read removal, UNKNOWN after accepted response, and offset-less provider detail reconciliation without another PUT.

The [final HTTP manifest](evidence/maya-development-integration-20261006/yclients-branch-binding/final-04/manifest.json) records two successful test processes around a real PostgreSQL restart, with **seven checkpoints**:

1. Foreign binding returns 404 before provider reads.
2. HTTP A17 install saves the exact pair pending activation.
3. Activation succeeds; native adapter availability returns the bound branch and 07:00Z for 10:00 Moscow, with Moscow response metadata despite tenant UTC.
4. Actual PostgreSQL/HMAC origin lookup accepts one synthetic canonical source and rejects an absent source.
5. Fresh application/PG restart restores the pair and exact cached READ without a provider read; a new READ succeeds through the native adapter.
6. Origin lookup rejects a foreign Client and two matching synthetic SUCCEEDED receipts.
7. Explicit removal invalidates the persisted READ (409); after reactivation, **active + null binding** produces exact `booking_branch_source_unavailable` (503) without another provider read.

Prepare and resume each made 34 finite in-process synthetic GET reads. **Provider writes, external calls and model calls are zero.** The six A17 metadata actions use the real local owner. The two `crm.appointment.create` receipts are explicitly **synthetic kernel lifecycle fixtures**, not provider bookings or actual create acceptance. Their simulated dispatch markers are fixture evidence only. `resume.branchBindingHash` identifies the original fixture pair, while the final stored state after removal is active with null binding.

Attempts 01–03 remain failed: an early test import cycle, missing immutable caller key in the origin fixture, then a forbidden direct terminal-state fixture update. The final fixture uses the canonical kernel claim/MAY/ACK/finalize lifecycle; no database guard was relaxed. All four owned clusters stopped and their `postmaster.pid` files are absent. No shared service was touched. Resources: runner 256 MB, one backend/Jest worker 3,072 MB, PostgreSQL shared buffers 64 MB, work memory 4 MB, max connections 30.

Independent read-only code and artifact review found no remaining blocker within this qualified scope; its [record](evidence/maya-development-integration-20261006/yclients-branch-binding/independent-review.json) preserves the limits. Reproduction, only in the assigned serial local proof lane and a new output directory:

```sh
cd maya-saas-backend
NODE_OPTIONS=--max-old-space-size=256 node scripts/c9-occupancy-proof.mjs --run --branch-binding --pg-bin=/absolute/postgresql16/bin --output=/tmp/NEW-UNUSED-BRANCH-PROOF
```

## Remaining limits

One configured company maps to one explicit branch; this is not multi-company routing or a new management UI. Live credential rights, actual provider responses and booking effects remain unobserved. Native reschedule UNKNOWN across a real restart is not established by this new probe; its current source guards have targeted unit coverage. A newly composed native bound-CRM → C5 → C9 chat/restart proof remains separate work: the earlier [full keyless candidate](MAYA-CURRENT-CANDIDATE-FULL-KEYLESS-CHECKPOINT-20261007.md) proves C9 mechanics with a synthetic branch-qualified domain port, and is not relabelled as this native-source proof.

Existing explicit C9 request/version/evidence ownership is preserved. No autonomous initiator, second orchestrator, agent framework, invented business facts, notifications or execution authority was added. Website/realbooking files, production, HTTPS, device, push and merge were untouched. **This is not real-model/provider acceptance or C10 completion.**
