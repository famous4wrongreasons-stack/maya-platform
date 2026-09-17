// ── Gate 4 — tenant scope: the call §3.9 row 4 names ────────────────────────────────────────────
//
// GATES-PLAN-V11 U4 (integrator decision D-9). The seam I-CTX landed here held the gateway's former
// inline compare, `r.tenantId === ctx.tenantId`. Row 4 (C11:4723) names something else:
// `TenantContextService.assertTenantId`. This file now makes that call, through the `TENANT_SCOPE`
// port, and has no opinion of its own — the owner throws or it does not.
//
// Why the compare had to go rather than stand beside the call: two answers to "which tenant is this
// request in" can disagree without anything going red, and the owner's is the one the rest of the
// application acts on. One answer, from the mechanism that owns it.
//
// Both of the owner's failure modes are `tenant_mismatch` here: the bound tenant differs from the
// record's, and no tenant is bound at all (`requireTenantId`). "Nothing established" and "a
// different tenant" must not be different branches, or the second becomes reachable by arranging
// the first (F5, fail closed). Any other throw out of the port is refused for the same reason: a
// gate whose owner raised does not get to guess what the raise meant.
//
// NW (D-12): this gate reads `ctx.record`, calls the port and returns. The port reads the request's
// own async-local context — no query, no row lock, no durable write.
//
// Gate 4 is shadowed twice on a conformant build: `findRecord` filters by tenant, so another
// tenant's row is never read, and Gate 3's proof hash covers `tenantId`, so it refuses first. That
// is why the REFUSAL is defence in depth (L-T, E-INDEP on the neutraliser set `N4`) rather than a
// path a client can reach — and why the POSITIVE, the `assertTenantId` call itself, is what this
// file makes live (G4-a).

import type { GateContext, GateVerdict } from '../gate.types';
import type { TenantScopePort } from '../owner-ports/tenant-scope.provider';
import { pass, refuse } from './verdict';

export const gate4 = (
  ctx: GateContext,
  // REQUIRED (IR4-1 landed and IR4-3 removed the interim default): the gateway injects
  // `TENANT_SCOPE` and hands the bound port here. There is no fallback, so "not wired" is a compile
  // error rather than a branch that quietly reproduces the inline compare row 4 replaced. `T4-WIRED`
  // [BUILD] is what turns red if the gateway ever drops the argument.
  tenantScope: TenantScopePort,
): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('tenant_mismatch', 'no record');
  try {
    // The RECORD's tenant, never the request's: asserting the request's own tenant against itself
    // is a call that cannot fail, which is the shape of a gate that looks enforced and is not.
    tenantScope.assert(r.tenantId);
  } catch {
    return refuse('tenant_mismatch', '');
  }
  return pass;
};
