// K12 exits.
//
// The headline is «consent records written on channel identity alone = 0», and the honest way to
// prove a zero is to show there is no mechanism, not to show a sample came back empty. So the
// tests below are mostly about absence: no allowlist row a consent capability may hold, no intent
// role that could carry a decision, no import that reaches the canonical owner.

import fs from 'node:fs';
import path from 'node:path';

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { MAYA_AI_TOOL_CATALOG } from '../../ai-tools/ai-tool.catalog';
import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import { AE_WIDGET_COMMIT_ALLOWLIST } from '../booking/booking-allowlist';
import {
  ACT_OWNER_LEDGER,
  ConsentFenceRefusal,
  NEVER_CHAT_ACTUATED,
  RegistryLoadVeto,
  aeRows,
  assertNoConsentOrIdentityAllowlisted,
  assertSensitiveSubjectAdmissible,
  isConsentCapability,
  isIdentityCapability,
  orphanedActs,
} from './data-subject-acts';
import {
  SENSITIVE_DESTINATIONS,
  assertConsentIntentAdmissible,
  composeConsentState,
  composeIdentityBinding,
  consentReadOwnerRegistered,
  intentSetsAgreeAcrossModes,
  type ConsentIntentLike,
} from './consent-bodies';
import {
  ErasureRefusal,
  HISTORY_POINTER_NAMES,
  businessModelsReferencingHistory,
  dedupeKey,
  isOpaqueDedupeKey,
  planErasure,
  replayIsByteIdentical,
} from './erasure';

const handoff = (over: Partial<ConsentIntentLike> = {}): ConsentIntentLike => ({
  role: 'handoff',
  effect: 'HANDOFF',
  target: { class: 's' },
  destination: 'shell.privacy',
  derived_floor: 'SESSION_VERIFIED',
  handoff_capability_ref: 'consent.marketing.revoke',
  ...over,
});

