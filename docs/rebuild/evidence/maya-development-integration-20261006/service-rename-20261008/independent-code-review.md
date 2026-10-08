# Independent code review — service title READ preview

**Qualified static PASS for the inspected snapshot. No unresolved code blocker found after the three review corrections below. The executed local stages below are independently hash-bound; no HTTP/browser acceptance is claimed.**

Base: `d90243a6cb655a82de1ceb347f25cddfd04de074`. The reviewed delta was subsequently committed as `995a87e3b1e5102605385dc5c0afdca062cae6d0`; all 24 reviewed source/test/script hashes were verified against its Git blobs. This binding does not claim a test rerun after commit. I made no repository edits and ran no tests, services, network, SSH, provider or model calls. Root owns serial validation. Local attempt 1 remains a failed attempt (reported 594 passed / 4 failed); its client-audience omission and census/policy assumptions were corrected. I subsequently read the exact final local reports/Jest JSON/logs and compared their source hashes as recorded below. I did not rerun them.

## Findings addressed

1. **Catalog A → preview B could select the same numeric ID in another company.** Initially AiCore resolved a name from the unqualified public catalog and normalized the preview against a newly chosen integration. The fix captures the current CRM source witness before the catalog read and uses that same server-only witness for both READs. Runtime includes it in input hashes, rejects changed normalization/current identity and checks after lookup, start persistence, handler and completion. Both execute and replay carry it. The public DTO accepts only service_id/new_title; it cannot select tenant/company/revision. Added tests exercise A→B cached catalog, lookup drift, pre-handler drift, mismatched preview witness and AiCore same-ID cross-step refusal. The witness is metadata validation, not business authority.

2. **The production semantic planner could not select the new tool.** The first implementation lacked a taxonomy candidate, while actual AiCoreModel.validatePlanningResponse invokes validatePlan/assertToolCallMatchesPlan. Added `services.rename_preview` is an OWNER/BUSINESS_OWNER-only READ with exact `catalog.service.rename.preview` alternative and service/new_title slots. The new model-service spec calls the actual response validator with synthetic JSON, checks both owner roles, denied roles and a mismatched services.price intent. This closes the callable-path gap without making a real-model acceptance claim. AiCore's separate tests still use scripted model selection and a callback C9 stub; that scope is explicit.

3. **Valid observed whitespace was rejected by the formatter.** Source qualification preserves old title and booking_title verbatim, but the initial formatter demanded trimmed source labels. `observedLabel` now preserves bounded nonempty source text while refusing control characters; only the requested new title is strictly trimmed. The regression asserts verbatim old/online labels and refuses a padded proposed title.

Root's execution gate additionally exposed a client-audience visibility omission. `isBusinessOnlyTool` now names this exact tool; the management tool is withheld from client-audience planning. Current server role/tenant checks remain authoritative independently of presentation filtering.

## Reviewed behavior and boundaries

- Native source uses exactly permission → one service detail → permission GET, with redirects refused, one finite deadline and no endpoint fallback/retry. Title permission is distinct from price permission. Missing/false permissions, malformed/empty/ambiguous detail, wrong IDs/company and unsupported source data refuse; they do not produce empty success.
- Source qualification is deliberately conservative: one active local non-chain individual fixed-RUB service, complete required state, bounded source bytes and labels, supported staff/date/technical-break settings. The existing price qualifier is used only for source shape. There is no price mutation grant or reused price approval descriptor.
- The new preservation witness excludes only title and includes prices plus every observed non-title field, including unknown provider fields. Changing title changes the snapshot revision while leaving this witness stable; changes to price, booking title, dates, staff, comment, print_title or an extension change it. Hashing observed fields is evidence of what was read, not proof of a safe future PATCH. Server-only payload/comment/staff details are absent from the public preview projection.
- Actual CRM owner checks tenant context and exact actor, active tenant/user/membership, tenant-wide OWNER role, required features, active YCLIENTS integration, configured company, optional exact same-tenant branch and credential/source witness. It checks source before/after adapter selection and provider read; each source-context read ends with current membership/user/role validation. The three CRM suites separately test the contract, actual native adapter with synthetic fetch, and actual CrmService with synthetic persistence/adapter boundaries. They do not prove live integration or HTTP admission.
- Current user literal syntax selects one catalog identity and requested title. Negation, compound/ambiguous requests, missing/duplicate identities and model guesses cannot become preview arguments. The final response is server-composed and terminates the tool turn: old/new internal title, unchanged separate online title, source time, print-title limitation and explicit absence of application/confirmation. No management snapshot is sent to a second model reply. Action is null.
- The runtime READ revalidator still protects the existing goods-search path; this extension has two exact owner-read names, not a general plugin/capability framework. Rename previews suppress widget emission even outside AiCore; the internal catalog/preview pair also suppresses selector emission. No approval request, AE registration/executor/policy, mutation, notification, background initiator, schema, retention or second owner is introduced.
- Cached replay is a replay of the retained as_of snapshot with current local authority/integration-source checks. It does not repeat native provider fields or permission GETs and is not proof that the provider state has remained unchanged. A future application would need its own fresh before-state/permission checks. The current result cannot apply anything.

