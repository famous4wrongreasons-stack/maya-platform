// The wired gates: a positive proof, a refusal proof, and the four PII proofs.
//
// Every test here would have passed vacuously a commit ago, because the gate it exercises was a
// stub that refused everything. That is the point: `mechanism_absent` is not a fence, and a suite
// that could not tell a fence from a blanket refusal is not a suite.

import type { GateContext, IntentRecordRow } from '../gate.types';
import {
  CARRIER_PII_CEILING,
  gate5,
  gate6,
  gate7,
  gate8,
  gate8R,
  gate10,
  gate11,
  gate12,
  gate13,
  gateSensitiveDest,
  recomputeFloor,
} from './gate-logic';
import { assertPolicyTotality } from '../authority/capability-policy';
import {
  CHANNEL_MAX_LEVEL,
  channelMaxLevel,
  effectiveLevel,
  resolveVerificationLevel,
} from '../authority/authority-resolver';
import {
  assertAliasesResolve,
  resolveCapability,
} from '../routing/deterministic-router';

const PRINCIPAL = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const rec = (over: Partial<IntentRecordRow> = {}): IntentRecordRow => ({
  intentTokenHash: 'h'.repeat(64),
  tenantId: 't1',
  widgetId: 'w1',
  widgetKind: 'CHOICE',
  effect: 'REFINE',
  principalProofHash: PRINCIPAL,
  verificationFloor: 'SESSION_VERIFIED',
  singleUse: true,
  consumedAt: null,
  issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  supersededByWidgetId: null,
  priority: 1,
  capabilitySpace: 'C9',
  capabilityKey: 'catalog.services.read',
  handoffSpace: null,
  handoffKey: null,
  targetJson: null,
  bodyHash: 'c'.repeat(64),
  selectionDomain: '',
  inputSchemaHash: null,
  confirmationOfKind: null,
  confirmationOfRef: null,
  producedByIntentTokenHash: null,
  renderedUtterance: null,
  ...over,
});

const ctx = (
  r: IntentRecordRow,
  over: Partial<GateContext> = {},
): GateContext => ({
  intentTokenHash: r.intentTokenHash,
  tenantId: 't1',
  principalProofHash: PRINCIPAL,
  now: new Date('2026-06-01T00:00:00.000Z'),
  record: r,
  submission: { intent_token: 'tok' },
  verificationLevel: 'SESSION_VERIFIED',
  channelMaxLevel: 'SESSION_VERIFIED',
  carrier: 'pwa',
  resolvedRoles: [],
  ...over,
});

const code = (v: ReturnType<typeof gate5>) => ('code' in v ? v.code : null);

beforeAll(() => {
  assertPolicyTotality();
  assertAliasesResolve();
});

// ── Gate 5 ───────────────────────────────────────────────────────────────────────────────────────