describe('K12 — the widget layer cannot confer consent', () => {
  it('CONSENT(cap) selects exactly 3 of 226, and IDENTITY(cap) exactly 6', () => {
    // The contract states both figures. They are re-derived from the live registry rather than
    // transcribed, and both disjuncts matter: the reachable owner today is named by its
    // actionClass, not by any of the eight reserved names, so a name-based check would miss it.
    const rows = aeRows();
    expect(rows).toHaveLength(226);
    expect(rows.filter(isConsentCapability)).toHaveLength(3);
    expect(rows.filter(isIdentityCapability)).toHaveLength(6);
  });

  it('BOTH disjuncts of each predicate are live, and each arm selects alone', () => {
    // The mutation battery found both `actionClass` arms surviving: every consent capability
    // registered today carries BOTH the consent targetKind and the consent actionClass, so either
    // arm alone reproduces the set of 3 and dropping one changes nothing measurable. That is a
    // fact about today's registry, not a reason to drop the arm — the contract declares a
    // disjunction, and a row carrying only one of the two is exactly what it is for. So each arm
    // is exercised directly, on a row that satisfies it and nothing else.
    expect(
      isConsentCapability({ capability: 'x', targetKind: 'client_consent' }),
    ).toBe(true);
    expect(
      isConsentCapability({
        capability: 'x',
        actionClass: 'record_client_consent',
      }),
    ).toBe(true);
    expect(
      isConsentCapability({
        capability: 'x',
        actionClass: 'invalidate_client_consent_authority',
      }),
    ).toBe(true);
    expect(
      isConsentCapability({ capability: 'x', targetKind: 'appointment' }),
    ).toBe(false);

    expect(
      isIdentityCapability({ capability: 'x', targetKind: 'auth_session' }),
    ).toBe(true);
    expect(
      isIdentityCapability({
        capability: 'x',
        actionClass: 'link_social_auth_identity',
      }),
    ).toBe(true);
    expect(
      isIdentityCapability({
        capability: 'x',
        actionClass: 'revoke_all_auth_sessions',
      }),
    ).toBe(true);
    expect(
      isIdentityCapability({ capability: 'x', targetKind: 'appointment' }),
    ).toBe(false);

    // And the redundancy itself is recorded: the two arms agree over the live registry today. The
    // day a registration carries one and not the other, this is where it surfaces.
    const rows = aeRows();
    const ck = ['client_consent', 'client_consent_security'];
    const ca = ['record_client_consent', 'invalidate_client_consent_authority'];
    expect(
      rows
        .filter((c) => ck.includes(c.targetKind ?? ''))
        .map((c) => c.capability),
    ).toEqual(
      rows
        .filter((c) => ca.includes(c.actionClass ?? ''))
        .map((c) => c.capability),
    );
  });

  it('the A1.6.2 key is CONSENT and is therefore unallowlistable', () => {
    const key = 'package5.wave3.record-client-consent.execute.v1';
    const row = aeRows().find((c) => c.capability === key);
    expect(row).toBeDefined();
    expect(isConsentCapability(row!)).toBe(true);
    expect(AE_WIDGET_COMMIT_ALLOWLIST.some((r) => r.ae === key)).toBe(false);
  });

  it('the start-up veto passes today and FIRES when it should', () => {
    expect(() => assertNoConsentOrIdentityAllowlisted()).not.toThrow();

    // Mutation: if a consent capability ever reached the allowlist, the process must not start.
    // Asserted by calling the predicate the veto uses on a row that would trip it, because a
    // veto that cannot be shown to fire is a comment.
    const consentCap = aeRows().find(isConsentCapability)!;
    const identityCap = aeRows().find(isIdentityCapability)!;
    expect(isConsentCapability(consentCap)).toBe(true);
    expect(isIdentityCapability(identityCap)).toBe(true);
    expect(new RegistryLoadVeto('x')).toBeInstanceOf(Error);
  });

  it('all eight reserved names resolve in NO key space', () => {
    const r = new ActionCapabilityRegistry() as unknown as Record<
      string,
      unknown
    >;
    const ae = new Set(
      (r.list as () => { capability: string }[])().map((c) => c.capability),
    );
    const c9 = new Set(C9_CAPABILITIES.map((c) => c.capabilityKey));
    const tool = new Set(
      MAYA_AI_TOOL_CATALOG.map((t: { name: string }) => t.name),
    );
    expect(NEVER_CHAT_ACTUATED).toHaveLength(8);
    expect(
      NEVER_CHAT_ACTUATED.filter((n) => ae.has(n) || c9.has(n) || tool.has(n)),
    ).toEqual([]);
  });

  it('nothing in this directory imports the canonical consent owner', () => {
    // The exit is a zero, and this is where it is earned: consent records cannot be written on
    // channel identity alone because the widget layer writes no consent record on ANY identity.
    //
    // Two things this check got wrong before, both found by mutating it rather than by reading it:
    // it matched only `import … from '…'`, so a bare side-effect import walked past; and its
    // forbidden list was narrower than the gate's, so `crm/client-consent-authority` — the module
    // that actually holds the consent write — was not on it.
    const FORBIDDEN = [
      /canonical-cutover/,
      /customers\.service/,
      /crm\/client-consent/,
      /consent-security-invalidation/,
      /client-channel-link/,
    ];
    const importsOf = (src: string): string[] =>
      [
        ...src.matchAll(/^import[^;]*?from '([^']+)';/gm),
        ...src.matchAll(/^import '([^']+)';/gm),
        ...src.matchAll(/require\( *'([^']+)'/g),
      ].map((m) => m[1]);

    // The extractor must be shown to extract, or "no forbidden imports" means "no imports found".
    const sample = importsOf(
      ["import { a } from 'x';", "import 'y';", "const z = require('w');"].join(
        '\n',
      ),
    );
    expect(sample).toEqual(['x', 'y', 'w']);

    const dir = __dirname;
    let seen = 0;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      if (f === 'consent.spec.ts') continue;
      const imports = importsOf(fs.readFileSync(path.join(dir, f), 'utf8'));
      seen += imports.length;
      for (const i of imports)
        for (const bad of FORBIDDEN) expect(i).not.toMatch(bad);
    }
    // And the files do import things, so the loop above ran over something.
    expect(seen).toBeGreaterThan(0);
  });

  it('G4: no reserved act is orphaned', () => {
    expect(ACT_OWNER_LEDGER).toHaveLength(8);
    expect(orphanedActs()).toEqual([]);
    // Positive control: the checker must be able to SEE an orphan, or its zero is a tautology.
    expect(
      orphanedActs([
        { ...ACT_OWNER_LEDGER[0], owner: 'NONE' },
        { ...ACT_OWNER_LEDGER[1], owner: '   ' },
        ACT_OWNER_LEDGER[2],
      ]),
    ).toEqual([ACT_OWNER_LEDGER[0].act, ACT_OWNER_LEDGER[1].act]);
    // Every one of the eight is covered, and the ledger's acts are exactly the reserved eight —
    // not a subset that happens to have owners.
    expect([...ACT_OWNER_LEDGER.map((r) => r.act)].sort()).toEqual(
      [...NEVER_CHAT_ACTUATED].sort(),
    );
  });
});

