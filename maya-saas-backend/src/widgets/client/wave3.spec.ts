// K8 and K9 exits.

import {
  CLIENT_KINDS,
  KINDS_REFUSED_TO_CLIENTS,
  evaluatePresentation,
  type PresentationRequest,
} from './client-presentation';
import {
  FinanceFenceRefusal,
  SESSION_REF_PATTERN,
  assertEmittable,
  commerceOwnerRegistered,
  isValidSessionRef,
  mintShellPaySession,
  paymentUnavailable,
} from '../commerce/payment-handoff';

const req = (over: Partial<PresentationRequest> = {}): PresentationRequest => ({
  mode: 'client',
  kind: 'METRIC',
  body: { visits: 3 },
  deliveryChannel: 'pwa',
  spokenText: 'you have three visits',
  artifact: { contains_pii: false },
  principalCapabilities: ['booking.read'],
  requiredCapabilities: ['booking.read'],
  piiCeiling: 'none',
  ...over,
});

describe('K8 — the five PII fences fire against a client presentation, 5/5', () => {
  it('evaluates all five on every request, so "5/5 fired" is observable per run', () => {
    const v = evaluatePresentation(req());
    expect(v.fences).toHaveLength(5);
    expect(new Set(v.fences.map((f) => f.fence)).size).toBe(5);
    expect(v.admitted).toBe(true);
  });

  it('refuses a client body carrying personal data, and names which fence did it', () => {
    const v = evaluatePresentation(
      req({ body: { client: { full_name: 'X', phone: '+7900' } } }),
    );
    expect(v.admitted).toBe(false);
    expect(v.refusals.some((r) => r.startsWith('client_preview'))).toBe(true);
    expect(v.refusals.some((r) => r.startsWith('llm_boundary'))).toBe(true);
  });

  it('refuses CLIENT_LIST outright under presentation_mode client', () => {
    // Not "the principal lacks it" — the kind is refused for this mode. A client must never be
    // shown a list of other clients, whatever they hold.
    for (const kind of KINDS_REFUSED_TO_CLIENTS) {
      const v = evaluatePresentation(
        req({
          kind,
          principalCapabilities: ['everything'],
          requiredCapabilities: [],
        }),
      );
      expect(v.admitted).toBe(false);
      expect(
        v.refusals.some((r) =>
          r.includes("refused under presentation_mode 'client'"),
        ),
      ).toBe(true);
    }
  });

  it("refuses pii_ceiling 'client_identified' on a client presentation", () => {
    const v = evaluatePresentation(req({ piiCeiling: 'client_identified' }));
    expect(v.admitted).toBe(false);
  });

  it('carries no capability the LIVE principal does not hold — replayed under a downgrade', () => {
    // The exit's own method: replay the same emission under a downgraded principal. What was
    // admissible must stop being admissible, or the check is reading the envelope instead of the
    // principal.
    const full = req({
      requiredCapabilities: ['booking.read', 'loyalty.read'],
      principalCapabilities: ['booking.read', 'loyalty.read'],
    });
    expect(evaluatePresentation(full).admitted).toBe(true);
    const downgraded = { ...full, principalCapabilities: ['booking.read'] };
    const v = evaluatePresentation(downgraded);
    expect(v.admitted).toBe(false);
    expect(v.refusals.some((r) => r.includes('loyalty.read'))).toBe(true);
  });

  it('emits only read and refine kinds to a client', () => {
    for (const k of CLIENT_KINDS)
      expect(evaluatePresentation(req({ kind: k })).admitted).toBe(true);
    // None of the five commits anything — there is no BOOKING_CONFIRMATION in this set, because
    // confirming is K7's path and arrives through the booking flow rather than a client read.
    expect(CLIENT_KINDS).not.toContain('BOOKING_CONFIRMATION');
  });
});

describe('K9 — the finance fence', () => {
  it('money-mutating capabilities on the allowlist = 0 (asserted in the booking spec, restated here)', () => {
    expect(commerceOwnerRegistered()).toBe(false);
  });

  it('PAYMENT_HANDOFF is not emittable while the owner is unregistered', () => {
    expect(() => assertEmittable('PAYMENT_HANDOFF')).toThrow(
      FinanceFenceRefusal,
    );
    expect(() => assertEmittable('METRIC')).not.toThrow();
  });

  it('emits a LIMITATION with a gap ref and NO intent instead', () => {
    const b = paymentUnavailable('GAP-COMMERCE-PAYMENT');
    expect(b.kind).toBe('LIMITATION');
    expect(b.capability_gap_ref).toBe('GAP-COMMERCE-PAYMENT');
    expect(b.intents).toEqual([]);
    // Bodies emitted with a non-null commit_intent = 0, guaranteed by the member not existing.
    expect('commit_intent' in b).toBe(false);
  });

  it('shell.pay carries ONE opaque session_ref and nothing else', () => {
    const s = mintShellPaySession();
    expect(Object.keys(s)).toEqual(['session_ref']);
    expect(SESSION_REF_PATTERN.test(s.session_ref)).toBe(true);
    // No member able to hold a provider URL, a checkout id or a card token — the same guarantee as
    // BUTTON -> ENDPOINT, applied where the stakes are money.
    const json = JSON.stringify(s);
    for (const forbidden of [
      'http',
      'url',
      'checkout',
      'token',
      'card',
      'provider',
    ])
      expect(json.toLowerCase()).not.toContain(forbidden);
  });

  it('mints a distinct session every time, within the contract pattern', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const r = mintShellPaySession().session_ref;
      expect(isValidSessionRef(r)).toBe(true);
      seen.add(r);
    }
    expect(seen.size).toBe(200);
  });

  it('refuses a session_ref that does not match the contract pattern', () => {
    for (const bad of [
      'short',
      'has spaces',
      'https://pay.example/x',
      'a'.repeat(65),
      '',
    ])
      expect(isValidSessionRef(bad)).toBe(false);
  });
});
