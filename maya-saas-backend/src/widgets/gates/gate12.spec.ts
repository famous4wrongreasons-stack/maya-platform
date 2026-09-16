// Legacy Gate 12, as a function. Deleted with the rule in `gate12.ts`.

import { CARRIER_PII_CEILING, gate12 } from './gate12';
import {
  OTHER,
  PRINCIPAL,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 12 — the data fence, on the path', () => {
  const subject = (over = {}) => ({
    subjectPrincipalProofHash: PRINCIPAL,
    subjectTenantId: 't1',
    piiClass: 'client_identified' as const,
    carrier: 'pwa',
    ...over,
  });

  it('AUTHORIZED OWN-SCOPE PII → PASS', () => {
    expect(gate12(ctx(rec()), subject()).outcome).toBe('pass');
  });

  it('CROSS-PRINCIPAL IDENTIFIED PII → REFUSE', () => {
    // The claim that produced this whole phase, restated as a test: a caller could seal and
    // persist another person's identified personal data with nothing in the path able to refuse.
    const v = gate12(ctx(rec()), subject({ subjectPrincipalProofHash: OTHER }));
    expect(v.outcome).toBe('refuse');
    expect('detail' in v && v.detail).toMatch(/another principal/);
  });

  it('CROSS-TENANT PII → REFUSE', () => {
    const v = gate12(ctx(rec()), subject({ subjectTenantId: 't2' }));
    expect(v.outcome).toBe('refuse');
    expect('detail' in v && v.detail).toMatch(/cross-tenant/);
  });

  it('PII ABOVE CARRIER CEILING → REFUSE', () => {
    // A push notification cannot hold identified personal data, whoever it belongs to.
    for (const carrier of ['web-push', 'sms'] as const) {
      const v = gate12(ctx(rec(), { carrier }), subject({ carrier }));
      expect(v.outcome).toBe('refuse');
      expect('detail' in v && v.detail).toMatch(/ceiling/);
    }
    // And a business aggregate is fine on the same carriers it would refuse PII on.
    expect(
      gate12(
        ctx(rec()),
        subject({ carrier: 'email', piiClass: 'business_aggregate' }),
      ).outcome,
    ).toBe('pass');
  });

  it('the ceiling table is total over the carriers, and an unknown one holds nothing', () => {
    expect(Object.keys(CARRIER_PII_CEILING)).toHaveLength(7);
    const v = gate12(
      ctx(rec()),
      subject({ carrier: 'a-carrier-nobody-declared' }),
    );
    expect(v.outcome).toBe('refuse');
  });

  it('cross-tenant is checked BEFORE anything else', () => {
    // A tenant mismatch is not a presentation question and must not reach a fence that could be
    // reasoned around. Both wrong at once still reports the tenant.
    const v = gate12(
      ctx(rec()),
      subject({ subjectTenantId: 't2', subjectPrincipalProofHash: OTHER }),
    );
    expect('detail' in v && v.detail).toMatch(/cross-tenant/);
  });
});