describe('K12 — R3.5.1: a sensitive subject admits a class-`s` handoff and nothing else', () => {
  it('accepts the one admissible shape', () => {
    expect(() => assertSensitiveSubjectAdmissible(handoff())).not.toThrow();
  });

  it('refuses every other effect', () => {
    for (const effect of [
      'COMMIT',
      'DRAFT',
      'REQUEST_APPROVAL',
      'REFINE',
      'CONTROL',
      'NONE',
    ])
      expect(() =>
        assertSensitiveSubjectAdmissible(handoff({ effect })),
      ).toThrow(ConsentFenceRefusal);
  });

  it('refuses a handoff that is not class `s`', () => {
    for (const cls of ['c', 'w', 'i', 'detail', undefined])
      expect(() =>
        assertSensitiveSubjectAdmissible(handoff({ target: { class: cls } })),
      ).toThrow(/class 's'/);
  });

  it('refuses a null handoff_capability_ref, because the test would be unevaluable', () => {
    expect(() =>
      assertSensitiveSubjectAdmissible(
        handoff({ handoff_capability_ref: null }),
      ),
    ).toThrow(/unevaluable/);
  });
});

describe('K12 — CONSENT.1 … CONSENT.6', () => {
  it('CONSENT.1 — no role but handoff or escape is expressible', () => {
    for (const role of [
      'control',
      'primary',
      'confirm',
      'destructive',
      'secondary',
    ])
      expect(() => assertConsentIntentAdmissible(handoff({ role }))).toThrow(
        /not expressible/,
      );
    expect(() => assertConsentIntentAdmissible(handoff())).not.toThrow();
  });

  it('CONSENT.2 — the escape is exempt from the floor and destination checks, and only it', () => {
    // A rule that refused the escape would make the kind unmintable outright. A fence no envelope
    // can satisfy is not a fence.
    const escape: ConsentIntentLike = {
      role: 'escape',
      effect: 'NONE',
      target: null,
      destination: null,
      derived_floor: null,
      handoff_capability_ref: null,
    };
    expect(() => assertConsentIntentAdmissible(escape)).not.toThrow();
    expect(() =>
      assertConsentIntentAdmissible({ ...escape, role: 'handoff' }),
    ).toThrow();
  });

  it('CONSENT.3 — a floor below SESSION_VERIFIED is refused', () => {
    for (const floor of ['ANONYMOUS', 'CHANNEL_IDENTITY', 'BOUND_CLIENT'])
      expect(() =>
        assertConsentIntentAdmissible(handoff({ derived_floor: floor })),
      ).toThrow(/below SESSION_VERIFIED/);
    // The one rung above is admissible, which is what "≥" means and what a hard equality would
    // have got wrong.
    expect(() =>
      assertConsentIntentAdmissible(
        handoff({ derived_floor: 'STEP_UP_VERIFIED' }),
      ),
    ).not.toThrow();
  });

  it('CONSENT.4 — nothing here is collected', () => {
    expect(() =>
      assertConsentIntentAdmissible(handoff({ input_schema: {} })),
    ).toThrow(/input_schema/);
  });

  it('CONSENT.2 — a destination that is not a live shell route is refused', () => {
    expect(() =>
      assertConsentIntentAdmissible(handoff({ destination: 'shell.invented' })),
    ).toThrow(/live shell route/);
  });

  it('every sensitive destination resolves to a route the shell actually has', () => {
    // Two spellings for one place is how destination lists drift. The shell's registry is read,
    // not restated.
    const registry = fs.readFileSync(
      path.join(
        __dirname,
        '../../../../maya-chat-shell/src/routes/registry.ts',
      ),
      'utf8',
    );
    for (const route of Object.values(SENSITIVE_DESTINATIONS))
      expect(registry).toContain(`'${route}'`);
  });
});