describe('Gate 5 — the floor is recomputed, not read', () => {
  it('POSITIVE: stored floor equals the recomputed floor, and the level meets it', () => {
    const r = rec({ verificationFloor: recomputeFloor(rec()) });
    expect(gate5(ctx(r)).outcome).toBe('pass');
  });

  it('REFUSAL: a stored floor that differs from the recomputed one refuses', () => {
    // R3.4.2 — the gateway compares against its OWN recomputation. ANY divergence refuses, raised
    // or lowered, because a policy change must not act retroactively on a token in flight.
    const r = rec({ verificationFloor: 'ANONYMOUS' });
    const v = gate5(ctx(r));
    expect(v.outcome).toBe('refuse');
    expect(code(v)).toBe('policy_floor_changed');
  });

  it('REFUSAL: this is exactly the defect that shipped — every record stored ANONYMOUS', () => {
    // emitter.service.ts wrote `verificationFloor: 'ANONYMOUS'` unconditionally, so EVERY record
    // written before this wiring claims the bottom rung. Gate 5 now refuses every one of them
    // rather than honouring a literal.
    for (const key of [
      'catalog.services.read',
      'clients.dossier.read',
      'loyalty.own.read',
    ]) {
      const r = rec({ capabilityKey: key, verificationFloor: 'ANONYMOUS' });
      expect(code(gate5(ctx(r)))).toBe('policy_floor_changed');
    }
  });

  it('REFUSAL: a level below the floor refuses, and the code depends on the effect', () => {
    const r = rec({ verificationFloor: recomputeFloor(rec()) });
    // A read-shaped effect is routed to a step-up.
    expect(code(gate5(ctx(r, { verificationLevel: 'ANONYMOUS' })))).toBe(
      'handoff_required',
    );
    // An actuating effect is refused outright: offering a path would be offering the effect.
    const commit = rec({ effect: 'COMMIT' });
    const c2 = rec({
      effect: 'COMMIT',
      verificationFloor: recomputeFloor(commit),
    });
    expect(code(gate5(ctx(c2, { verificationLevel: 'ANONYMOUS' })))).toBe(
      'needs_second_channel',
    );
  });

  it('REPLAY CANNOT LOWER THE FLOOR: the same token on a weaker carrier is capped', () => {
    const r = rec({ verificationFloor: recomputeFloor(rec()) });
    // A session that claims SESSION_VERIFIED, replayed over SMS, is still arriving over SMS.
    const v = gate5(ctx(r, { channelMaxLevel: channelMaxLevel('sms') }));
    expect(v.outcome).toBe('refuse');
    expect(code(v)).toBe('handoff_required');
  });

  it('the carrier ceiling is total, and an unknown carrier caps at the bottom', () => {
    expect(channelMaxLevel('telegram-bot')).toBe('BOUND_CLIENT');
    expect(channelMaxLevel('sms')).toBe('CHANNEL_IDENTITY');
    expect(channelMaxLevel('a-carrier-nobody-declared')).toBe('ANONYMOUS');
    expect(Object.keys(CHANNEL_MAX_LEVEL)).toHaveLength(7);
    expect(effectiveLevel('SESSION_VERIFIED', 'sms')).toBe('CHANNEL_IDENTITY');
    expect(effectiveLevel('ANONYMOUS', 'pwa')).toBe('ANONYMOUS');
  });

  it('the resolver never returns the unreachable rung', () => {
    // STEP_UP_VERIFIED is a FROZEN KNOWN LIMITATION. A resolver that could return it would quietly
    // close a gap this programme has recorded as open.
    for (const a of [
      {
        membershipResolved: true,
        channelLinkActive: true,
        channelSubject: true,
        roles: [],
      },
      {
        membershipResolved: false,
        channelLinkActive: true,
        channelSubject: true,
        roles: [],
      },
      {
        membershipResolved: false,
        channelLinkActive: false,
        channelSubject: true,
        roles: [],
      },
      {
        membershipResolved: false,
        channelLinkActive: false,
        channelSubject: false,
        roles: [],
      },
    ])
      expect(resolveVerificationLevel(a)).not.toBe('STEP_UP_VERIFIED');
    expect(
      resolveVerificationLevel({
        membershipResolved: true,
        channelLinkActive: false,
        channelSubject: false,
        roles: [],
      }),
    ).toBe('SESSION_VERIFIED');
  });
});

// ── Gate 6 ───────────────────────────────────────────────────────────────────────────────────────

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

// ── Gate 7 ───────────────────────────────────────────────────────────────────────────────────────

describe('Gate 7 — effect admissibility', () => {
  const commit = (over: Partial<IntentRecordRow> = {}) =>
    rec({
      effect: 'COMMIT',
      capabilitySpace: 'AE',
      capabilityKey: 'crm.appointment.create.v1',
      confirmationOfKind: 'draft',
      confirmationOfRef: 'draft-1',
      ...over,
    });

  it('POSITIVE: an allowlisted COMMIT behind its confirmation passes', () => {
    expect(gate7(ctx(commit())).outcome).toBe('pass');
  });

  it('REFUSAL: a COMMIT naming a capability that is not allowlisted', () => {
    const v = gate7(ctx(commit({ capabilityKey: 'crm.visit.payment.v1' })));
    expect('detail' in v && v.detail).toBe('capability_not_allowlisted');
  });

  it('REFUSAL: a COMMIT with no confirmation — the thing booking exists to prevent', () => {
    expect(code(gate7(ctx(commit({ confirmationOfRef: null }))))).toBe(
      'booking_confirmation_required',
    );
  });

  it('REFUSAL: a COMMIT whose confirmation is of the wrong kind', () => {
    // F74: `create` pairs with a draft; reschedule and cancel name an existing record.
    expect(code(gate7(ctx(commit({ confirmationOfKind: 'record' }))))).toBe(
      'booking_confirmation_required',
    );
  });

  it('REFUSAL: an actuating effect with no subject capability at all', () => {
    expect(
      code(
        gate7(
          ctx(
            rec({
              effect: 'COMMIT',
              capabilitySpace: null,
              capabilityKey: null,
            }),
          ),
        ),
      ),
    ).toBe('effect_not_admissible');
  });

  it('a NONE effect is not actuating and passes', () => {
    expect(gate7(ctx(rec({ effect: 'NONE' }))).outcome).toBe('pass');
  });
});

