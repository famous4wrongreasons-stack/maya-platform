# Wave R-A Stage 1 — R02 contract/schema assessment

Accepted checkpoint: `4a253449`. Scope is the exact closed inventory package **R02 / B40, B41**; no new discovery pass, package expansion or Bxx was performed.

```text
PACKAGE: R02
BLOCKERS INCLUDED: [B40, B41]
CANONICAL OWNER: Canonical User/Membership/CrmStaffAccess/platform access owner
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES — no package prerequisites
READY FOR IMPLEMENTATION: YES
READY FOR PRODUCTION: NO
R02 REMEDIATION PASS: NO — Stage 1 assessment/foundation proof only
```

## Contract already approved

The [final inventory](../CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md) and [exact master R02/B40/B41 records](package5-remainder-inventory-final.json) assign native staff grants and owner/admin/session gates across panel/GOD/chat/team/native commands to the same canonical access owner, with no external dependencies or schema delta.

The [Wave 2 runtime contract](../CYCLE-06-BLOCKING-PACKAGE-5-WAVE-2-A16-A25-A26-RUNTIME-CONTRACT-GATE.md) already defines A16 `configure_crm_staff_access` and `claim_crm_team_owner`; active User/Membership and platform-role revalidation; exact tenant/target/generation/intent authority; and atomic local ActionExecution/ActionTargetMutation outcomes. A25 already governs explicit revoke-other/revoke-all/link-social commands. Authentication challenge, token/session issue/rotation, refresh and current-session logout remain the exact AC3 protocol. CRM-derived access synchronization remains the exact AC5 projection.

The [accepted B13 result](../CYCLE-06-BLOCKING-PACKAGE-5-B13-DEPLOYED-FINAL-GATE-STOP-REPORT.md) already retires raw Telegram staff/manager grants, bind codes and cashier authority. B40 is the still-executable alternate direct-rebind branch of that existing violation class. B41 is the known remaining promotion of a channel/legacy session into owner authority. Closing either gap requires integration and fail-closed enforcement of these contracts, not another approval or new access model.

Historical SQLite grants/sessions are not copied into canonical authority. No speculative AuthIdentity/User/Membership/CrmStaffAccess backfill is permitted. Existing users use canonical authentication and already-approved access configuration; a raw identifier, phone match, social map or legacy owner flag cannot manufacture a principal.

## Concrete reusable implementation foundation

| Existing component | Exact reuse in R02 |
| --- | --- |
| `maya-saas-backend/src/auth/jwt.strategy.ts`, `AuthSessionService.assertAccessSession` | Validate the current session against exact user and tenant, expiration/revocation, active User; obtain tenant role from the current Membership, not the JWT role claim. Tenantless platform sessions require the canonical platform-owner role. |
| `maya-saas-backend/src/tenancy/memberships.service.ts`, TenantResolver/AccessGuard, RolesGuard | Bind one explicit tenant; enforce allowed tenant state, current active membership and route role. A tenant owner does not become a platform principal. |
| `maya-saas-backend/src/auth/social-auth.service.ts` and `auth.controller.ts` | Reuse canonical Telegram/Yandex OAuth start/complete and session issuance. Explicit identity linking remains the existing A25 action. A legacy VK/Yandex-to-chat map is not an alternate staff login; channels without accepted canonical proof fail closed or require canonical sign-in. |
| `maya-saas-backend/src/users/users.service.ts`, `crm/crm-integration.controller.ts` | Existing `team-access` controller delegates to `updateCrmTeamAccess`/`claimCrmTeamOwner`. Resolve external CRM staff through tenant/provider-qualified StaffProviderLink to canonical Staff/CrmStaffAccess. Role/login configuration remains A16. |
| `maya-saas-backend/src/package5-wave2/package5-wave2-canonical-cutover.service.ts`, `package5-wave2.service.ts` | Existing planner/ingress/executor, stable occurrence identity, retry/resume, actor and target revalidation, atomic local writes. No direct Python grant or new action class. |
| `ai администратор/legacy_client_command_bridge.py:staff_ai_turn` and accepted B21 realtime boundary | Existing pattern forwards a canonical Maya JWT into `/api/ai/chat`; it rejects legacy session/raw channel staff authority. Reuse the boundary without treating ClientChannelLink as staff/platform authority. |

`ClientChannelAuthenticatorService` verifies channel control for A18; Telegram channel control alone intentionally returns no canonical User. It must not be repurposed into a fake staff principal. Any retained native Telegram staff initiator must prove the exact existing canonical account binding/current authority before forwarding; lacking that proof, canonical sign-in is required. A new transport/helper is an implementation detail, not a new domain owner, model or action class.

`CrmService.assertCrmStaffAccessActive` is not a substitute for a generic read-only principal resolver: its current implementation may synchronize the CRM projection. R02 must use the existing canonical stored access facts and approved auth boundary; a request-time raw staff lookup or provider synchronization cannot become a new authority fallback.

## Bounded implementation map — not implemented in Stage 1