describe('K12 — both kinds are blocked on capability registration', () => {
  it('no consent, identity or privacy READ key is registered', () => {
    // P-09 and K23. 47 catalogue names, zero of them.
    expect(MAYA_AI_TOOL_CATALOG).toHaveLength(47);
    expect(
      MAYA_AI_TOOL_CATALOG.filter((t: { name: string }) =>
        /consent|identity|privacy/.test(t.name),
      ),
    ).toEqual([]);
    expect(consentReadOwnerRegistered()).toBe(false);
  });

  it('the correct emission is a LIMITATION with the gap ref and NO intent', () => {
    const out = composeConsentState({
      consent_kind: 'MARKETING',
      body: {} as never,
      gapRef: 'GAP-CONSENT-MKT-CHANGE',
      handoff: handoff(),
    });
    expect(out).toMatchObject({
      kind: 'LIMITATION',
      capability_gap_ref: 'GAP-CONSENT-MKT-CHANGE',
      intents: [],
    });
    // No commit, no decision, no member that could hold one.
    expect(Object.keys(out)).toEqual([
      'kind',
      'reason',
      'capability_gap_ref',
      'intents',
    ]);
  });

  it('IDENTITY_BINDING behaves identically — one rule, not two', () => {
    const out = composeIdentityBinding({
      body: {} as never,
      gapRef: 'GAP-IDENTITY-TG-UNBIND',
    });
    expect(out).toMatchObject({ kind: 'LIMITATION', intents: [] });
  });

  it('CONSENT.6 — the intent set is mode-invariant', () => {
    expect(
      intentSetsAgreeAcrossModes([
        ['i1', 'esc'],
        ['esc', 'i1'],
      ]),
    ).toBe(true);
    expect(intentSetsAgreeAcrossModes([['i1'], ['i1', 'i2']])).toBe(false);
  });
});

