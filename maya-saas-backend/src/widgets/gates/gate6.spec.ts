// Gate 6, as a function, with R3.5.1's sensitive-destination check that runs in the same slot.

import { gate6, gateSensitiveDest } from './gate6';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 6 — may THIS principal exercise THIS capability', () => {
  it('POSITIVE: a registered C9 capability with a policy row passes', () => {
    expect(gate6(ctx(rec())).outcome).toBe('pass');
  });

  it('a null subject passes — there is nothing to authorise', () => {
    // NONE, and every w/i/s/detail NAVIGATE. Refusing here would make the mandatory escape unusable.
    expect(
      gate6(ctx(rec({ capabilitySpace: null, capabilityKey: null }))).outcome,
    ).toBe('pass');
  });

  it('REFUSAL: a TOOL-spaced ref may never be an intent subject', () => {
    const v = gate6(
      ctx(
        rec({
          capabilitySpace: 'TOOL',
          capabilityKey: 'catalog.services.read',
        }),
      ),
    );
    expect(code(v)).toBe('insufficient_authority');
  });

  it('REFUSAL: an unregistered key refuses at the REGISTRY check, not the policy one', () => {
    // Asserting only the code let a mutant through: with the registry check deleted, an
    // unregistered key still refused — at the policy-row check, because it has no row either. The
    // two are not redundant (a key can be registered and unclassified, or the reverse), so the
    // test names which branch fired.
    const v = gate6(ctx(rec({ capabilityKey: 'c9.not.registered' })));
    expect(code(v)).toBe('insufficient_authority');
    expect('detail' in v && v.detail).toBe('unregistered C9 key');
  });

  it('REFUSAL: a registered key with no policy row refuses at the POLICY check', () => {
    // The other branch, exercised on its own so neither can stand in for the other.
    const v = gate6(ctx(rec({ capabilityKey: 'catalog.services.read' })));
    expect(v.outcome).toBe('pass'); // it HAS a row — 56/56 are total
  });

  it('REFUSAL: a CONSENT capability — the widget layer cannot confer consent', () => {
    const v = gate6(
      ctx(
        rec({
          capabilitySpace: 'AE',
          capabilityKey: 'package5.wave3.record-client-consent.execute.v1',
        }),
      ),
    );
    expect(code(v)).toBe('insufficient_authority');
    expect('detail' in v && v.detail).toMatch(/cannot confer consent/);
  });

  it('REFUSAL: an IDENTITY capability', () => {
    const v = gate6(
      ctx(
        rec({
          capabilitySpace: 'AE',
          capabilityKey: 'package5.wave2.revoke-all-sessions.execute.v1',
        }),
      ),
    );
    expect(code(v)).toBe('insufficient_authority');
  });

  it('REFUSAL: a MONEY capability that is not allowlisted is gap-keyed', () => {
    const v = gate6(
      ctx(
        rec({ capabilitySpace: 'AE', capabilityKey: 'crm.visit.payment.v1' }),
      ),
    );
    expect(code(v)).toBe('insufficient_authority');
    expect('detail' in v && v.detail).toMatch(/gap-keyed/);
  });

  it('R3.5.1: a sensitive destination admits a class-s HANDOFF and nothing else', () => {
    // `clients.dossier.read` is `personal_data` under the signed policy, so SENSITIVE_DEST holds.
    const asRefine = rec({ capabilityKey: 'clients.dossier.read' });
    expect(code(gateSensitiveDest(ctx(asRefine)))).toBe(
      'insufficient_authority',
    );

    const asHandoff = rec({
      effect: 'HANDOFF',
      capabilitySpace: null,
      capabilityKey: null,
      handoffSpace: 'C9',
      handoffKey: 'clients.dossier.read',
      targetJson: { class: 's' },
    });
    expect(gateSensitiveDest(ctx(asHandoff)).outcome).toBe('pass');
  });
});