| Blocker | Inventory paths | Required convergence |
| --- | --- | --- |
| B40 | `bot.process_message → _handle_master_self_intro`, `handle_callback` `empauth_yes_*`, `_bind_master_chat_direct`, `post_init → database.add_admin` | Retire unsupported raw bind/approval branches and startup raw-admin regrant. Existing row rebinding must not bypass the already-retired bind-code branch. Any supported staff-access command goes through authenticated canonical A16 with one exact target; self-introduction or callback data never grants access. |
| B41 | `_panel_auth`, `_panel_resolve_role`, `_god_gate`, panel/GOD financial/control handlers | One current canonical session/principal boundary, exact role and tenant for every access. Remove FOUNDER_IDS/admins/legacy-session promotion. Keep already-retired endpoints retired. Canonical platform role is checked independently from tenant owner and presentation flags. |
| B41 | Staff chat/stream/history and native role switches (`_chat_effective_mode`, `_resolve_chat_tg_user`, native AI `_resolve_role`) | Authenticate before reading a staff conversation, selecting staff tools or granting owner capabilities; forward the canonical principal to existing owners. A signed channel subject alone and historical SQLite role never permit escalation. |
| B41 | `team_chat_send/fetch/delete/upload_auth` and related native command authorization | Enforce exact canonical User/tenant before access, including ownership/role requirements. This only supplies access authority: it does not complete R12 message/media lifecycle or grant permission to R11/R13/R14 mutations. |
| B41 | Legacy Yandex/VK session issuer and `/start app_*` | Stop phone/social-map-to-staff promotion. Canonical authentication/session protocol remains the sole staff session authority; legacy compatibility sessions cannot gain privileges when native/admin tables change. Existing canonical revocation must take effect on the next request. |

R02 publishes the common principal boundary for dependent packages. It does not repair their scheduled delivery, expense/cash, settings, journal or media owners. Authenticated access is necessary but not sufficient to authorize those business effects. Shared native/proxy files must be integrated with R01; package commits remain logically separable.

## Local executable proof and limits

The [machine-readable proof](package5-wave-ra-r02-proof.json) records exact commands, suite/test counts and source hashes. Foundation tests execute real canonical functions against mocked repositories/planners; Python tests extract exact production functions and trap database/provider calls. They require no database, service or network access.

The separate [known-path witness](package5-wave-ra-r02-known-paths.proof.py) extracts three existing B40/B41 functions and supplies only fake dependencies. It confirms that the current direct rebind still attempts an UPDATE, the current raw admin still becomes panel owner, and a phone projection plus legacy admin still issues a staff legacy session. These are expected **current-path contract failures** in the accepted inventory, not new blockers or remediation acceptance. Existing B13 tests intentionally retain the old owner branch; their PASS therefore cannot prove B41 fixed.

No runtime/schema/migration was edited. No package-wide security acceptance, concurrent PostgreSQL proof, broad mandatory backend regression, lint/typechecks/build, production preparation or deployment was claimed by this bounded Stage 1 proof. Those gates remain required for implementation/cutover acceptance.

## Permanent R02 ratchet — mandatory acceptance for implementation

The implementation must add a package-level architectural guard over every known B40/B41 authorization entry, including native command/callback helpers and Python/PHP/PWA relays. No `auth/*`, `bot.py`, admin directory or transport-wide exemption is allowed. The guard must:

- Reject direct legacy staff/admin grant writes and startup regrant, including the existing-row UPDATE and callback/self-introduction variants.
- Reject raw Telegram IDs, FOUNDER_IDS/admins, phone matches, VK/Yandex chat maps, legacy web sessions or presentation flags as staff/tenant/platform authority.
- Require canonical session/principal validation before panel/GOD/chat/history/team access and tool selection; preserve exact tenant, role, target and caller binding.
- Require supported access mutations to traverse existing A16/A25 ingress and preserve AC3/AC5 only in their exact approved protocol/projection scope.
- Include executable authorization cases for absent/revoked/expired session, inactive user/membership/access, wrong tenant/user, tenant-owner-to-platform escalation, changed role after admission, accepted canonical owner/admin/staff, and denial before any action/write/provider effect.
- Include adversarial scanner tests that insert each forbidden pattern into a known path and prove rejection, plus a valid canonical delegation example. A textual marker or a list of checked filenames alone is insufficient.

Proof must distinguish read-only access validation from action execution, test concurrent/retry behavior through existing ActionExecution where R02 dispatches a command, and retain B13/B20/B21/B32 and Package 4 authority boundaries. Until this ratchet and package-local integration proof pass, R02 remains **READY FOR IMPLEMENTATION**, not **READY FOR PRODUCTION**.

```text
PRODUCTION MUTATIONS/MESSAGES: 0
DATABASE CONNECTIONS: 0
OLD DATABASES TOUCHED: 0
MAIN WORKTREE WRITES: 0
RUNTIME/SCHEMA/MIGRATION/DEPLOYMENT CHANGES: 0/0/0/0
NEW DISCOVERY PASS: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```