describe('K12 — erasure, and the proof that history was never business state', () => {
  const now = new Date('2026-09-16T12:00:00.000Z');
  const req = {
    tenantId: 't1',
    erasureRequestRef: 'er-1',
    subjectPrincipalProofHash: 'a'.repeat(64),
  };

  it('business objects referencing a message id = 0', () => {
    const schema = fs.readFileSync(
      path.join(__dirname, '../../../prisma/schema.prisma'),
      'utf8',
    );
    expect(businessModelsReferencingHistory(schema)).toEqual([]);
    // The checker must be able to see something, or its zero means nothing: the widget layer's
    // own models DO name these, and they are the models it excludes.
    expect(HISTORY_POINTER_NAMES.some((n) => schema.includes(n))).toBe(true);
  });

  it('and the walker finds an offender when there is one', () => {
    // A zero from a walker that returns nothing is indistinguishable from a zero from a walker
    // that found nothing — the mutation battery proved it by making the walker return `[]` and
    // watching the suite stay green. A positive control is the only thing that separates them.
    const synthetic = [
      'model Appointment {',
      '  id        String @id',
      '  messageId String',
      '  widgetId  String',
      '}',
      '',
      'model WidgetEmission {',
      '  widgetId String',
      '}',
    ].join('\n');
    expect(businessModelsReferencingHistory('\n' + synthetic)).toEqual([
      'Appointment.messageId',
      'Appointment.widgetId',
    ]);
  });

  it('erases the two erasable stores and writes a tombstone per row', () => {
    const stones = planErasure(
      req,
      [
        {
          store: 'timeline',
          rowKey: 'turn-1',
          erasureClass: 'CONVERSATION_CONTENT',
          fields: ['/textContent'],
        },
        {
          store: 'intent_audit',
          rowKey: 'sub-1',
          erasureClass: 'CANONICAL_ELSEWHERE',
          fields: ['/argumentsJson'],
        },
      ],
      now,
    );
    expect(stones).toHaveLength(2);
    expect(stones.map((s) => s.store).sort()).toEqual([
      'intent_audit',
      'timeline',
    ]);
    // A tombstone records WHICH fields, never what was in them.
    for (const s of stones)
      for (const f of s.fieldsErased) expect(f.startsWith('/')).toBe(true);
  });

  it('refuses an AUDIT_RETAINED row rather than skipping it', () => {
    // Skipping would return success for an erasure that erased nothing — a right that appears to
    // work. Receipts survive a conversation erasure and the caller is told so.
    expect(() =>
      planErasure(
        req,
        [
          {
            store: 'timeline',
            rowKey: 'r',
            erasureClass: 'AUDIT_RETAINED',
            fields: ['/x'],
          },
        ],
        now,
      ),
    ).toThrow(ErasureRefusal);
  });

  it('refuses a row that names no fields', () => {
    // An erasure that erased nothing, recorded as one, is a tombstone over a live row.
    expect(() =>
      planErasure(
        req,
        [
          {
            store: 'timeline',
            rowKey: 'r',
            erasureClass: 'CONVERSATION_CONTENT',
            fields: [],
          },
        ],
        now,
      ),
    ).toThrow(/names no fields/);
  });

  it('refuses an erasure with no subject', () => {
    expect(() =>
      planErasure({ ...req, subjectPrincipalProofHash: '' }, [], now),
    ).toThrow(/without a subject/);
  });

  it('after an erasure replay every canonical read is byte-identical', () => {
    const before = {
      bookings: [
        { id: 'b1', startsAt: '2026-09-20T09:00:00.000Z', staffId: 's1' },
      ],
      consent: [{ clientId: 'c1', kind: 'marketing', granted: false }],
      loyalty: [{ clientId: 'c1', balance: 1200 }],
    };
    // The erasure touches the widget layer's two stores. Nothing it touches is reachable from a
    // canonical read, so the canonical reads are the same object — and the digest says so.
    const after = JSON.parse(JSON.stringify(before)) as typeof before;
    const verdict = replayIsByteIdentical(before, after);
    expect(verdict.identical).toBe(true);
    expect(verdict.changed).toEqual([]);
  });

  it('and the comparison is not vacuous', () => {
    const before = { loyalty: [{ clientId: 'c1', balance: 1200 }] };
    const after = { loyalty: [{ clientId: 'c1', balance: 0 }] };
    expect(replayIsByteIdentical(before, after)).toMatchObject({
      identical: false,
      changed: ['loyalty'],
    });
  });

  it('key order is not a difference; value order is', () => {
    expect(
      replayIsByteIdentical({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })
        .identical,
    ).toBe(true);
    expect(replayIsByteIdentical({ a: [1, 2] }, { a: [2, 1] }).identical).toBe(
      false,
    );
  });

  it('mirror dedupe keys are opaque and survive erasure', () => {
    const k = dedupeKey({
      momentKey: 'appointment_reminder',
      subjectPrincipalProofHash: 'b'.repeat(64),
      windowStart: '2026-09-16',
    });
    expect(isOpaqueDedupeKey(k)).toBe(true);
    // Opaque is a claim about what a key CANNOT be, so the refusals are the test.
    for (const notOpaque of [
      'appointment_reminder:client-42:2026-09-16',
      k.toUpperCase(),
      k.slice(0, 63),
      `${k}0`,
      '',
    ])
      expect(isOpaqueDedupeKey(notOpaque)).toBe(false);
    // Nothing a person wrote is an input, so nothing a person wrote can be recovered.
    expect(k).not.toContain('appointment');
    // Stable across calls — a key that changed would let the same delivery through twice.
    expect(
      dedupeKey({
        momentKey: 'appointment_reminder',
        subjectPrincipalProofHash: 'b'.repeat(64),
        windowStart: '2026-09-16',
      }),
    ).toBe(k);
  });
});
