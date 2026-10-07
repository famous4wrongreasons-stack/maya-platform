# YCLIENTS branch availability: fail-closed source checkpoint

**Useful result:** selected Maya branches can no longer receive slots from the configured YCLIENTS/Altegio company with a fabricated `branch_id`. The provider owner returns HTTP 503 `booking_branch_source_unavailable` before resolving staff or reading availability. A request without a selected Maya branch retains the existing configured-company read, with `branch_id: null`. No mapping or new authorization is inferred.

Production change: `7547f32ea268acc2e65e73fd6ccc1df25c075cbf`. Exact final HTTP candidate: **`8c8b9657ebdab83ae9d25744b7b49c661496c6a1`** (subsequent change is only a synthetic fixture comparison). This continues the [read-boundary/keyless broker checkpoint](MAYA-CURRENT-CANDIDATE-BOUNDARY-PREREQUISITES-20261007.md). [Evidence archive](evidence/maya-development-integration-20261006/yclients-branch-availability/archive.json) binds 38 source/harness paths and manifest `0b0cdeff8d0c958a2ad2f6e4e32a0c13dd9b23f4e3eb68bd3accfd69493d753f`.

## Existing ownership and exact behavior

The source trace found `CrmIntegration.tenantId` unique with provider/settings/credential ownership, and the normalized YCLIENTS/Altegio settings contain `companyId`, optional active master IDs, currency and tips-company override. `Branch` has tenant ownership but no external company identity. The connection DTOs and canonical normalizer do not accept a company-to-Maya-branch mapping. A tips company is not an availability mapping. Neither a single local branch, a caller-supplied provider-like number, a staff link nor an arbitrary historical settings key establishes this relationship.

The guard therefore lives at the start of `YclientsCRMAdapter.getAvailableSlots`, before date/staff/provider work and outside the existing 422 “date unavailable” → empty array handler. Any supplied non-null branch is unavailable, including empty/company-like identifiers from internal callers; HTTP ownership still refuses foreign/unknown branches first. `mapSlot` no longer accepts the caller's branch argument. Other providers and INTERNAL branch filtering are unchanged.

Both `booking.availability.read` and `booking.group-availability.read` now bind `maya.availability-source-scope/1` into the existing READ input hash. A legacy completed receipt cannot bypass the new source boundary through same-key execution or C9's `replayCompletedRead` callback. Four regression cases require conflict with no handler call, receipt creation or rewrite. History is not rewritten and no old payload is promoted to current evidence.

C5 regression evidence preserves `provider_failure`/unknown with no new or resolved Opportunity; C9 preserves `UNAVAILABLE` with one attempted source read, not `OCCUPIED` or a retry. No second orchestrator, source store, schema, retention or background authority was introduced.

**Shared caller impact must be carried into integration:** `PublicBookingService.selection` passes the site branch, and branch-bound Client create/reschedule also reuse this availability owner. Their YCLIENTS branch-scoped availability now fails closed until a canonical mapping exists. This is an intentional correction of unqualified source attribution; it is not website/realbooking acceptance or a claim that those paths retain successful behavior. No website, booking caller, provider mutation or deployment file was changed, and callers do not strip the branch to bypass the check. The parallel website/main lane needs this qualification before merging.

## Actual local proof

A typed fixture creates the actual `YclientsCRMAdapter` and keeps its availability logic intact. Only transport is replaced: one exact synthetic GET on `https://synthetic-yc-availability.invalid/api/v1/book_times/<company>/71/<day>` with finite query/response and synthetic credentials. It never reaches a network. The ordinary/group tool handlers, auth, tenant/feature policy, receipt persistence, controller and PostgreSQL are real.

| Authenticated boundary | Executed result |
| --- | --- |
| Unscoped configured-company tool read | HTTP 201; exact synthetic start/end/staff, one slot, null branch |
| Own and other same-tenant Maya branch, available-slots HTTP | HTTP 503; stable unavailable code, no slots, zero additional native availability transport reads |
| Foreign and unknown branch | HTTP 404; no slots or native availability read |
| Ordinary and group availability tool READ, selected branch | HTTP 503; canonical execution FAILED with matching code, no encrypted result, no widget/facts |
| Available-days with branch and service IDs | HTTP 503, no days; no native availability call. Existing service-catalog reads can precede refusal and are not claimed absent |
| INTERNAL own and other same-tenant branch | HTTP 201, six slots each, exact branch and eligible staff |
| INTERNAL foreign and unknown branch | HTTP 404 without slots |

Final attempt `/tmp/maya-candidate-yc-branch-20261007-02` passes **21 source preflights** (12 HTTP 201, four 404, five 503), plus the selected **3 booking dialogs / 5 chat turns** with five canned transports. Source preflights are independent of model selection; the native YC fixture uses the existing Admin source principal and does not add an Admin dialog to the selected subset. Full 24-dialog execution at this exact candidate is still pending.

Maximum serialized request is **67,851 bytes** under 98,304; conservative input bound is 71,947. All five app/broker request tuples and budget counters match. Both ledgers close at 356,875 reserved input tokens, 6,000 output tokens and **$0.494835** of offline bookkeeping, not provider usage or spend. Both owned services stop; broker reports `stopped`, both ledgers end `closed`, PostgreSQL's PID file is absent. Upstream/model paid calls, provider network calls and writes are **zero**.

**213 tests / 6 suites PASS**, production/full widgets-live TypeScript, scoped lint and diff checks PASS. Unit attempt 01 had 171 passing tests but a mistyped fifth suite path; the corrected six-suite attempt is recorded separately. HTTP attempt 01 failed on Node strict comparison of equal URLSearchParams arrays across Jest realms, before model dispatch. The helper now compares the exact serialized values/order with the same finite method/path/query assertions. Failed evidence remains archived, both processes were stopped, and the final fresh attempt is not a reuse/reset. HAR-13 prerequisite runs two tests with 143 explicit skips; no aggregate gate was run.

Independent review checked guard placement, both legacy replay paths, the native synthetic transport, failure persistence and shared caller impact. Final artifact review is recorded with the evidence. **This is offline source/mechanics qualification, not real YCLIENTS/model acceptance or C10 completion.** The engineering blocker for branch-scoped YCLIENTS success is now explicit: a canonical, tenant-owned company-to-branch binding and its approved persistence/management contract. Safe unscoped source work continues without inventing that mapping. See [real-model prerequisites](MAYA-REAL-MODEL-PREREQUISITES-20261007.md) and the updated [remaining-domain map](MAYA-APPROVED-DOMAINS-REMAINING-GAP-MAP-20261007.md).
