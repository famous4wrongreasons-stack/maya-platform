# Local YCLIENTS team refusal — 2026-10-11

This checkpoint follows `6d20be267c96a0a4d7b5e945db18bdd16f2785fa` on the existing local CRM branch. It is not successful connection acceptance or release certification.

## Actual owner attempt

The owner selected user-token mode and explicitly submitted the existing operation. The selected-company list, services, categories and company requests returned HTTP 200 and passed the local guard. The management staff request returned HTTP 200 but the local guard refused it. Subsequent adapter fallbacks were blocked without external dispatch. Connect returned `crm_connection_failed`; an explicit status read showed `NOT_OBSERVED`. No auth/password exchange was used.

A read-only metadata query against the exact retained owner database found **zero integrations and zero A17 operations**. The session was stopped gracefully before source edits; database and existing keys are preserved. Activation/import has not occurred. No customer/appointment reads or external writes occurred.

The exact team condition was not retained by the old closed trace. It remains **UNKNOWN**, not assumed to be missing metadata, invalid credentials, foreign company or a provider defect. [Official YCLIENTS documentation](https://yclientsru.docs.apiary.io/) exposes a management staff example with `meta.total_count`. That example supports retaining the existing completeness check; it does not prove the actual owner response matched it.

## Narrow diagnostic change

The actual `validateTeamResponse` function is byte-identical to the preceding candidate. No admission threshold, route, fallback, credential or persistence semantics change. Only after refusal, the existing transport records an optional ordered `teamIssues` list containing closed labels for all applicable checks. No raw metadata keys, values, employee identifiers, names, phone numbers, credentials or response body are recorded. The existing IPC projector independently checks labels, event context, ordering, uniqueness and bounds. Normal trace events keep their existing format. Diagnostic failure cannot change acceptance, refusal or fallback poisoning.

This captures multiple simultaneous shape failures in one attempt without relaxing the guard or requesting arbitrary provider output. The old real receipt is retained unchanged.

## Proof

Local launcher/profile/transport/HTTP-code/IPC/resume tests: **72 PASS, 0 FAIL**. The 20 new transport/projector tests against the previous committed diagnostic produce **19 FAIL / 1 PASS**; the unchanged acceptance/observer test still passes. Synthetic matrices cover malformed data, bounds, pagination, absent/array/unknown metadata, type/count mismatches, invalid/duplicate IDs, foreign company, combined faults, privacy and rejected fallback. Receipt serialization preserves only closed labels.

[Sanitized evidence](evidence/maya-owner-team-refusal-20261011/summary.json) references private local receipt hashes. Broader pre-existing test failures remain documented in the prior login checkpoint; this diagnostic-only pass does not recertify the product.

## Next owner step

Prepare and verify the same-database keyless startup on the committed source before requesting owner input. Then use the existing hidden-input launcher and original operation locator for one explicit retry. Real credentials must be entered only by the owner in Terminal/form, never in chat. Terminal automation remains blocked by the previous automatic approval rejection; no alternate transport may bypass it. Do not claim real save/import until separately observed and verified.

No push is attempted because the prior automatic approval rejection remains in force. No production changes, migration, OTP, provider booking effects or iPhone work.