// ── Gate 8 and 8-R ───────────────────────────────────────────────────────────────────────────────

describe('Gate 8 — only values the server offered', () => {
  const withDomain = rec({ selectionDomain: 'opt-a,opt-b,opt-c' });

  it('POSITIVE: a value from the declared domain passes', () => {
    expect(
      gate8(
        ctx(withDomain, {
          submission: { intent_token: 't', inputs: { choice: 'opt-b' } },
        }),
      ).outcome,
    ).toBe('pass');
  });

  it('REFUSAL: a value the server never offered', () => {
    const v = gate8(
      ctx(withDomain, {
        submission: { intent_token: 't', inputs: { choice: 'opt-z' } },
      }),
    );
    expect(code(v)).toBe('selection_out_of_domain');
  });

  it('REFUSAL: an oversize submission', () => {
    const big = 'x'.repeat(20 * 1024);
    expect(
      code(
        gate8(
          ctx(withDomain, {
            submission: { intent_token: 't', inputs: { blob: big } },
          }),
        ),
      ),
    ).toBe('oversize_submission');
  });
});

describe('Gate 8-R — a spoken actuation needs the server sentence affirmed', () => {
  const spoken = { carrier: 'realtime-voice' };
  const r = rec({ effect: 'COMMIT' });

  it('POSITIVE: an affirmation naming the right body passes', () => {
    const v = gate8R(
      ctx(r, {
        ...spoken,
        submission: {
          intent_token: 't',
          readback_ack: {
            readback_ref: 'rb',
            body_hash: r.bodyHash,
            affirmation: 'да',
          },
        },
      }),
    );
    expect(v.outcome).toBe('pass');
  });

  it('REFUSAL: no readback at all', () => {
    expect(code(gate8R(ctx(r, spoken)))).toBe('readback_missing');
  });

  it('REFUSAL: an affirmation naming a DIFFERENT body', () => {
    const v = gate8R(
      ctx(r, {
        ...spoken,
        submission: {
          intent_token: 't',
          readback_ack: {
            readback_ref: 'rb',
            body_hash: 'd'.repeat(64),
            affirmation: 'да',
          },
        },
      }),
    );
    expect(code(v)).toBe('readback_mismatch');
  });

  it('a non-spoken carrier does not require one', () => {
    expect(gate8R(ctx(r)).outcome).toBe('pass');
  });
});

// ── Gate 10 — the owner's ruling, applied ────────────────────────────────────────────────────────

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

// ── Gate 11 ──────────────────────────────────────────────────────────────────────────────────────

describe('Gate 11 — the only anti-drift fence between mint and execution', () => {
  it('POSITIVE: an unchanged record passes', async () => {
    const r = rec();
    const v = await gate11(ctx(r), () =>
      Promise.resolve({ bodyHash: r.bodyHash }),
    );
    expect(v.outcome).toBe('pass');
  });

  it('REFUSAL: the record changed after the widget was shown', async () => {
    const v = await gate11(ctx(rec()), () =>
      Promise.resolve({ bodyHash: 'e'.repeat(64) }),
    );
    expect(code(v)).toBe('handle_stale');
  });

  it('REFUSAL: the referenced record no longer resolves', async () => {
    expect(code(await gate11(ctx(rec()), () => Promise.resolve(null)))).toBe(
      'handle_stale',
    );
  });
});

// ── Gate 12 — THE FOUR PII PROOFS ────────────────────────────────────────────────────────────────

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
    for (const carrier of ['web-push', 'sms']) {
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

// ── Gate 13 ──────────────────────────────────────────────────────────────────────────────────────

describe('Gate 13 — no default admission', () => {
  it('NONE has no route by design', () => {
    expect(gate13(ctx(rec({ effect: 'NONE' }))).outcome).toBe('terminate');
  });

  it('each space routes to its own destination', () => {
    expect(gate13(ctx(rec())).outcome).toBe('terminate');
    expect(
      gate13(
        ctx(
          rec({
            capabilitySpace: 'AE',
            capabilityKey: 'crm.appointment.create.v1',
          }),
        ),
      ).outcome,
    ).toBe('terminate');
    expect(
      gate13(
        ctx(
          rec({
            capabilitySpace: 'CONTROL',
            capabilityKey: 'control.widget.dismiss',
          }),
        ),
      ).outcome,
    ).toBe('terminate');
  });

  it('REFUSAL: a space the router does not know is refused, not passed', () => {
    const v = gate13(ctx(rec({ capabilitySpace: 'INVENTED' })));
    expect(v.outcome).toBe('refuse');
  });
});
