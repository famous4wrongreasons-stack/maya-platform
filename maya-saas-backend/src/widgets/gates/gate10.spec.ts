// Legacy Gate 10, as a function. Deleted with `gate10.ts`.

import { resolveCapability } from '../routing/deterministic-router';
import { gate10 } from './gate10';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 10 — REFUSAL ON EFFECT-CLASS DIVERGENCE', () => {
  it('no utterance means nothing to compare', () => {
    expect(gate10(ctx(rec())).outcome).toBe('pass');
  });

  it('agreement passes', () => {
    const r = rec({
      capabilityKey: 'catalog.services.read',
      renderedUtterance: 'покажи услуги',
    });
    expect(gate10(ctx(r)).outcome).toBe('pass');
  });

  it('SAME EFFECT CLASS → AUDIT, NOT REFUSAL', () => {
    // The tap says one read, the words resolve to another. Both are REFINE-shaped, so this is a
    // router accuracy problem and not an authority problem.
    const r = rec({
      effect: 'REFINE',
      capabilityKey: 'catalog.services.read',
      renderedUtterance: 'мои записи', // resolves to appointments.own.list — also a READ
    });
    expect(gate10(ctx(r)).outcome).toBe('pass');
  });

  it('CROSS EFFECT CLASS → REFUSE', () => {
    // The tap says COMMIT; the words resolve to a READ. The classes differ, so it refuses before
    // admission — a tap that says "look at this" must not resolve to something that writes, and
    // the converse is the same failure seen from the other side.
    const r = rec({
      effect: 'COMMIT',
      capabilityKey: 'crm.appointment.create.v1',
      renderedUtterance: 'покажи услуги',
    });
    const v = gate10(ctx(r));
    expect(v.outcome).toBe('refuse');
    expect(code(v)).toBe('intent_divergence');
  });

  it('an unresolvable utterance is not a divergence', () => {
    // The router's ignorance must not refuse a person's legitimate action on the router's behalf.
    expect(resolveCapability('что-то совершенно неизвестное')).toBeNull();
    const r = rec({ renderedUtterance: 'что-то совершенно неизвестное' });
    expect(gate10(ctx(r)).outcome).toBe('pass');
  });
});
