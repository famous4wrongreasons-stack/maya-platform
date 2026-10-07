# Executable metadata preflight and Occupancy corpus compatibility

**Useful result:** candidate `2aea729196668e498faf9a9dfc95b9989cb93615` adds a runnable read-only profile preflight to the existing current-candidate launcher. It reports concrete missing setup information without opening credential/evidence references, creating services or admitting a paid run. This follows the [native bound CRM → C5 → C9 checkpoint](MAYA-NATIVE-OCCUPANCY-CHECKPOINT-20261007.md); it does not replace or expand that checkpoint's qualification.

## Code and executable result

The [launcher instructions](../../maya-saas-backend/scripts/conversation-qualification/README.md) describe `--preflight --profile-metadata /absolute/profile.json`. The strict, bounded JSON contract permits only declared target/principals, credential reference/owner/reader, evidence references/digests and an optional exact candidate binding. Every authority flag must remain false. Empty profile flags, run-mode combinations, extra fields, symlinks and oversized files refuse; nonblocking open also refuses FIFO inputs without waiting for a writer. Neither report nor error echoes supplied reference values.

The CLI freezes the existing authored corpus and checks its **30 listed source hashes** against the captured Git commit. It derives model/limits from the existing owner, hashes declared metadata and local installation observations, and optionally checks the expected candidate digest. This is not a full checkout/deployment-image attestation. Even complete declarations return `METADATA_CHECKED_NOT_AUTHORIZED`; exit zero means evaluation completed. There is no live switch, key loader, upstream transport, permit writer or change to the offline-only budget gate.

The actual [installed-binary preflight](evidence/maya-development-integration-20261006/profile-metadata/metadata-preflight.json) returns `INCOMPLETE`: exact proposed candidate binding, target/profile, process principals, credential reference/owner/reader, and inventory/egress/credential-access evidence were intentionally unknown in the checked-in example. It observed local Node 24 / PG 16 only. No remote target, permission, account availability or resource headroom was inferred from those observations.

## Executed checks

- **34 Node checks PASS**, including immutable budget/candidate regression checks and CLI no-resource negatives; full widgets-live TypeScript, fixture ESLint, script syntax and diff checks pass.
- The independent review found and closed one P2: an empty `--profile-metadata` value previously bypassed its preflight-only check. Presence is now checked explicitly and both empty-value regressions pass.
- The older current-candidate synthetic **domain-port** Occupancy fixture now declares its exact synthetic company/branch pair. Other groups and unbound-source negatives retain their existing qualification. This does not make that fixture a native provider proof.
- [Actual narrow HTTP/PG + separate dry broker](evidence/maya-development-integration-20261006/profile-metadata/occupancy-http/http-report.json): **3 dialogs / 4 turns**, **21 source preflights**, **2 canned transports**. The two deterministic explicit requests return AVAILABLE with saved C9 revisions and zero model calls. The other two turns use canned clarification; language quality is `NOT_EVALUATED`. Broker verifies 39 bound paths. Actual paid/upstream calls, external fetches and provider writes are zero. Owned broker/PG stopped, active broker requests/connections zero, PG PID file absent.

[Evidence manifest](evidence/maya-development-integration-20261006/profile-metadata/manifest.json) retains the reports, raw checks and exact checkpoint source hashes. The original full 24-dialog proof at `832c86c6` remains historical; this increment reruns only the affected Occupancy subset. Current native-adapter acceptance remains the finite synthetic-transport checkpoint at `439eeb69`, not this domain-port corpus.

## Remaining exact blockers

The selected target's inventory, principals, isolation and measured headroom remain unverified; the live broker and binding of a profile to its permit are unimplemented. A final full keyless proof on that target, current price/model/account checks after credential admission, and fresh bounded owner authorization are required before live execution. The historical pilot is closed. See the [exact prerequisites](MAYA-REAL-MODEL-PREREQUISITES-20261007.md).

No production/site/device/HTTPS operation, credential discovery, real YCLIENTS/model call, CRM mutation, notification, background C10 initiator, push or merge occurred. This is a qualified development checkpoint, not completed MAYA/C10 or language/provider acceptance. `NOT_ISSUED`.
