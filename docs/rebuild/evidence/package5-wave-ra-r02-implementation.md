# Wave R-A — R02 local implementation and executable proof

Entry contract: accepted `45688886`, exact closed inventory R02 = **B40/B41**. No new inventory, business decision, schema, migration or action class. Canonical authority remains existing **User / AuthSession / Membership / CrmStaffAccess / platform role**, with access changes owned by A16/A25 and authentication by AC3.

## Result

Native Telegram bind/self-introduction/rebind/unbind and startup admin regrant cannot write authority. Their old identifiers and SQLite projections no longer select a privileged principal. Legacy phone/VK/Yandex sessions cannot acquire staff authority; existing historical data is untouched. Unsupported native staff commands require the canonical application.

A protected read-only internal adapter uses the actual global JWT, session, tenant and role guards, then revalidates the exact current account/session/membership/access against the existing installation binding. It reads the existing AC3/A25-owned exact User/tenant Telegram AuthIdentity; ambiguous or absent identities do not manufacture a legacy chat ID. Tenant owner and platform owner remain distinct. The adapter does not create any action or business outcome.

The Python HTTP middleware protects every `/api/panel/*`, `/api/god/*` and requested staff chat/stream/history request before handler access. Each request requires a current canonical Maya session; raw signed channel metadata and legacy session tokens grant nothing. Privilege exists only in the owning request task, expires in `finally`, and cannot leak into child tasks or plain executor threads. The existing awaited SSE producer receives an explicit single-use synchronous adapter, bounded by the parent request lifetime. Simultaneous requests retain different principals. Revocation is rechecked on the next request.

Panel/AI/tool-selection helpers consume only that scoped principal. An account without an exact Telegram identity uses the existing canonical app; legacy Telegram-keyed projections return `canonical_staff_channel_required`, without a synthetic identifier. These boundaries supply access authority to dependent packages; they do not claim to fix their finance, background-delivery, journal or media business owners.

## Transport and deployment composition

Both current PWA helpers send the canonical JWT before channel metadata. `authReq` and `authPayload` preserve the same opaque proof in `Authorization` and `maya_token`. The six inventoried PWA candidates were parsed and tested: the current salon, MayaOS and VPS bundles preserve their existing canonical token; the three old public backup variants have no canonical authentication implementation and invent none. Their privileged requests fail closed and require current canonical sign-in.

Two actual PHP proxy candidates preserve that opaque token at **41 and 43** exact internal panel/GOD/chat forwarding sites. No external YClients/provider URL receives the token. The helper performs no role resolution or authentication; the backend verifies the credential. Existing payload fields remain unchanged. The canonical secret-bearing ignored PHP source was used transiently for a prototype and then restored by removing only the exact owned additions; no full PHP source is staged or committed.

The [edge manifest](package5-wave-ra-r02-edge-overlay-manifest.json) pins the exact `production → R01 → R02` chain and zero-context patches. The [pure transformer](../../../maya-saas-backend/deploy/platform/beget-edge/r02/canonical-staff-overlay.cjs) refuses unknown input hashes in CLI mode. The PHP verifier rejects both a missing internal forwarding slot and any credential forwarding before an external target. No full production source or secret-bearing config enters the patch artifacts.

The [Python overlay builder](package5-wave-ra-python-overlay.py) applies only non-overlapping R01/R02 source hunks to exact acquired active source bytes. The [Python ownership/hash manifest](package5-wave-ra-python-overlay-manifest.json) enumerates every changed function and package owner. It preserves unmodified B35 daily-report functions, the active `start_background_tasks` launcher option, the singleton webhook runner and the unchanged `pwa_api.py`. The `web.Application` middleware insertion reaches both the bot launcher and the deployed request-only PWA launcher. Canonical B36 WIP remains unchanged and is excluded only by the parent's separately reviewed release-view process.

## Proof and permanent ratchets

- **6 Jest suites / 45 tests PASS**, using the actual Nest HTTP JWT/AuthSession/TenantAccess/Roles stack for the new adapter, existing JWT/session/membership/A16 tests, and normal-backend architectural tests.
- **20 Python cases PASS** inside that normal backend test path: absent/raw/legacy proof; exact current owner and platform; wrong channel; revoked next request; missing identity; tenant-to-platform escalation; concurrent isolation; child-task/thread denial; single-use SSE transfer and expiry; direct grant tombstones; no phone/social-map promotion; and negative class-ratchet mutations.
- Existing control-plane architectural guard: **PASS, zero findings**, retaining B13–B24/B34/B35 boundaries.
- Owned TypeScript lint: **PASS, zero warnings/errors**. Build TypeScript check: **PASS**. Full wave mandatory checks remain owned by the parent.
- **6 PWA candidates / 24 transport checks PASS**; exact existing helper availability is recorded in [PWA proof](package5-wave-ra-r02-pwa-proof.json).
- Pure extracted PHP fixture: **15 checks PASS** through the parent's restricted `php8.4 -n` interpreter, with zero application imports, network, provider, database or file writes. Source/fixture hashes: [PHP proof manifest](package5-wave-ra-r02-php-proof-manifest.json).

The permanent Python ratchet scans all known B40/B41 auth modules including `bot.py`; no whole auth/admin directory exemption is introduced. It rejects raw admin/master authority, startup grants, direct SQLite authority writes, raw designated-ID actor gates, legacy session promotion, missing middleware, and unbounded request/thread authority transfer. The existing control-plane guard loads it; the normal backend architecture suite runs its negative cases. Existing A16/A25 guards remain in force.

An exploratory `tsconfig.json` command initially included historical test fixtures and produced unrelated existing fixture typing errors; it is not the documented build/scripts check and is not a claimed PASS. Initial local dependency/lint fixture errors were corrected; the final exact proof hashes and commands are in the [machine-readable result](package5-wave-ra-r02-local-proof.json).

```text
PACKAGE: R02
BLOCKERS INCLUDED: [B40, B41]
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES
R02 LOCAL EXECUTABLE PROOF: PASS
R02 PRODUCTION REMEDIATION: NOT CLAIMED — parent coordinated cutover gate pending
B36 SCHEMA: APPLIED — PRESERVED
B36 RUNTIME: NOT DEPLOYED — PRESERVED
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION BUSINESS MUTATIONS/MESSAGES: 0
OLD DATABASES TOUCHED: 0
MAIN WORKTREE WRITES: 0
PROCESS HYGIENE: 0
```
