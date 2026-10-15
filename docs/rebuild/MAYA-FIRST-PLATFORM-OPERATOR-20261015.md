# First platform operator on the separate phone-test database

Local preparation, 2026-10-15. This is deployment tooling for the existing
`platform_owner` role, not a new AR-1 engine or an execution authorization.
No real operator account, password, signature, session or entitlement is created
by this document. No server execution has been performed.

## Why the existing full seed must not be used

The read-only phone-test observation recorded in
`evidence/maya-personal-chat-entry-20261015/live-read-only-admission.json`
found no active global operator/session and no widget entitlement. A verified
personal Client link already exists; repeating Telegram is not the remedy.

`prisma/seed.ts` seeds plans, features, demo and default tenants and a mock CRM.
Its `upsertPlatformOwner` also resets the password/status of an existing matching
operator. It is not a narrow operation for this already populated database.
The broad seed has not been changed or executed on phone-test.

## Narrow initialization

`maya-saas-backend/scripts/platform-owner-bootstrap.ts` is an offline command
compiled by the existing preflight build into
`dist/scripts/platform-owner-bootstrap.js`. It has no HTTP endpoint or module
registration. Its authority is the administrator's existing privileged database
connection. A tenant session, JSON role label or bot login cannot call it.

It requires an explicit database selection, an exact expected database name and
explicit `--dry-run` or `--execute`. Input is JSON over an inherited anonymous
pipe/socket descriptor (3 or greater), never command-line passwords, an input
file, chat, Git or a newly loaded `.env` file. Dry-run accepts exactly `email` and
`expectedDatabase`; execution additionally requires `password`. No defaults or
caller-selected IDs, role, tenant, session, entitlement or reviewer are accepted.

The operator chooses the real credentials. The command does not generate a
password or any signing key. Passwords use bcrypt, with minimum 12 characters and
maximum 72 UTF-8 bytes so bcrypt cannot silently truncate. CLI output excludes
email, password, hashes, database URL and raw database errors. Clearing the input
buffer is best-effort; JavaScript strings are not a zeroization guarantee.

Within one transaction it checks `current_database()`, takes a short User writer
lock and rechecks absence of every `platform_owner` (including suspended/merged
or malformed tenant-scoped rows) and of prior bootstrap audit. A global email
collision refuses. A tenant user with the same email may coexist as a distinct
account and is never modified. It creates only one active global User with null
tenant/branch and one platform AuditLog. The audit identifies the executor as
`offline_database_operator`; `userId` is null, because no platform user has yet
authenticated. It never misattributes the operation to the newly created User.

An audit failure rolls back the User. Concurrent/repeated commands cannot create
a second operator or reset a password. A suspended account or retained bootstrap
audit requires recovery, not another initialization. No new SQL columns,
migrations, memberships, AuthSession, JWT, Client binding or grants are involved.

This command is not account recovery. It does not prove the human identity of the
database administrator. Its real execution must be separately authorized by the
owner for the selected server/database and real operator credentials.

## Next execution sequence — not yet executed

1. Finish qualification of the exact candidate and artifact inventory. Do not
   reuse the old release certificate or treat these bootstrap tests as one.
2. Owner authorizes the exact phone-test update and initialization. An operator
   chooses email/password in a reviewed protected input launcher. Do not run the
   broad Prisma seed, manually insert a session or promote the salon user.
3. Inspect the selected server/database and rollback, run the narrow dry-run,
   then execute the same reviewed initialization. Preserve its nonsecret receipt.
4. Owner logs in normally through `POST /api/auth/login` without `tenantSlug`.
   Normal auth creates and verifies the global session. The salon login remains
   a separate tenant context even when both accounts use the same email.
5. Validate the operator-owned public signing key/fingerprint, then prepare the
   exact AR-1 V2 authorization for the final candidate, certificate, profile,
   tenant, CAS and <=24h expiry. Private signing material stays with the operator,
   outside Git/chat/application files; the agent must not generate or store it.
6. Use only the existing AR-1 status/validate/grant/revoke owners after explicit
   execution authorization. Account creation is not release authorization.

The phone server runs `NODE_ENV=production`, despite being a test deployment.
The localhost-only staging contract cannot be reused there. Preserve separate
production execution authorization, HANDOFF STOP, no plan/trial grant and revoke.
The current phone wrapper still allows catalog reads only and refuses Action
Engine writes; no booking effect is authorized or enabled by this unit.

## One list of remaining owner actions

- Authorize the concrete final phone-test update/initialization/grant only after
  qualification; choose credentials for the separate actual platform account and
  perform its normal login. Existing salon/Telegram setup does not need repeating.
- Supply the operator-owned public key and perform the exact external signature.
  One real founder may be approver/operator; `independentHumanReview:false`, no
  fabricated reviewer or second self-signature.
- Authorize a bounded first real booking test separately when the read-only app
  acceptance and execution path are ready. Existing catalog/model allowances are
  not permission to create, move or cancel YCLIENTS appointments.

## Reproducible local proof

Run `node scripts/platform-owner-bootstrap-proof.mjs --run --output NEW_ABSOLUTE_DIR`
from `maya-saas-backend` with Node 22 and PostgreSQL 16 installed at the existing
local proof path. The runner creates its own loopback cluster/new database,
replays migrations only there, builds backend/tooling, runs unit and actual
HTTP/PostgreSQL/compiled-command tests and stops its cluster even on failure.
It never loads `.env`, real credentials, remote databases or providers.

The dedicated Platform CI job uses a fresh named database/service and port 55432;
the existing proof-database guard remains unchanged. The first-bootstrap suite
has a separate `.probe-spec.ts` suffix, so a normal Widgets Live run against a
shared fixture database cannot accidentally execute its bootstrap cleanup.

These are local engineering proofs. GitHub CI, full final release admission,
live DeepSeek behavior on the new prompt and acceptance on the iPhone remain
separate evidence duties. `CERTIFIED != DEPLOYED != USER ACCEPTED`.
