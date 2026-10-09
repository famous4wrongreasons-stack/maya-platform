# Independent C8 calendar instant component evidence review — 2026-10-09

**QUALIFIED_PASS_FOR_FROZEN_COMPONENT_EVIDENCE**. No remaining blocker within this component checkpoint.

Exact committed source: `dda9ccfa9860c3ce70503ffdb8226e8a8b6c7622`. All11 bindings from the unchanged prior source review match both current files and Git bytes. Baseline `5babbc22dd5980c8df4bc3eadf844da4ec1679df` `c8.time.ts` SHA matches before-after.json; shared calendar converter remains byte-identical.

Final Jest JSON and log agree: **328 passed /20 suites /0 failed /0 pending or skipped /0 todo**. This includes calendar24, producer11 and store32 (67 total), not328+67. Earlier attempts overlap and are not summed. RED10passed/7failed, initial focused-type and lint diagnostics remain preserved failures.

Focused types and lint were explicitly reported exit0 by the parent. Their hashed empty logs are consistent with success but do not independently encode exit status or invocation. Reviewer ran no tests or services.

The nine recorded before/after comparisons include seven named gap/fold/date-line refusals and two corrected unique cases (Paris historical seconds, Gregorian0099→0100). Runtime metadata is Node24.15.0/ICU78.2/tz2026a. Recorded execution was not repeated by the reviewer; both source pins were independently verified.

Actual C8 methods are exercised, including producer.resume, deterministic computation, C8Store.refsCurrent and exact snapshotDormancy. Store/ACL/configuration/SQL ports remain synthetic. This is **not** actual SQL fencing/rollback, encryption, HTTP/PG, new restart or DI integration evidence; older restart proof does not automatically qualify this runtime.

The finite inverse support remains Gregorian AD1..9999 with integral-second offsets±24h. No gap shift or fold preference is selected. Single-call benchmark timing does not qualify maximum cohorts, dependency fan-out, cache churn or transaction/lease performance. Original81 outcomes and previous failed reports remain unchanged; no full MAYA/C10 or model/provider quality acceptance.

All artifact/source hashes, per-suite counts and precise qualifications are in the adjacent JSON. The prior source review files were not modified.