## Derived policy is not widget admission

The initial new test expected no WIDGET_CAPABILITY_POLICY row. That expectation was wrong: existing capability-policy.ts derives POLICY_ROWS over every C9 capability. The correct new row has `consent_class: none`, `min_verification: SESSION_VERIFIED`, `dispatch_is_synchronous: true`; the separate SOURCE_READ subject-floor term is CHANNEL_IDENTITY, not a replacement for current OWNER/session authorization. Preserve that derivation rather than carving a hole in totality.

The concrete closed boundaries already prevent widget admission: owner-classes.ts names catalog.services.read, not a catalog prefix, for SERVICE_SELECTOR; rename has no owning kind. The projector registry has no exact rename row and `projectorRowForCompletedRead` therefore returns null. CanonicalReadAdapter has a finite TOOL_READS dispatcher without rename. The runtime explicitly suppresses the rename trigger. The frozen release profile has no successor entry; no AE pairing, COMMIT row or approval owner was added. No extra runtime barrier is required solely because policy metadata is derived. The final test asserts allowedKinds is empty and projectorRowForCompletedRead is null for the exact key. These are negative regression assertions, not a new grant.

Census changes are finite: one TOOL/C9 pair; AE remains 228. Historical baseline filters exclude only the exact later rows, not a wildcard. The current intent count is 91: baseline already included goods search before the new rename intent; do not report both as new work in this slice. The earlier phrase “outside widget policy” is corrected in owner-preflight.md to “outside widget admission/profile”; generated C9 policy metadata is retained.

## Remaining limits

The product-authorized result is **callable READ preview**, not implemented service editing. Direct canonical chat AiApprovalRequest → APPROVAL for rename still needs its separately named finite origin admission; F74a/F74b are not inherited. The provider print_title/default-label and complete future-write preservation behavior remains unqualified. The proposed service-rename admission document correctly labels both boundaries and proposed capability names as unapproved/unregistered.

No real model/provider, restart, browser/HTTP, production, site, broad MAYA completion or C10 completion is established by this review. The local stage union below does not establish those broader outcomes. No deployment, push or merge is authorized here.

## Local evidence qualification

Read-only inspection of local-attempt4 and local-attempt5 confirms a **passing union of the relevant final stages**, not a relabelled whole attempt 4:

- Attempt 4: targeted Jest JSON has 598 passed / 0 failed / 0 skipped in 13 passed suites; backend types, widgets-live types and changed TypeScript lint completed successfully. The attempt itself is **FAIL** because its subsequent contract census had not yet named the new exact READ pair; that failed result remains retained.
- Only two contract census scripts changed afterward. They preserve historical AE/POLICY/TOOL/C9 = 226/221/48/57 and add exact `renamePreview` TOOL/C9 identities with empty AE/POLICY delta. The POLICY census here is Action Engine production policies, not the separately derived C9 WIDGET_CAPABILITY_POLICY. No wildcard filter or release snapshot rewrite was introduced.
- Attempt 5: report PASS; contract log says 31/31 with 4 existing pending checks; K3 says 10/10; scratch probe types and browser guard 5/5 completed. Guard unit tests are not a browser run, and scratch HTTP/browser harness semantics are outside this code review.
- All 22 runtime/test hashes common to attempts 4 and 5 are identical and match the reviewed/current bytes. All 24 attempt-5 source hashes, including the two inspected census scripts, match the current files. Both reports record sourceUnchanged and harnessUnchanged true and all owned groups closed/absent; this is report inspection, not a separate current-process census or launcher audit.

## Reviewed bytes

Captured at 2026-10-08T12:05:53.100220+00:00. All changed/untracked backend source files in this slice are included below; the unrelated goods-photo documentation note and draft admission document are excluded from runtime hashes. Existing unchanged owners/contracts consulted for the boundaries above are not represented as newly reviewed changes.

