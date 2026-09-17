// ── Gate 4 — tenant scope: the slot seam ────────────────────────────────────────────────────────────
//
// GATES-PLAN-V11 D-18 (I-CTX). Slot 4 calls this file, and its body is the gateway's former inline
// compare, moved without a change. The one refusal that carried no detail now carries an empty one,
// which is what the gateway's `normalise` gave it before, so `submit` returns the same verdict. The
// gateway keeps calling this file, and U4 changes only this file.
//
// V1.1's row names the call this compare stands in for: `TenantContextService.assertTenantId`
// (C11:4723). U4 makes that call here, through the `TENANT_SCOPE` port.

import type { GateContext, GateVerdict } from '../gate.types';
import { pass, refuse } from './verdict';

export const gate4 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('tenant_mismatch', 'no record');
  // The global guard has already bound the tenant; this compares the RECORD's tenant against it, which
  // the guard cannot do because the guard never saw the record.
  return r.tenantId === ctx.tenantId ? pass : refuse('tenant_mismatch', '');
};
