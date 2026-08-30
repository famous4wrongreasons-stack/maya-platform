# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 UNRESOLVED IDENTITY CONTINUITY EXCEPTION GATE

Status: **CONTRACT COMPLETE — partition-aware continuity is valid, but a durable unresolved hold requires schema foundation**

Source checkpoint: `dbf98a92`

Report date: 2026-08-30

## 1. Scope and safety boundary

This Gate made only an architecture and data-continuity decision. It repeated
the exact read-only provider partition and ledger reconciliation, inspected
the existing Chapter 2 identity path and P4-03 fail-closed runtime behavior,
and determined the durable representation required for the accepted
`P02/P03 = UNRESOLVED` exception.

It did not register any of the 23 safe principals, create a hold row, change
schema, migrate a ledger row, change a balance, merge `P02/P03`, write to the
provider, correct the historical 800-point finding, or start another Package
4 family, Package 5, or Chapter 7.

No raw personal identifier appears in this report.

`PRODUCTION WRITES: 0`

## 2. Repeated exact identity partition

The complete 29-page provider snapshot was repeated. The result is stable:

| Partition | Principals | Unique provider identities | Collision groups | Cross-tenant collisions |
|---|---:|---:|---:|---:|
| Safe one-to-one | 23 | 23 | 0 | 0 |
| Unresolved hold (`P02/P03`) | 2 | 1 | 1 | 0 |
| **Total** | **25** | **24** | **1** | **0** |

Every source principal still resolves to an exact provider card; no provider
result is missing. The only violation of one-to-one identity is the already
accepted `P02/P03` shared external id. Removing that group from the apply set
leaves 23 exact, mutually unique, tenant-qualified mappings.

`SAFE EXACT MAPPINGS: 23/23`

`COLLISION GROUPS AMONG SAFE SET: 0`

`CROSS-TENANT COLLISIONS: 0`

The safe set can therefore undergo Chapter 2 `Client + CrmClientLink`
establishment independently at the identity layer. No relation, unique key,
or source evidence from the hold group is needed by those 23 registrations.

## 3. Exact ledger partition and reconciliation

The 121 source rows divide without overlap or loss:

| Partition | Principals | Rows | Non-zero balances | Net points |
|---|---:|---:|---:|---:|
| Safe one-to-one | 23 | 118 | 20 | 64,221 |
| `P02` hold | 1 | 2 | 1 | 490 |
| `P03` hold | 1 | 1 | 1 | 90 |
| **Total** | **25** | **121** | **22** | **64,801** |

Per-kind reconciliation is exact:

| Kind | Safe rows / points | Hold rows / points | Total rows / points |
|---|---:|---:|---:|
| `earn` | 74 / 8,125 | 0 / 0 | 74 / 8,125 |
| `backfill` | 9 / 32,710 | 2 / 180 | 11 / 32,890 |
| `yc_import` | 20 / 47,896 | 1 / 400 | 21 / 48,296 |
| `redeem` | 4 / -1,800 | 0 / 0 | 4 / -1,800 |
| `refund` | 3 / 1,000 | 0 / 0 | 3 / 1,000 |
| `welcome_cap_adjust` | 8 / -23,710 | 0 / 0 | 8 / -23,710 |
| **Total** | **118 / 64,221** | **3 / 580** | **121 / 64,801** |

The partition key is the approved legacy source-principal identity, not phone,
name, balance, or provider-card similarity. The three hold rows remain in two
distinct immutable source partitions. Neither a merge nor a reassignment is
required to preserve their value.

`UNRESOLVED VALUE PRESERVABLE WITHOUT MERGE: YES`

## 4. Partition-aware ownership contract

A future coordinated migration can avoid dual execution owners only in this
order:

