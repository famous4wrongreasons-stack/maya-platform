// Gate 4 at the function level (GATES-PLAN-V11 U4, D-9). Class [U]: a regression aid, never proof
// that the gate runs on the live path — that is `test/widgets-live/gate4-tenant.live-spec.ts` and,
// for the flip, E1-G4 on T-2b records.
//
// What is worth pinning here is narrow and it is not "a foreign tenant is refused". It is that the
// gate DELEGATES:
//   - the call carries the RECORD's tenant, not the request's (G4-PORT);
//   - the gate has no compare of its own, so a port that does not throw makes the gate pass even
//     when the two tenants differ (G4-NO-COMPARE). That assertion looks wrong until you read it as
//     what it is: the proof that the decision left this file. A gate that still compared would pass
//     every other test here and fail this one;
//   - every throw out of the port is `tenant_mismatch`, including the owner's "no tenant bound"
//     (G4-THROW, G4-UNBOUND).
// The adapter is tested against a REAL `TenantContextService` inside a real `run()` scope
// (G4-ADAPTER), because the whole point of the port is the owner's own method.

import { ForbiddenException } from '@nestjs/common';

import { TenantContextService } from '../../tenancy/tenant-context.service';
import {
  TenantScopeAdapter,
  type TenantScopePort,
} from '../owner-ports/tenant-scope.provider';
import { gate4 } from './gate4';
import { code, ctx, rec } from './gate-fixtures.spec-helper.spec';

/** A port that records what it was asked and answers as the test says. */
const port = (
  answer: (expected: string) => void = () => undefined,
): TenantScopePort & { readonly asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    assert: (expectedTenantId: string) => {
      asked.push(expectedTenantId);
      answer(expectedTenantId);
    },
  };
};

const throwing = (message = 'Cross-tenant access is not allowed') =>
  port(() => {
    throw new ForbiddenException(message);
  });

describe('Gate 4 — slot 4 asks the tenancy owner (§3.9 row 4, C11:4723)', () => {
  it('G4-PORT: the assertion carries the RECORD tenant, exactly once, and the gate passes when the owner does not throw', () => {
    const p = port();
    const record = rec({ tenantId: 't1' });

    expect(gate4(ctx(record, { tenantId: 't1' }), p)).toEqual({
      outcome: 'pass',
    });
    expect(p.asked).toEqual(['t1']);
  });

  it("G4-NO-COMPARE: the gate keeps no opinion of its own — a port that admits a record of another tenant makes slot 4 pass (this is what 'the decision left this file' looks like)", () => {
    const p = port();
    const record = rec({ tenantId: 'the-other-tenant' });

    expect(gate4(ctx(record, { tenantId: 't1' }), p)).toEqual({
      outcome: 'pass',
    });
    expect(p.asked).toEqual(['the-other-tenant']);
  });

  it('G4-THROW: the owner raising is the refusal — REFUSED/tenant_mismatch, and the detail stays the empty one the gateway normalises to', () => {
    const p = throwing();
    const verdict = gate4(
      ctx(rec({ tenantId: 'other' }), { tenantId: 't1' }),
      p,
    );

    expect(verdict).toEqual({
      outcome: 'refuse',
      code: 'tenant_mismatch',
      detail: '',
    });
    expect(code(verdict)).toBe('tenant_mismatch');
    expect(p.asked).toEqual(['other']);
  });

  it('G4-UNBOUND: "no tenant is bound" is the same refusal as "a different tenant", so the second cannot be reached by arranging the first (F5)', () => {
    const verdict = gate4(
      ctx(rec(), {}),
      throwing('Tenant context is required'),
    );

    expect(verdict).toEqual({
      outcome: 'refuse',
      code: 'tenant_mismatch',
      detail: '',
    });
  });

  it('G4-ANY-THROW: a port that raises anything at all still refuses; a gate whose owner raised does not guess what the raise meant', () => {
    const verdict = gate4(
      ctx(rec()),
      port(() => {
        throw new TypeError('the owner is broken');
      }),
    );

    expect(verdict).toEqual({
      outcome: 'refuse',
      code: 'tenant_mismatch',
      detail: '',
    });
  });

  it('G4-NO-RECORD: no record is `tenant_mismatch` with the seam’s own detail, and the owner is never asked', () => {
    const p = port();

    expect(gate4(ctx(rec(), { record: null }), p)).toEqual({
      outcome: 'refuse',
      code: 'tenant_mismatch',
      detail: 'no record',
    });
    expect(p.asked).toEqual([]);
  });

  describe('G4-ADAPTER — the bound port is `TenantContextService.assertTenantId` (IR4-2)', () => {
    const adapter = () => {
      const tenantContext = new TenantContextService();
      return { tenantContext, scope: new TenantScopeAdapter(tenantContext) };
    };

    it('G4-ADAPTER-PASS: inside a request bound to `t1`, asserting `t1` returns without throwing, and the gate passes', () => {
      const { tenantContext, scope } = adapter();

      tenantContext.run('gate4-spec', () => {
        tenantContext.setResolvedTenant({
          tenantId: 't1',
          userId: 'u1',
          membershipId: 'm1',
          role: 'administrator',
          source: 'membership',
        });
        expect(gate4(ctx(rec({ tenantId: 't1' })), scope)).toEqual({
          outcome: 'pass',
        });
      });
    });

    it('G4-ADAPTER-REFUSE: inside a request bound to `t1`, a record of `t2` makes the owner raise ForbiddenException, and slot 4 refuses `tenant_mismatch`', () => {
      const { tenantContext, scope } = adapter();

      tenantContext.run('gate4-spec', () => {
        tenantContext.setResolvedTenant({
          tenantId: 't1',
          userId: 'u1',
          membershipId: 'm1',
          role: 'administrator',
          source: 'membership',
        });
        expect(() => {
          scope.assert('t2');
        }).toThrow(ForbiddenException);
        expect(
          gate4(ctx(rec({ tenantId: 't2' }), { tenantId: 't1' }), scope),
        ).toEqual({
          outcome: 'refuse',
          code: 'tenant_mismatch',
          detail: '',
        });
      });
    });

    it('G4-ADAPTER-UNBOUND: with no tenant bound to the request, `requireTenantId` raises and slot 4 refuses — it does not pass for want of an answer', () => {
      const { tenantContext, scope } = adapter();

      tenantContext.run('gate4-spec', () => {
        expect(gate4(ctx(rec()), scope)).toEqual({
          outcome: 'refuse',
          code: 'tenant_mismatch',
          detail: '',
        });
      });
    });
  });
});
