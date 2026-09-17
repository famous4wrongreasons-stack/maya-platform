// ── TENANT_SCOPE — Gate 4's tenancy port (GATES-PLAN-V11 U4; integrator decision D-9) ───────────
//
// §3.9 row 4 (C11:4723) does not say "compare the two tenants". It NAMES A CALL:
// `TenantContextService.assertTenantId`. The difference is the whole of this unit. A compare inside
// the widget layer is a SECOND answer to "which tenant is this request in", and two answers can
// disagree — silently, because nothing compares them — while the gate stays green. The owner's
// answer is the only one the rest of the application acts on, so the gate asks the owner.
//
// The port is deliberately smaller than the owner's method:
//   - it takes the tenant the gate has (the record's) and returns nothing;
//   - it is allowed to THROW, and the throw is the refusal. The port never reports "false", because
//     a boolean would have to be interpreted here, and interpreting it is deciding.
// `TenantContextService.assertTenantId` raises `ForbiddenException` in both of its failure modes —
// the bound tenant differs from the expected one, and `requireTenantId()` finds no bound tenant at
// all — and Gate 4 refuses on both. "No tenant established" and "a different tenant" must not be
// different branches, or the second becomes reachable by arranging the first (F5, fail closed).
//
// D-6 boundary: this file is under `owner-ports/`, the only place in the widget layer that may
// import an owner's service (k3 check 9, `widget-import-graph.architecture.spec.ts` D6-SERVICE).
// Gate 4 imports the TYPE from here and never the service.

import { Injectable } from '@nestjs/common';

import { TenantContextService } from '../../tenancy/tenant-context.service';

/** What slot 4 may ask of the tenancy owner: assert, or throw. Nothing to interpret. */
export interface TenantScopePort {
  /** Throws when `expectedTenantId` is not the tenant this request is bound to. */
  assert(expectedTenantId: string): void;
}

/**
 * The bound provider (IR4-2): `TENANT_SCOPE` → this adapter → `TenantContextService.assertTenantId`
 * (`tenancy/tenant-context.service.ts:142`). It holds no state and decides nothing; it exists so the
 * gate can name a port instead of a service, and so the call is one hop from the gate rather than
 * reconstructed inside it.
 */
@Injectable()
export class TenantScopeAdapter implements TenantScopePort {
  constructor(private readonly tenantContext: TenantContextService) {}

  assert(expectedTenantId: string): void {
    this.tenantContext.assertTenantId(expectedTenantId);
  }
}