```text
durable unresolved hold active for shared provider identity
  -> establish safe canonical Client identities
  -> establish/attest required account principals for safe guests
  -> freeze legacy loyalty mutation owner globally
  -> verify immutable source manifest
  -> migrate approved safe FULL_LEDGER partition
  -> reconcile 118 / 64221
  -> enable canonical owner for safe identities
  -> keep unresolved provider identity fail-closed
  -> no legacy mutating fallback for either partition
```

The unresolved partitions remain read-only provenance after the legacy writer
is frozen. They do not remain an active execution owner. Their 580 points stay
available for later migration from the immutable source manifest after an
authoritative identity decision.

This contract forbids:

- canonical and legacy mutation ownership at the same time for a safe client;
- keeping the legacy writer alive for `P02/P03` as a compatibility fallback;
- copying hold value into a guessed canonical account;
- treating absence of a canonical row as permission to mutate legacy data.

`LEGACY MUTATING FALLBACK REQUIRED: NO`

## 5. `READ-ONLY CONTINUITY HOLD` runtime behavior

While the collision remains unresolved, every loyalty action targeting the
shared provider identity must stop before an externally executable
`ActionExecution` or value mutation:

| Action | Hold behavior |
|---|---|
| earn | reject |
| redeem | reject |
| refund | reject; no automatic historical compensation |
| expiry | reject |
| backfill | reject |
| import | reject |
| issue grant | reject |
| consume grant | reject |

The machine-readable public/domain reason is:

`loyalty_identity_unresolved`

Current P4-03 services already fail closed when a required `CrmClientLink`,
`Client.userId`, or account is absent, using the internal outcome
`identity_unresolved`. A future cutover must normalize the hold-specific public
reason to `loyalty_identity_unresolved` and must not fall back to the Python
mutator.

`UNRESOLVED PRINCIPALS CAN RECEIVE NEW MUTATIONS: NO`

## 6. Why absence of `CrmClientLink` is not a durable hold

The current structures cannot fully represent this exception:

- `Client/CrmClientLink` cannot encode two unresolved principals against one
  provider external id without assigning ownership or merging them;
- canonical loyalty tables require an account owner and must not hold the 580
  points under guessed identity;
- `ActionExecution` represents attempted actions, not an identity-level
  prohibition that exists before an action;
- Git reports and migration manifests preserve evidence but are not queried by
  runtime or the Chapter 2 registration path;
- the existing `CrmService.getClientLoyalty` shadow path can invoke
  `tryRegisterCrmClient` when it sees a provider external id. Mere link absence
  could therefore later become an unintended guest link and hide the known
  collision.

Fail-closed lookup is necessary but not sufficient. The registration path and
every canonical loyalty initiator need one durable server-side fact saying the
shared provider identity is on hold.

`ADDITIONAL SCHEMA REQUIRED: YES`

## 7. Minimal schema proposal — not implemented

Introduce only one tenant-qualified identity exception model; do not build a
generic identity workflow:

```prisma
model UnresolvedClientIdentityHold {
  id                          String   @id @default(cuid())
  tenantId                    String
  provider                    String
  externalId                  String
  reasonCode                  String
  sourceNamespace             String
  sourceEvidenceHash          String
  unresolvedPrincipalCount    Int
  createdAt                   DateTime @default(now())
  resolvedAt                  DateTime?
  resolutionActionExecutionId String?

  tenant                    Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  resolutionActionExecution ActionExecution? @relation(fields: [resolutionActionExecutionId, tenantId], references: [id, tenantId], onDelete: Restrict, onUpdate: Restrict)

  @@unique([tenantId, provider, externalId])
  @@index([tenantId, reasonCode, resolvedAt])
}
```

Required database invariants for a later Schema Gate:

1. `(tenantId, provider, externalId)` is unique and is the runtime lookup;
2. `unresolvedPrincipalCount >= 2`;
3. key, reason, namespace, evidence hash, count, and creation time are
   immutable;
4. the active hold cannot be deleted;
5. resolution is a one-way transition from both resolution fields `NULL` to
   both non-`NULL`;
6. resolution binds tenant-qualified to a separately approved
   `ActionExecution`;
