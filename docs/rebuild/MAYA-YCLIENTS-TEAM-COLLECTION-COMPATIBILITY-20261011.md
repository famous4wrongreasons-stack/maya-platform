# YCLIENTS management staff collection compatibility — 2026-10-11

Base: `2f55da13a0b32f0d7cede07ccf27aa2fa58f4ff9`, existing `codex/maya-local-crm-setup-20261010` branch. This is local setup compatibility, not release certification or real connection acceptance.

## Actual owner result

The explicit owner retry on the base returned management staff HTTP 200, refused only with `total_count_type`; the newly retained closed encoding is **missing**. Decimal-string support did not resolve this real refusal. Connect returned `crm_connection_failed`, original-operation status was `NOT_OBSERVED`. A separate read-only query of the same retained owner database confirmed **0 integrations / 0 A17 executions**. Staff names, IDs, response body and exact metadata keys were not retained. No claim is made that real metadata was exactly `{}`.

The owned launcher was stopped before source edits. Source integrity, same private state, stopped cluster and absent runtime group passed. The original database, keys and operation identity remain unchanged. The categories cancellation followed the failed request; blocked adapter fallbacks made no additional external dispatch.

## Primary contract and interpretation

[Current official YCLIENTS developer documentation](https://developers.yclients.com/ru/) embeds OpenAPI 3.0.3. Its management `company/{company_id}/staff/{staff_id}` method describes the staff-id component as selecting a specific employee and has no pagination or filtering query parameters. The collection response is an array; metadata is an object with an optional integer total. Neither metadata nor `total_count` is declared required. The example includes a total; the example is not an additional mandatory schema constraint.

This supports interpreting the exact unfiltered management collection as the staff list even with empty metadata. It is **contract-derived evidence**, not an independent provider total or proof against an undocumented provider truncation bug. If pagination, filtering, incomplete transport or contradictory metadata appears, refuse. The documented server is `.ru`; the existing working `.com` route is retained. No new host or credential destination is authorized by this change. A minimal public schema excerpt and hashes are archived without staff examples.

## Narrow supersession of the original local profile

The original profile required an explicit total on both management and legacy staff routes. This is now superseded only for all of:

- native GET of exact `https://api.yclients.com/api/v1/company/{server_resolved_company}/staff`, with v2 Accept; no query, staff-id suffix or normalized alternate path;
- HTTP 200, no redirect or substituted final URL, bounded fully read JSON;
- exactly `success`, `data`, `meta` at the outer level, `success:true`, empty object metadata, no pagination headers;
- 0–50 rows, unique valid staff IDs, every row explicitly belongs to the selected company.

Only a private transport-owned symbol can supply this source evidence. A caller/provider completeness flag, forged symbol or standalone validator call cannot. Empty/absent/null/array metadata are not conflated: only `{}` qualifies. A present total is never ignored: existing exact number/string equality checks continue. Missing-count legacy, bookable subset, partial/redirected/wrong-version/foreign/filtered responses fail closed. No synthetic `total_count` is inserted and original response bytes are returned unchanged.

The closed trace distinguishes `management_collection_contract` from `explicit_total`; it is diagnostics, not authority. No provider field values or personal data are recorded. Current actor/company checks, A17, confirmation/CAS, persistence, source selection and refusal poisoning remain owned by existing code. UI and domain application source are untouched.

## Executed proof

- Local guard/launcher/IPC/HTTP-code/resume and native-adapter tests: **126 PASS / 0 FAIL**.
- All 46 new tests run against the prior committed guard/status; the positive regression fails before and passes after. Exact per-run totals are in the evidence summary.
- Seven deliberate guard defects detected: source binding, row-company witness, metadata shape, duplicate IDs, partial status, current actor and private evidence. Both unmutated and restored runs pass all 46.
- Native adapter setup methods pass with integer total, exact decimal total and empty metadata. Synthetic staff/service/company are returned through the actual adapter; no real provider or owner credentials are used.
- Earlier offline harness attempts failed on a missing installed dependency and an ambiguous mutation site; they are retained and are not admissible product evidence. Successful corpus ran fresh after fixing only the scratch harness.

Run `node scripts/local-yclients-read-team-collection-proof.mjs` from the backend to reproduce the offline counterfactual programme. Scratch mutations never change repository source.

[Sanitized evidence, source hashes and local receipt provenance](evidence/maya-team-collection-compatibility-20261011/summary.json).

## Next explicit owner step and limits

Commit and verify fresh network-closed startup on the same retained database, then prepare the existing hidden-input wrapper. The owner supplies partner token in Terminal and user_token in the existing operation form. No automatic resubmission or activation/import. If the real response does not meet the narrow collection contract, retain the exact closed refusal instead of silently weakening it.

Same-database startup and real save after this change are not claimed by this pre-startup source checkpoint. No production, schema/migration, new business, OTP, YCLIENTS writes, customer/appointment reads, website or phone work. No push retry after the prior review rejection. Historical broader backend/runtime failures are not waived or represented as green.
