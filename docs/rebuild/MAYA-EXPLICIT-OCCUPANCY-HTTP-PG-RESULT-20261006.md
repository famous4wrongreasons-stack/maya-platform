# Explicit occupancy: actual HTTP/PostgreSQL restart checkpoint

2026-10-06. Base `c6a35e5c61975e9d101326e7b3970331f3c905d8`; prior local checkpoints `480d61dc` (vertical) and `13abc008` (gate preparation) retained. Parent assigned the heavy slot explicitly. The serial **prepare → owned PostgreSQL restart → resume gate passed**. All owned clusters were stopped; the heavy slot was released to parent/main. No aggregate, production, external provider/model, website, phone, push or merge operation ran.

## Result and evidence

Actual [prepare report](evidence/explicit-occupancy-http-pg-20261006/attempt5/prepare.json), [resume report](evidence/explicit-occupancy-http-pg-20261006/attempt5/resume.json), [manifest](evidence/explicit-occupancy-http-pg-20261006/attempt5/manifest.json), [prepare test log](evidence/explicit-occupancy-http-pg-20261006/attempt5/prepare.log), [resume test log](evidence/explicit-occupancy-http-pg-20261006/attempt5/resume.log) and [stop receipt](evidence/explicit-occupancy-http-pg-20261006/attempt5/pg-stop.log). [SHA-256 inventory](evidence/explicit-occupancy-http-pg-20261006/file-sha256.json) covers copied original driver artifacts. The private synthetic-password restart receipt remains outside the repository and was not copied. Reports were checked for password/access-token/refresh-token/authorization fields before saving.

| Proof | Observed |
| --- | --- |
| Dedicated database | `maya_widget_gate_proof_c9occ_900923d55065`, loopback port `60612` |
| Application processes | prepare PID `80108`; resume PID `80170` |
| PostgreSQL start | `2026-10-06 16:22:21.738349+00` → `2026-10-06 16:22:24.824138+00` |
| Original run | `f23b595d-3416-4f89-954b-c5b9f2448910` |
| Saved proposal | `03b821ae-ff81-4b3b-bc2f-d1c7080afd8d`, version `1` |
| Fresh response | HTTP 201, `AVAILABLE`, current=true, replayed=false |
| Replay before/after restart | same run/revision/receipt and persisted graph digest; current=false, replayed=true; zero repeated CRM reads |
| Later synthetic fill | new explicit request, HTTP 201, `OCCUPIED`, no-action option |
| Historical opportunity expiry | real DB clock, HTTP 201, `EXPIRED`, zero CRM reads |
| Foreign tenant | exact existing HTTP 400 `c9_run_authority` |
| Membership revoked | HTTP 401 for replay and run read; no new run or CRM read |
| Business effects | checked domain rows unchanged; AE, inbox and outbound owner rows empty; write recorder assertions passed |
| Model | zero calls in both processes |
| Cleanup | `server stopped`; owned `postmaster.pid` absent |

The current carrier probe made actual HTTP requests through the current conversation runtime and production wire projectors, then rendered the exact response with the current React `ReplyText` component. It checked one coherent response, source interval/timezone and saved version, historical replay wording, persisted latest conversation, and absence of executable controls. Encrypted audit history retained both initial and historical responses, while the visible conversation restored only the latest completion per user turn. **This is runtime + React SSR evidence; browser/device/accessibility/usability acceptance remains pending.**

The AppModule, authentication/tenant/membership guards, source policy/entitlements, C5 lifecycle/repository, CrmService/current-capacity reader, C9 store/work/strategy/agents and TimelineStore were real. Fixture writes seeded synthetic CRM mirror/event data; the existing C5 runner created Opportunity/AgentTask. Only the external CRM adapter was synthetic. This does not qualify real WATCH ingestion, YCLIENTS network/permissions/quotas/completeness or model behavior. No source mutation or outbound business operation was requested.

## Failed attempts retained