7. `ClientIdentityService.registerCrmClient` rejects an active hold before
   creating a `Client` or link;
8. canonical loyalty ingress rejects the same active hold with
   `loyalty_identity_unresolved` before execution creation;
9. no raw phone, name, bearer secret, balance, or ledger payload is stored in
   the hold.

This model records only the prohibition and its evidence digest. The two
legacy ledger partitions remain in the immutable migration manifest until
resolution; the hold does not become a second loyalty ledger.

No schema file, migration, trigger, relation, runtime check, or production row
was created by this Gate.

## 8. Boundary for the 23 safe principals

Partial canonical identity establishment is architecturally independent once
the durable hold is active:

- the 23 mappings have unique provider external ids;
- none uses the held external id;
- all resolve to the same exact tenant without a cross-tenant collision;
- Chapter 2 idempotency and unique constraints remain unchanged;
- rerun can converge to zero new Clients and links.

It is not yet authorized or safe to execute because the hold schema does not
exist. Registering the 23 first would leave a known collision exposed to the
automatic shadow registration path during the gap.

`PARTIAL CANONICAL IDENTITY ESTABLISHMENT SAFE: NO — UNTIL HOLD FOUNDATION IS APPLIED`

## 9. FULL_LEDGER boundary remains closed

Even after safe `Client + CrmClientLink` establishment, the accepted account
boundary still applies:

- only the control principal currently has a proven canonical
  `User + Membership + LoyaltyAccount`;
- the other 22 safe mappings would be guest Clients with `userId = NULL`;
- `LoyaltyAccount` is owned by `userId + tenantId`;
- FULL_LEDGER must not invent account principals or assign value to guests.

Therefore the 118-row safe partition is mathematically exact but not yet an
authorized target write set. Account-principal establishment/attestation is a
separate prerequisite after identity establishment.

`PARTIAL FULL_LEDGER MIGRATION SAFE: NO`

## 10. Historical 800-point finding remains separate

The missing historical refund of 800 points belongs to the exact control
principal in the 23-safe partition. It is unrelated to `P02/P03` and does not
change the 118/3 row split.

The finding remains exactly as previously approved:

- preserve source ledger truth;
- do not fabricate a refund during migration;
- any later correction must be a separate canonical value action.

`REFUND 800 CORRECTED: NO`

## 11. Manual future resolution contract

The hold may be resolved only by one of these separately approved evidence
paths:

- a proven new/distinct provider external identity;
- a proven manual identity decision with an auditable canonical principal;
- another approved canonical evidence source that establishes ownership.

The following never qualify:

- common phone or phone hash;
- name equality or similarity;
- balance similarity;
- appointment proximity;
- whichever principal acts first;
- automatic assignment to the existing shared provider card.

After resolution, the complete 25-principal identity plan, source manifest,
ledger partition, and idempotency proof must be rerun before any held value is
migrated.

## 12. Verdict

`SAFE PRINCIPALS CAN MIGRATE INDEPENDENTLY: YES — ARCHITECTURALLY`

`SAFE PRINCIPALS: 23/23`

`UNRESOLVED PRINCIPALS: 2`

`UNRESOLVED VALUE PRESERVABLE WITHOUT MERGE: YES`

`UNRESOLVED PRINCIPALS CAN RECEIVE NEW MUTATIONS: NO`

`LEGACY MUTATING FALLBACK REQUIRED: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

`PARTIAL CANONICAL IDENTITY ESTABLISHMENT SAFE: NO — UNTIL HOLD FOUNDATION IS APPLIED`

`PARTIAL FULL_LEDGER MIGRATION SAFE: NO`

`READY FOR PRODUCTION WRITES: NO`

`PRODUCTION WRITES: 0`

STOP. The next step, if approved, is a separate Schema Gate for the minimal
`UnresolvedClientIdentityHold` model. Identity registration, FULL_LEDGER
migration, and P4-03 cutover remain prohibited.
