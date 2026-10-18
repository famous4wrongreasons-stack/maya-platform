# Bounded native execution — implementation checkpoint

Owner decision: [Option A approved](MAYA-NATIVE-EXECUTION-DECISION-20261018.md).
Base: `30db3a9447bf4b275eb3f885eba14e0d2ff0def2`.
This checkpoint is implementation and isolated evidence, not a release certificate.
No real signing key, credential, deployment, migration to an owner database,
entitlement, model spend, YCLIENTS operation or phone installation is authorized
or performed by this change.

## Existing owners preserved

AR-1 continues to own its certificate, trust, allowlist, platform session,
CAS, entitlement and audit. Its grant/revoke contracts are unchanged. The
`maya.phone-native-execution/1` attachment is checked by the existing offline
operator tool and a restrictive executor. It does not grant Client, booking,
confirmation or Action Engine authority. No new endpoint, role, model or column.

The ordinary compiled AppModule remains the business implementation. The entry
installs a restrictive fetch transport and the existing partner-token reader;
it does not replace chat, tools, confirmation, receipt writers or Action Engine
methods. PWA/Capacitor continue to use their canonical web channel.

The attachment binds candidate/build/executor, certificate/evidence/profile,
exact grant authorization and CAS version, environment/server, tenant/company,
User/operator/global session, pricing and window. Independent human review must
explicitly be false. Limits are at most 30 minutes, 12 model attempts, $2,
256 admitted provider reads, one create, one time-only move and one cancellation
of the run-created record. Uncertainty never replenishes a budget. Prior
transport versions and their historical candidate pins remain unchanged.

## Dispatch and replay

Installed files are private, immutable by hash and filesystem identity. Current
AR-1/database/session and active User/membership are reread at startup, ingress
and dispatch boundaries; a failed check permanently closes that process run.
Provider and model dispatch share the consumed run identity. Restart, new
attachment signature for the same run, replacement files, stale CAS and revoked
access cannot reset consumption. The model uses the existing conservative budget
owner with signed current price bounds; test prices are not production pricing.

The backend network remains private. A pull-only Unix socket exposes only
already admitted jobs to an external forwarder. It cannot accept arbitrary
network work from HTTP; the forwarder exposes no listening port or database
credentials. Jobs are single-use, bounded, rechecked before dequeue and never
requeued after connection loss. A separate executable Linux proof runs the
unmodified forwarder against a synthetic TLS provider: direct backend access is
refused, one admitted request crosses the private socket, revocation prevents
a second request, and the forwarder has no TCP listener. This transport proof
does not substitute for verifying the final deployed Compose/image/gateway.

## Operator preparation, in order (not execution permission)

1. **Agent can prepare:** finish fresh admission for the new committed candidate,
   build and pin image digest, verify React/PWA/iOS parity and rollback artifacts.
   Do not reuse an earlier certificate automatically.
2. **Owner/operator:** obtain the existing real global platform session through
   normal login. Tenant-owner login cannot substitute. Keep the private signing
   key outside Git, chat and application files; the agent does not generate it.
3. **Agent can prepare:** construct the unsigned exact attachment using the
   current certificate, existing grant receipt/version and current verified
   pricing evidence. Report all exact bindings and limits for owner review.
4. **Owner:** separately authorize the concrete real test, including its paid
   and business effects. This implementation approval is not that authorization.
5. **Operator after that approval:** sign canonical attachment bytes with the
   existing trusted operator key for this distinct execution purpose; no second
   self-signature or fabricated reviewer. Install the session, authorization,
   pricing, scope and runtime credentials privately with the existing secure
   procedure. No secret in arguments, logs or repository. Backend files are 0600
   within root-owned 0700 directories; the forwarder receives only authorization
   plus the private IPC directory, not model/partner credential files.
6. **Agent can validate after approval:** run existing operator command
   `check-native-execution` with environment file, exact tenant, candidate,
   signed attachment and operator ID. Its success is offline validation only;
   it explicitly reports no granted authority and no verified session.
7. **Agent can execute only after approval and all gates:** use the fixed
   `phone-native-packaging.mjs` output, exact image digest, private backend
   network and ordinary `phone-native-entry.mjs`. No automatic migration or
   restart/renewal is included. Verify current backend before opening the phone.
8. **Revoke/rollback:** `revokeNativeRun` writes the same run's persistent deny
   marker without requiring an unexpired certificate or current allowlist.
   Stop the executor/forwarder and use existing AR-1 revoke for the entitlement.
   Revocation is not a business cancellation. Preserve UNKNOWN and reconcile
   through existing owners; never create a replacement booking to test a retry.

All real steps remain pending. A new owner permission is needed only for the
concrete real execution, not for further isolated implementation tests.

## Evidence and limits

Fresh results and source hashes are stored in the controlling workspace under
`outputs/maya-phone-final-be58cf41-20261018/`. Working-overlay runs are diagnostic
and do not substitute for final committed-HEAD results. Final receipts below
are collected against the committed SHA by the checked-in runners. Precommit
controls passed: 243 unit/regression checks, 13 detected mutations after an
83-test green baseline, the ordinary compiled lifecycle and response-loss flows,
and six real Linux transport/isolation checks. These counts are not final-HEAD
certification and must not be promoted into one.

A previous complete mutation attempt at base `30db3a94` stopped on a red
unmutated C9 baseline. The overwritten Jest working report did not retain the
original failure message; the cause remains unknown. Eighteen isolated C9
repeats passed, which does not close that original corpus failure. A separate
full-live diagnostic reached its own five-minute runner limit before completion;
the next diagnostic's metadata said 180 minutes but its process timer still used
five minutes. Both incomplete runs are harness diagnostics, not product failures
or green baselines. The corrected diagnostic uses the existing CI process budget,
without changing any product/Jest timeout. The battery
now preserves failure details before later reports can overwrite them. No test
or product timeout was raised to turn the failure green.

The owner's 1,333 intentional tracked deletions are preserved, not restored or
staged. Final validation uses a clean committed checkout. No production state is
changed by this checkpoint.
