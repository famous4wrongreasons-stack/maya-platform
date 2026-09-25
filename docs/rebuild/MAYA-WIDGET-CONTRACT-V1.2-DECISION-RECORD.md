# MAYA Widget Contract V1.2 — owner decision record

**Baseline:** Contract V1.1 at `17b5dc0b` (`4629f8762bd47245cfd90078c329439ddd8bbb7fa15439ad76adee49d5105d09`).

**Approved:** 2026-09-25.

This record preserves the two decisions that authorize Contract V1.2. It is evidence, not an additional rule layer.
The normative rules live only in `MAYA-WIDGET-CONTRACT-V1.md`.

## OD-1 — source capability on NAVIGATE records

**Option A approved.** The corresponding NAVIGATE record stores sealed server-owned
`sourceCapabilitySpace` and `sourceCapabilityKey`. The reference is audit evidence, not authority or permission.
The client and the LLM cannot author it. Every NAVIGATE re-checks current principal, tenant, authority and capability
availability before any read. Stale, revoked or foreign authority refuses.

**Migration:** one new additive migration (`I-MIG3`). No previous migration is rewritten.

## OD-2 — partial mechanisms do not discharge sibling mechanisms

**Option C approved.** P-01 is split into the JWT widget route and separate Step-0 carrier rows. P-30 is split into
the retained record fields and a separate spoken-readback row. A complete row can discharge without discharging an
incomplete sibling. Voice and spoken rows remain pending.

Permanent interpretation:

- partial mechanism is not complete mechanism;
- Chat-First booking readiness is not voice readiness;
- discharge of one row does not discharge its sibling.

## P-G15c

P-G15c is not activated. OD-4 is not approved and Gate 5's U-class shortfall remains recorded honestly.
P-G15c is not a prerequisite of the first Chat-First booking E2E.
