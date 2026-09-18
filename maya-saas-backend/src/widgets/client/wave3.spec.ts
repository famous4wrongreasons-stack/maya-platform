// K9's exit.
//
// K8's half of this file — "the five PII fences fire against a client presentation, 5/5" — is gone
// with `client/client-presentation.ts` (IR-K4K8-1, P-K4K8's merge, landed with U12a). F95 item 2
// (C11:1882-1886) states no count and says masking stays in the OWNERS, and F18 with the C.5
// correction (C11:292-296, C11:7333) declares three presentation modes, not the four
// `client-presentation.ts` carried. What replaces it is `gates/gate12-pii-path.source.spec.ts` and
// `projection/projector-fences.architecture.spec.ts` ARCH-12-2: no widget-layer file implements a PII
// path of its own.

import {
  FinanceFenceRefusal,
  SESSION_REF_PATTERN,
  assertEmittable,
  commerceOwnerRegistered,
  isValidSessionRef,
  mintShellPaySession,
  paymentUnavailable,
} from '../commerce/payment-handoff';

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