| File | SHA-256 |
|---|---|
| `maya-saas-backend/scripts/widget-contract-check.mjs` | `b77f42f090ff26933bd7f70b327e7a9c2ae93d0e4de9f0f272958f5b64157d4d` |
| `maya-saas-backend/scripts/widget-contract/registry-probe.js` | `ecce5e04c331fa6601bce9fdfe351366abfab311bdf24c4b8f7208539ae390c4` |
| `maya-saas-backend/src/ai-tools/ai-core-model.service.spec.ts` | `992a1af567389d4bf2535c159103a9758081035a3bcdc45cc8f74df92532a38f` |
| `maya-saas-backend/src/ai-tools/ai-core.service.spec.ts` | `468e1c26e8a81f966addca2a2c10ec5ed7130bcf814565ba8f2a74f7c9e15658` |
| `maya-saas-backend/src/ai-tools/ai-core.service.ts` | `1d997bb12ce662ebb93e6389c270a2f2fded77f9c8f6c083c37a693dbd3f1a24` |
| `maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts` | `7b932a4701d6c8308f3bf7d82558b369132633bef5d5563c6ae03bb5cc8271f9` |
| `maya-saas-backend/src/ai-tools/ai-tool-registry.service.ts` | `3760a9fbd17f99f0e83c6051c2a2f68570f626528438463034effda39836da4b` |
| `maya-saas-backend/src/ai-tools/ai-tool-runtime.service.ts` | `68eb7a6cca8c5cca0215ec48fc55000a9243ff83f35c95c3c89e233e08ec6ab6` |
| `maya-saas-backend/src/ai-tools/ai-tool-service-rename.spec.ts` | `c9a04527b276cd751331ab2258e14489ea3410d9d905adfef1e806f9064012ed` |
| `maya-saas-backend/src/ai-tools/ai-tool.catalog.ts` | `5c985d6089a090a66295ba34e365abb60c8d9dcdaac5324db6105ee245aad5de` |
| `maya-saas-backend/src/ai-tools/service-rename-chat.spec.ts` | `34abd9e78530664b6ab458c0aba36243e8430fac9f092d7138807dccd5516214` |
| `maya-saas-backend/src/ai-tools/service-rename-chat.ts` | `8508846cf507684226ded862e5f65cf268f22832ac7eeb4e8c97de33b6bdf150` |
| `maya-saas-backend/src/conversation-intelligence/conversation-intelligence.service.spec.ts` | `2c9b9ac14291d8b53bcc49a5db6014da2757426b75a766df52acb2dca829fafd` |
| `maya-saas-backend/src/conversation-intelligence/conversation-taxonomy.ts` | `70e8a8bbd8398cbd4e4093da0b8afd5c8c68816dd7644eb0fc5affac3fb3c124` |
| `maya-saas-backend/src/crm/adapters/yclients-crm.adapter.ts` | `1f3a8c51ac916dd44ea5b49a6098b00f3132b041e568f59ec6fa5c800177d836` |
| `maya-saas-backend/src/crm/adapters/yclients-service-rename.spec.ts` | `6e11fc3f97616e7c8e94bf03aa7ee26cb3065e6b804668de60c5f47ac26cf165` |
| `maya-saas-backend/src/crm/crm-adapter.interface.ts` | `ce3771c5458c85e09e3b550fa784c30e48acd9dcd0fb300fa0d2d2abfc4828e9` |
| `maya-saas-backend/src/crm/crm.service.ts` | `e325586509753ebb1ec303f8c118eea7c3959e100233aaf89b28a2950f8f5ec0` |
| `maya-saas-backend/src/crm/service-rename-actor.spec.ts` | `4c1c96df144808a5e16a1801142e84118182950ef982651777e6a1ca203ec466` |
| `maya-saas-backend/src/crm/yclients-service-rename.contract.spec.ts` | `54097e2b0efd1ea2f912642912f210269eec62a92276d41e6ac0e81e8cc28668` |
| `maya-saas-backend/src/crm/yclients-service-rename.contract.ts` | `76b0fb1d299bda1391751e6011e2cd7ca20d9332f0cbbd753df7719857e8f56e` |
| `maya-saas-backend/src/orchestration/c9.registry.ts` | `14132b5af591d183facbce9ca6ae5c58623100aadd06f56e777321da778408fd` |
| `maya-saas-backend/src/widgets/authority/business-rules-admission.spec.ts` | `e9810871f62d0cb07c4e4e5f7dc4738550d91a0f4b81cbef3e3f150ce9c6449e` |
| `maya-saas-backend/src/widgets/authority/totality.spec.ts` | `46c4383abc8e6bb66ccc18583cb06869e8123c878845b8daad7a6322897581cf` |

Final source/hash reconciliation: 2026-10-08T12:07:28.131758+00:00. 24 files; all hashes match the recorded attempt-5 inputs, with 22 identical common inputs from attempt 4.

Commit binding: all 24 Git blobs at `995a87e3b1e5102605385dc5c0afdca062cae6d0` match the attempt-5 source hashes above; the same 22 runtime/test blobs were executed in attempt 4.
