# AR-1 local staging — approved implementation, 2026-10-13

Owner selected Option A in `LOCAL-BOOKING-ADMISSION-DECISION.md`.
The pre-change checkpoint is `cc413bf705a2c1573271914c26071209d996290f` on
`codex/maya-local-crm-setup-20261010`. This approval covers code and synthetic
tests only. No real signing, saved-data snapshot, real grant or provider effect
is authorized by this implementation record.

## Contract

`maya.widget-release-staging-authorization/1` is a separate execution contract
in the existing AR-1 policy/writer/controller, not a second entitlement writer.
The production V1/V2 parsers still require production. Legacy independent-review
synthetic/staging authorizations retain their existing contract and trust.

The new contract requires:

- `environment=staging`, `NODE_ENV=development|test`, PostgreSQL at exactly
  `127.0.0.1`, an explicit non-5432 port and `maya_widget_release_staging_*`
  database; only the existing `schema` connection parameter is allowed.
- Separate `WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON` (public Ed25519
  keys and actual global operator identities) and
  `WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TENANTS_JSON` (explicit tenant IDs).
  Neither production trust nor legacy trust is a fallback.
- All existing execution fields: authorization/release ID, operation, exact
  tenant, candidate SHA, running build digest, certificate/evidence digest,
  fixed profile ID/digest, operator/approver/rollback owner, CAS version,
  not-before, authorization expiry and grant expiry.
- `governance=single-operator`, `independentHumanReview=false`, `reviewerId=null`,
  actual approver equals actual operator. One execution signature binds the raw
  profile certificate; a second self-signature is not independent review.
- Only `closed-input.no-handoff@1`; HANDOFF remains globally STOP, and the
  profile reader/mint/admission owners retain all restrictions.
- Same global User/session reread and advisory/row locks, CAS, atomic
  TenantEntitlement + AuditLog and audit readback. No tenant-owner elevation.
- At most 24 hours, no automatic renewal, no plan/trial grant, idempotent receipt
  replay without reapplying a revoked grant. Current allowlist and running bytes
  are checked again for effective access. Revocation targets the exact stored
  contract/release/profile/evidence/build and remains possible using a fresh
  valid authorization after allowlist removal, certificate expiry or candidate
  replacement. Legacy staging authority cannot revoke this new grant lineage,
  and new staging authority cannot revoke a legacy grant lineage.

No tables, columns, SQL migration, profile registry change, Client authority,
booking behavior, Action Engine behavior, carrier or design changes are needed.
The original retained owner database does not meet this admission contract and
was not renamed, copied or opened. The synthetic fixture-entitlement exception
and its database guard are unchanged; staging databases do not gain it.

## Operator preparation (not execution authorization)

The existing offline tool now supports `check-staging-config` and
`check-staging-command` alongside unchanged production modes. It validates
public configuration/signatures and reports `authorityGranted=false` and
`sessionVerified=false`. It does not generate a key, sign, contact a server,
log in, issue a certificate, change a database or grant anything.

Use the compiled candidate's `scripts/widget-release-operator.cjs`:

```text
check-staging-config PUBLIC_ENV EXACT_TENANT EXACT_SHA
check-staging-command PUBLIC_ENV EXACT_TENANT EXACT_SHA SIGNED_COMMAND GLOBAL_OPERATOR_ID
```

The actual HTTP `validate` remains mandatory: offline validation cannot establish
a current platform session, tenant state, database clock or CAS. Revocation is
always checked against stored release lineage by the same existing writer.
Private signing material remains operator-controlled outside Git/chat.

## Executable verification

- Existing entitlements unit suites plus `widget-release-staging.spec.ts`.
- `node --test scripts/widget-release-operator.test.cjs scripts/widget-release-operator.compiled-test.cjs`.
- `npm run test:widgets:staging -- --output NEW_ABSOLUTE_DIRECTORY` owns a new
  PostgreSQL cluster and two empty databases, replays existing migrations,
  builds this candidate, runs staging HTTP/binary tests, then preserved legacy
  and production V1/V2 HTTP/binary tests. All principals/keys are synthetic;
  the owned cluster stops in `finally`. It never reads shell application secrets.
- `npm run test:widgets:staging:mutations -- NEW_ABSOLUTE_DIRECTORY` requires
  committed source and edits only an isolated Git archive. Green controls,
  named failing assertions and restored-green controls are mandatory. Timeouts
  and test-load failures are not credited as mutation kills. Production mutation
  anchors SO-M6/SO-M7/PU-M9 are adapted to the shared helper without weakening
  their original assertions.

These targeted proofs are not full release certification. Fresh results and
exact SHA are recorded in `LOCAL-STAGING-RESULT.md` after the committed-source run. No prior
`CERTIFIED_FOR_PROFILE` claim is inherited. Later real acceptance still needs
all six execution preconditions in the approved decision packet, including fresh
release admission and separately authorized owner-data/provider operations.
