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
    // Own names, not only the enumerable ones: a non-enumerable member would not reach `Object.keys`
    // nor `JSON.stringify`, and it is still a member able to hold something.
    expect(Object.getOwnPropertyNames(s)).toEqual(['session_ref']);
    expect(SESSION_REF_PATTERN.test(s.session_ref)).toBe(true);
    // No MEMBER able to hold a provider URL, a checkout id or a card token — the same guarantee as
    // BUTTON -> ENDPOINT, applied where the stakes are money. Every key and every value at every
    // depth is scanned; the one opaque value is elided, and that elision is the removal of a coin
    // flip, not a relaxation of the fence.
    //
    // The scan used to run over the serialised session INCLUDING the 24 random bytes of the
    // `session_ref`. Those bytes are base64url, 32 characters over a 64-symbol alphabet, so after
    // lowercasing each character equals a given letter with probability 2/64 and each of the 30
    // three-character windows equals `url` with probability (1/32)^3. A ref therefore contains
    // `url` (or `card`, or `http`) by chance about once in a thousand mints — measured p = 9.62e-4 over
    // 3,000,000 real mints under Node 22. That is a coin flip inside a test, and it landed: the
    // widgets-mutation shard P-f88 of run 36262327428 recorded this test red in its UNMUTATED
    // `baseline|unit,typecheck,k3` control on session_ref `…fRHuRL77…`, while Platform CI's full
    // 5319-test run at the same SHA was green. A red control is a red control: it makes every
    // killer that names the test vacuous and, before the gate added beside this fix, it rode out
    // in an AS-DECLARED receipt.
    //
    // One class is given up, and it is named here rather than glossed: a session_ref whose VALUE
    // carries a forbidden marker while still satisfying SESSION_REF_PATTERN is no longer scanned.
    // Everything else still bites. A member added to the wire format is caught by name and by value
    // at any depth, and by the two assertions above. A ref carrying a provider URL, a checkout URL
    // or a `:`/`/`/`.`-bearing token cannot satisfy SESSION_REF_PATTERN, which is asserted above and
    // exercised against exactly those shapes by the refusal test below. What the old scan fired on
    // in practice, and all that it fired on here, is generated entropy.
    const shape = JSON.stringify(s, (key: string, value: unknown) =>
      key === 'session_ref' ? '<opaque>' : value,
    );
    for (const forbidden of [
      'http',
      'url',
      'checkout',
      'token',
      'card',
      'provider',
    ])
      expect(shape.toLowerCase()).not.toContain(forbidden);
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