| Attempt | Exact outcome and subsequent correction |
| --- | --- |
| [1](evidence/explicit-occupancy-http-pg-20261006/attempt1-sandbox.txt) | Sandbox `listen EPERM` before initdb. Authorized loopback escalation used for following attempts; original empty output retained. |
| [2](evidence/explicit-occupancy-http-pg-20261006/attempt2/prepare.log) | Migrations/AppModule succeeded, carrier assertion hid the failed HTTP outcome. Probe now preserves a redacted transport diagnostic; a light failure-path test proves this. Owned PG stopped. |
| [3](evidence/explicit-occupancy-http-pg-20261006/attempt3/prepare.log) | Exact HTTP 400 `c9_string` exposed native C5 fingerprint versus C9 hash mismatch. Narrow production fix below; owned PG stopped. |
| [4](evidence/explicit-occupancy-http-pg-20261006/attempt4/resume.log) | Prepare and persisted restart/replay/history/fill/expiry succeeded. Foreign-tenant assertion expected 403/404 but the existing C9 denial is 400. Assertion corrected to exact 400 plus `c9_run_authority`; production denial unchanged. Owned PG stopped. |
| [5](evidence/explicit-occupancy-http-pg-20261006/attempt5/manifest.json) | Both serial phases PASS; owned PG stopped. |

Each non-sandbox attempt used a fresh dedicated database, cluster and output directory. All original logs, manifests and reports for attempts 2–5 are retained beside the successful evidence, including migrations/restart/stop logs. Previous evidence was not overwritten or deleted.

## Actual code correction and source compatibility

The new HTTP path exposed a pre-existing mismatch in the otherwise-unused C5 reference path: `canonicalFingerprint` emits namespaced strings, whereas `c9Evidence.identityHash/inputHash` require exactly 64 hexadecimal characters. The initial Occupancy projection copied C5 values unchanged, and `C9Sources.check` compared them unchanged. Unit fixtures had incorrectly modeled native fingerprints as bare SHA-256 values.

`c9C5Fingerprint` now computes `c9Hash('c5-source-fingerprint/1', [nativeFingerprint])` from the **complete** native `identity_<64hex>`, `evidence_<64hex>` or `task_<64hex>` value. The namespace remains in the digest input. The Occupancy projection and current source verifier use the same function, only for `Opportunity` and `AgentTask`. Source equality still checks freshly read canonical rows under existing tenant/authority/expiry/subject rules. Changed native fingerprints fail with `c9_source_changed`.

Compatibility is exact:

- Existing C5 rows produced by base `c6a35e5` retain their original IDs, fields, fingerprint bytes, lifecycle and evidence. No C5 rows are rewritten, no backfill or migration is required, and no source epoch is introduced. A new read projects their unchanged native fingerprint into the existing C9 64-hex wire.
- Existing C9 schema/contracts/registry hashes are unchanged. The reference still names `Opportunity` or `AgentTask`; no fabricated C7/C8 reference is introduced.
- There is **no dual-format fallback**: raw prefixed values fail C9 wire validation; bare/unprefixed values fail the C5 projection helper. Existing invalid/incomplete historical C9 attempts are not silently repaired or retried. Their held/read recovery rules remain unchanged; a fresh explicit request is required where existing rules require one.
- Every other source type keeps its previous identity/input comparison, including ActionExecution SQL binding checks. Non-C5 unchanged behavior has a dedicated regression test.
- Compatibility of arbitrary manually fabricated legacy C9 refs is not claimed. The old normal path could not admit a correct native C5 fingerprint through the unchanged 64-hex validator and then match it to the same native row.

Independent review found no blocking issue in this narrow fix and verified no SQL migration was required. Six targeted suites / 67 tests passed (C5 source, Occupancy source/orchestration, architecture and denial ratchets); the expanded fingerprint suite then passed 8 tests including changed identity and unchanged non-C5 behavior. Changed TypeScript ESLint and diff hygiene passed. The carrier diagnostic suite passed 4 tests. Full typecheck/aggregate was not rerun for this follow-up; the actual two HTTP phases ran the real application path. No new heavy checks are pending in this lane after slot release.

Integration file list and overlap notes: [integration checklist](MAYA-EXPLICIT-OCCUPANCY-INTEGRATION-20261006.md). This remains one explicit owner/request vertical and does not complete C10 or authorize background initiation, multiple-opportunity exploration or mutations.
