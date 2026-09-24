// K13 exits.

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import {
  CONTROL_KEYS as CONTROL_SPACE,
  allRefs,
} from '../authority/registry-binding';
import { CONTROL_FLOOR, subjectFloorFor } from '../authority/floor';
import {
  CONTROL_KEYS as DISPATCHED,
  CONTROL_KEYS_DISPATCHED_ELSEWHERE,
} from '../control/control-registry.service';
import {
  CANONICAL_MOMENT_KEYS,
  GAP_BLOCKED_MOMENTS,
  MOMENT_COMPOSITION_INPUT_REGISTRY,
  MOMENT_REGISTRY,
  MOMENT_TEMPLATES,
  NOTIFICATION_CONSENT_REGISTRY,
  RegistryLoadFailure,
  assertMomentCompositionInput,
  assertMomentRegistryLoads,
  type MomentCompositionInput,
  momentTemplateFor,
} from './moments';
import {
  AUTHORITY_BASIS,
  PROACTIVE_EFFECT_CEILING,
  ProactiveRefusal,
  assertArtefactPredates,
  assertCellsNotNewerThanArtefact,
  assertNarrativeProvenance,
  assertNoAcknowledgementAffordance,
  assertNoRunOpening,
  assertNoRunRef,
  assertProactiveCeiling,
  isRunOpening,
  sha256,
} from './provenance';
import {
  DELIVERY_CHANNELS,
  DeliveryRefusal,
  inQuietHours,
  resolveDelivery,
  runDeliveryWindow,
  type DeliveryAttempt,
  type LivePermission,
} from './delivery';
import { composeOrSuppress, suppressionRowIsContentFree } from './suppression';

const cell = (value: unknown, state = 'KNOWN') => ({
  state,
  value: state === 'KNOWN' ? value : null,
  label: String(value),
  reason_code: state === 'KNOWN' ? null : 'NOT_COLLECTED',
  fact_ref: 0,
  as_of: '2026-09-16T08:00:00.000Z',
  evidence_refs: [
    {
      ref: 'h_' + 'a'.repeat(32),
      class: 'c9_invocation_handle',
      dereferenceable_until: null,
    },
  ],
  next_intent_ref: null,
});
const measure = (value: unknown, state = 'KNOWN') => ({
  ...cell(value, state),
  key: 'appointment.start',
  unit: 'datetime',
  basis_key: 'operations.journal.read',
  basis: 'Canonical appointment',
  currency: null,
  formatted: String(value),
  comparison: null,
});
const appointmentComposition = (
  inputs: Record<string, unknown> = {
    when: measure('2026-09-17T12:00:00.000Z'),
    service: cell('Стрижка'),
  },
): MomentCompositionInput =>
  ({
    contract: 'maya.moment-composition-input/1',
    moment_key: 'appointment_reminder',
    moment_template_key: 'mt.appointment_reminder@1',
    producer: 'canonical_owner',
    source_owner: { space: 'C9', key: 'operations.journal.read' },
    artefact_ref: 'appointment-a',
    artefact_kind: 'appointment',
    artefact_created_at: '2026-09-16T08:00:00.000Z',
    inputs,
  }) as MomentCompositionInput;

const perm = (over: Partial<LivePermission> = {}): LivePermission => ({
  notifyPrefKey: 'notify.client.appointments',
  granted: true,
  quietHoursWindow: 'Europe/Moscow 22:00-09:00',
  localHour: 14,
  ...over,
});

const attempt = (over: Partial<DeliveryAttempt> = {}): DeliveryAttempt => ({
  momentKey: 'appointment_reminder',
  subjectPrincipalProofHash: 'c'.repeat(64),
  windowStart: '2026-09-16',
  channel: 'push',
  at: new Date('2026-09-16T11:00:00.000Z'),
  ...over,
});

describe('K13 — the twelve canonical moments are DERIVED, not typed', () => {
  it('the derivation reproduces this file exactly', () => {
    // The contract asserts a cardinality and never enumerates the set. Twelve plausible names
    // would look identical to twelve derived ones, so the derivation is re-run here and compared.
    // If either canonical source moves, this fails rather than the registry silently being wrong.
    const script = path.join(
      __dirname,
      '../../../../docs/rebuild/evidence/maya-chat-first-ux/derive-canonical-moments.mjs',
    );
    const out = JSON.parse(
      execFileSync('node', [script], { encoding: 'utf8' }),
    ) as {
      moments: string[];
      domain: number;
      notificationSurfaces: number;
      artefactKinds: number;
    };
    expect(out.moments).toEqual([...CANONICAL_MOMENT_KEYS]);
    expect(out.domain).toBe(21);
    expect(out.notificationSurfaces).toBe(52);
    expect(out.artefactKinds).toBe(6);
  });

  it('MOMENT_REGISTRY carries exactly twelve rows', () => {
    expect(Object.keys(MOMENT_REGISTRY)).toHaveLength(12);
    expect([...Object.keys(MOMENT_REGISTRY)].sort()).toEqual(
      [...CANONICAL_MOMENT_KEYS].sort(),
    );
  });

  it('EP-REGISTRY-LOAD: the whole resolution chain holds', () => {
    expect(() => assertMomentRegistryLoads()).not.toThrow();
  });

  it('...and every clause in the chain can be made to FIRE', () => {
    // Run only against a valid registry, each clause could be deleted without a test turning red:
    // the thing it guards against is not present. The mutation battery proved it. So each clause
    // is fed a catalogue that breaks exactly it.
    const eleven = { ...MOMENT_REGISTRY };
    delete (eleven as Record<string, unknown>).review_alert;
    expect(() => assertMomentRegistryLoads(eleven)).toThrow(/exactly twelve/);

    const misKeyed = {
      ...MOMENT_REGISTRY,
      owner_alert: {
        ...MOMENT_REGISTRY.owner_alert,
        moment_key: 'owner_alerts',
      },
    };
    expect(() => assertMomentRegistryLoads(misKeyed)).toThrow(/does not match/);

    expect(() => assertMomentRegistryLoads(MOMENT_REGISTRY, {})).toThrow(
      /does not resolve/,
    );

    expect(() =>
      assertMomentRegistryLoads(
        MOMENT_REGISTRY,
        NOTIFICATION_CONSENT_REGISTRY,
        {},
      ),
    ).toThrow(/does not resolve in MOMENT_TEMPLATES/);

    const emptyCells = {
      ...MOMENT_TEMPLATES,
      'mt.owner_alert@1': {
        ...MOMENT_TEMPLATES['mt.owner_alert@1'],
        required_cells: [],
      },
    };
    expect(() =>
      assertMomentRegistryLoads(
        MOMENT_REGISTRY,
        NOTIFICATION_CONSENT_REGISTRY,
        emptyCells,
      ),
    ).toThrow(/silence would never be chosen/);

    const badPointer = {
      ...MOMENT_TEMPLATES,
      'mt.owner_alert@1': {
        ...MOMENT_TEMPLATES['mt.owner_alert@1'],
        required_cells: ['headline'],
      },
    };
    expect(() =>
      assertMomentRegistryLoads(
        MOMENT_REGISTRY,
        NOTIFICATION_CONSENT_REGISTRY,
        badPointer,
      ),
    ).toThrow(/not a JSON Pointer/);

    const missingInputSchema = { ...MOMENT_COMPOSITION_INPUT_REGISTRY };
    delete (missingInputSchema as Record<string, unknown>)['mt.owner_alert@1'];
    expect(() =>
      assertMomentRegistryLoads(
        MOMENT_REGISTRY,
        NOTIFICATION_CONSENT_REGISTRY,
        MOMENT_TEMPLATES,
        missingInputSchema,
      ),
    ).toThrow(/composition input schema does not resolve/);

    const unknownRequiredFact = {
      ...MOMENT_TEMPLATES,
      'mt.owner_alert@1': {
        ...MOMENT_TEMPLATES['mt.owner_alert@1'],
        required_cells: ['/client_authored_replacement'],
      },
    };
    expect(() =>
      assertMomentRegistryLoads(
        MOMENT_REGISTRY,
        NOTIFICATION_CONSENT_REGISTRY,
        unknownRequiredFact,
        MOMENT_COMPOSITION_INPUT_REGISTRY,
      ),
    ).toThrow(/has no declared Cell\/Measure type/);

    const wrongClass = {
      ...NOTIFICATION_CONSENT_REGISTRY,
      'notify.owner.alerts': {
        ...NOTIFICATION_CONSENT_REGISTRY['notify.owner.alerts'],
        consent_class: 'marketing' as never,
      },
    };
    expect(() =>
      assertMomentRegistryLoads(MOMENT_REGISTRY, wrongClass),
    ).toThrow(/always a communication consent/);
  });

  it('every row resolves its consent key and its composed template key', () => {
    for (const row of Object.values(MOMENT_REGISTRY)) {
      expect(NOTIFICATION_CONSENT_REGISTRY[row.notify_pref_key]).toBeDefined();
      const composed = `${row.moment_template_id}@${row.moment_template_version}`;
      expect(MOMENT_TEMPLATES[composed as never]).toBeDefined();
      expect(
        momentTemplateFor(row.moment_key).required_cells.length,
      ).toBeGreaterThan(0);
    }
  });

  it('a moment absent from the registry cannot be emitted', () => {
    expect(() => momentTemplateFor('growth_plan_v2')).toThrow(
      RegistryLoadFailure,
    );
    expect(() => momentTemplateFor('team_message')).toThrow(
      /cannot be emitted/,
    );
  });

  it('a delivery permission is always a communication consent', () => {
    for (const p of Object.values(NOTIFICATION_CONSENT_REGISTRY))
      expect(p.consent_class).toBe('communication');
  });
});

describe('K13 — 12/12 moments emit through Origin with a dedupe_key', () => {
  it('every moment resolves a dedupe key, and no two moments share one', () => {
    const keys = CANONICAL_MOMENT_KEYS.map(
      (momentKey) =>
        resolveDelivery(
          attempt({ momentKey }),
          perm({ notifyPrefKey: MOMENT_REGISTRY[momentKey].notify_pref_key }),
          new Set(),
        ).dedupe_key,
    );
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    for (const k of keys) expect(k).toMatch(/^[0-9a-f]{64}$/);
  });

  it('one subject, one moment, one window — three channels, one delivery', () => {
    // Push, chat and the Telegram mirror are three paths to one person, and on an installed shell
    // a person plausibly holds all three. This is the exit's zero.
    const outcome = runDeliveryWindow(
      DELIVERY_CHANNELS.map((channel) => attempt({ channel })),
      () => perm(),
    );
    expect(outcome.delivered).toHaveLength(1);
    expect(outcome.suppressed).toHaveLength(2);
    expect(
      outcome.suppressed.every(
        (s) => !s.deliver && s.because === 'already_delivered',
      ),
    ).toBe(true);
    expect(outcome.duplicates).toBe(0);
  });

  it('duplicate deliveries across a 14-day window = 0', () => {
    // A simulated window over a supplied schedule, NOT a production observation — the contract
    // asks for both and only one of them is a thing code can do. Fourteen days, twelve moments,
    // all three channels attempting every day.
    const days = Array.from(
      { length: 14 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`,
    );
    const attempts: DeliveryAttempt[] = [];
    for (const windowStart of days)
      for (const momentKey of CANONICAL_MOMENT_KEYS)
        for (const channel of DELIVERY_CHANNELS)
          attempts.push(attempt({ windowStart, momentKey, channel }));

    const outcome = runDeliveryWindow(attempts, (a) =>
      perm({ notifyPrefKey: MOMENT_REGISTRY[a.momentKey].notify_pref_key }),
    );
    expect(attempts).toHaveLength(14 * 12 * 3);
    expect(outcome.delivered).toHaveLength(14 * 12); // one channel per moment per day
    expect(outcome.duplicates).toBe(0);
  });

  it('and the dedupe is not vacuous: a different window delivers again', () => {
    const a = runDeliveryWindow(
      [attempt(), attempt({ windowStart: '2026-09-17' })],
      () => perm(),
    );
    expect(a.delivered).toHaveLength(2);
  });
});

describe('K13 — PR3c: permission and quiet hours are re-read AT DELIVERY', () => {
  it('a revocation between compose and send stops the send', () => {
    const v = resolveDelivery(attempt(), perm({ granted: false }), new Set());
    expect(v).toMatchObject({ deliver: false, because: 'consent_revoked' });
  });

  it('quiet hours suppress, and the window wraps midnight', () => {
    expect(inQuietHours(23, 'Europe/Moscow 22:00-09:00')).toBe(true);
    expect(inQuietHours(3, 'Europe/Moscow 22:00-09:00')).toBe(true);
    expect(inQuietHours(14, 'Europe/Moscow 22:00-09:00')).toBe(false);
    // A non-wrapping window is the other half, and a single `from <= hour < to` would get the
    // wrapping case backwards rather than merely wrong.
    expect(inQuietHours(12, 'Europe/Moscow 10:00-14:00')).toBe(true);
    expect(inQuietHours(16, 'Europe/Moscow 10:00-14:00')).toBe(false);
    expect(
      resolveDelivery(attempt(), perm({ localHour: 23 }), new Set()),
    ).toMatchObject({ deliver: false, because: 'quiet_hours' });
  });

  it('an unreadable window is refused, never treated as "no quiet hours"', () => {
    expect(() => inQuietHours(12, 'always')).toThrow(/refusing to treat/);
  });

  it('a permission re-read for the wrong key is refused, not silently accepted', () => {
    expect(() =>
      resolveDelivery(
        attempt(),
        perm({ notifyPrefKey: 'notify.owner.alerts' }),
        new Set(),
      ),
    ).toThrow(DeliveryRefusal);
  });

  it('a moment not in the registry cannot be delivered', () => {
    expect(() =>
      resolveDelivery(
        attempt({ momentKey: 'team_message' }),
        perm(),
        new Set(),
      ),
    ).toThrow(DeliveryRefusal);
  });
});

describe('K13 — no C10 autonomy', () => {
  it('authority_basis retains exactly one legal value', () => {
    expect(AUTHORITY_BASIS).toBe('pre_authorized_presentation');
    // A union of one, not a string that happens to hold one: there is no second member to write.
    const basis: typeof AUTHORITY_BASIS = AUTHORITY_BASIS;
    expect([basis]).toHaveLength(1);
  });

  it('PR1 — the proactive ceiling is NONE / NAVIGATE / REFINE / HANDOFF', () => {
    expect([...PROACTIVE_EFFECT_CEILING]).toEqual([
      'NONE',
      'NAVIGATE',
      'REFINE',
      'HANDOFF',
    ]);
    expect(() =>
      assertProactiveCeiling(['NONE', 'NAVIGATE', 'REFINE', 'HANDOFF']),
    ).not.toThrow();
    // DRAFT is the one the first edition permitted and two sibling documents did not. A scheduled
    // DRAFT is a server-owned draft made with no human in the loop.
    for (const over of ['DRAFT', 'COMMIT', 'REQUEST_APPROVAL', 'CONTROL'])
      expect(() => assertProactiveCeiling(['NONE', over])).toThrow(
        ProactiveRefusal,
      );
  });

  it('PR2 — RUN_OPENING is total over a NULLABLE subject', () => {
    // On a proactive envelope a null subject is the NORMAL case: every NAVIGATE has one, and the
    // mandatory escape is effect NONE. A predicate that read `.space` off null would make every
    // proactive announcement unmintable — a certification round caught exactly that.
    expect(isRunOpening(null)).toBe(false);
    expect(() => assertNoRunOpening([null, null])).not.toThrow();
  });

  it('PR2 — an unregistered C9 key satisfies RUN_OPENING, which is the fail-closed direction', () => {
    expect(isRunOpening({ space: 'C9', key: 'c9.not.registered' })).toBe(true);
    expect(() =>
      assertNoRunOpening([{ space: 'C9', key: 'c9.not.registered' }]),
    ).toThrow(/opens or continues a run/);
  });

  it('PR2 — READ keys are provenance and are admissible; PROPOSE_ONLY and OWNER_HANDOFF are not', () => {
    const rows = C9_CAPABILITIES as readonly {
      capabilityKey: string;
      mode?: string;
    }[];
    const reads = rows.filter((c) => c.mode === 'READ');
    const openers = rows.filter(
      (c) => c.mode === 'PROPOSE_ONLY' || c.mode === 'OWNER_HANDOFF',
    );
    // The contract states the membership: "15 of the 56 registered keys (13 PROPOSE_ONLY +
    // 2 OWNER_HANDOFF), verified by enumerating the live registry." Enumerated here, it
    // reproduces — 56 keys, 41 READ, 13 + 2.
    expect(rows).toHaveLength(56);
    expect(reads).toHaveLength(41);
    expect(rows.filter((c) => c.mode === 'PROPOSE_ONLY')).toHaveLength(13);
    expect(rows.filter((c) => c.mode === 'OWNER_HANDOFF')).toHaveLength(2);
    expect(openers).toHaveLength(15);
    for (const r of reads)
      expect(isRunOpening({ space: 'C9', key: r.capabilityKey })).toBe(false);
    for (const o of openers)
      expect(isRunOpening({ space: 'C9', key: o.capabilityKey })).toBe(true);
    // Membership is exactly the openers, enumerated from the live registry rather than counted.
    expect(
      rows.filter((c) => isRunOpening({ space: 'C9', key: c.capabilityKey })),
    ).toHaveLength(openers.length);
  });

  it('PR2 — a proactive IntentRecord carries a null run_ref', () => {
    expect(() =>
      assertNoRunRef([{ run_ref: null }, { run_ref: null }]),
    ).not.toThrow();
    expect(() =>
      assertNoRunRef([{ run_ref: null }, { run_ref: 'run-1' }]),
    ).toThrow(/run_ref/);
  });
});

describe('K13 — PR3: the content existed before the emission', () => {
  const row = {
    artefact_ref: 'appt-1',
    artefact_kind: 'appointment' as const,
    created_at: '2026-09-15T10:00:00.000Z',
    narrative: 'Ваша запись завтра в 12:00.',
  };
  const prov = {
    artefact_ref: 'appt-1',
    artefact_kind: 'appointment' as const,
    artefact_created_at: '2026-09-15T10:00:00.000Z',
    narrative_source: 'stored_artefact' as const,
    narrative_hash: sha256(row.narrative),
    moment_template_id: null,
    moment_template_version: null,
    notify_pref_key: 'notify.client.appointments',
  };

  it('PR3a — the artefact predates the emission', () => {
    expect(() =>
      assertArtefactPredates(prov, row, '2026-09-16T09:00:00.000Z'),
    ).not.toThrow();
    expect(() =>
      assertArtefactPredates(prov, row, '2026-09-15T09:00:00.000Z'),
    ).toThrow(/does not predate/);
  });

  it('PR3a — the timestamp is COPIED from the canonical row, not authored', () => {
    expect(() =>
      assertArtefactPredates(
        { ...prov, artefact_created_at: '2020-01-01T00:00:00.000Z' },
        row,
        '2026-09-16T09:00:00.000Z',
      ),
    ).toThrow(/authored rather than copied/);
  });

  it('PR3a — the re-read row must be the row the provenance names', () => {
    expect(() =>
      assertArtefactPredates(
        prov,
        { ...row, artefact_ref: 'appt-2' },
        '2026-09-16T09:00:00.000Z',
      ),
    ).toThrow(/not the row/);
    expect(() =>
      assertArtefactPredates(
        prov,
        { ...row, artefact_kind: 'shift' },
        '2026-09-16T09:00:00.000Z',
      ),
    ).toThrow(/artefact_kind/);
  });

  it('PR3a — no Cell may be newer than the artefact it is presented with', () => {
    expect(() =>
      assertCellsNotNewerThanArtefact(
        [{ as_of: '2026-09-15T09:00:00.000Z' }],
        row.created_at,
      ),
    ).not.toThrow();
    expect(() =>
      assertCellsNotNewerThanArtefact(
        [{ as_of: '2026-09-16T09:00:00.000Z' }],
        row.created_at,
      ),
    ).toThrow(/newer than the artefact/);
    // A null `as_of` is not a violation — it is an unmeasured cell, which K10 already refuses to
    // construct with a value.
    expect(() =>
      assertCellsNotNewerThanArtefact([{ as_of: null }], row.created_at),
    ).not.toThrow();
  });

  it('PR3b — a stored narrative must hash to what the canonical row stores', () => {
    expect(() =>
      assertNarrativeProvenance(prov, 'appointment_reminder', null, row),
    ).not.toThrow();
    expect(() =>
      assertNarrativeProvenance(prov, 'appointment_reminder', null, {
        ...row,
        narrative: 'что-то другое',
      }),
    ).toThrow(/stored field/);
  });

  it('PR3b — a template narrative must hash to the template render', () => {
    const rendered = 'Ваша запись завтра.';
    const tprov = {
      ...prov,
      narrative_source: 'moment_template' as const,
      narrative_hash: sha256(rendered),
      moment_template_id: 'mt.appointment_reminder',
      moment_template_version: 1,
    };
    expect(() =>
      assertNarrativeProvenance(
        tprov,
        'appointment_reminder',
        { rendered },
        row,
      ),
    ).not.toThrow();
    expect(() =>
      assertNarrativeProvenance(
        tprov,
        'appointment_reminder',
        { rendered: 'другое' },
        row,
      ),
    ).toThrow(/template render/);
    // The composed key must be the one the moment resolves, or a replay would render under the
    // wrong version — FR8's whole concern.
    expect(() =>
      assertNarrativeProvenance(
        { ...tprov, moment_template_version: 2 },
        'appointment_reminder',
        { rendered },
        row,
      ),
    ).toThrow(/provenance claims/);
  });

  it('PR3b — there is no third source, so composed strategy is not expressible', () => {
    expect(() =>
      assertNarrativeProvenance(
        { ...prov, narrative_source: 'composed' as never },
        'appointment_reminder',
        null,
        row,
      ),
    ).toThrow(/not one of the two legal sources/);
    // And a stored_artefact may not also claim a template — two sources named is no source proven.
    expect(() =>
      assertNarrativeProvenance(
        {
          ...prov,
          moment_template_id: 'mt.appointment_reminder',
          moment_template_version: 1,
        },
        'appointment_reminder',
        null,
        row,
      ),
    ).toThrow(/may not also claim/);
  });
});

describe('K13 — PR5b: silence is chosen, and it leaves a row', () => {
  const compositionInput = appointmentComposition();

  it('emits when every required cell is KNOWN', () => {
    const out = composeOrSuppress({
      momentKey: 'appointment_reminder',
      compositionInput,
      dedupeKey: 'd'.repeat(64),
      subjectPrincipalProofHash: 'e'.repeat(64),
      now: new Date('2026-09-16T09:00:00.000Z'),
    });
    expect(out.emit).toBe(true);
  });

  it('suppresses when a required cell is not KNOWN — no envelope, no placeholder', () => {
    for (const state of ['PARTIAL', 'NOT_MEASURED', 'UNAVAILABLE', 'PENDING']) {
      const out = composeOrSuppress({
        momentKey: 'appointment_reminder',
        compositionInput: appointmentComposition({
          ...compositionInput.inputs,
          service: cell('Стрижка', state),
        }),
        dedupeKey: 'd'.repeat(64),
        subjectPrincipalProofHash: null,
        now: new Date('2026-09-16T09:00:00.000Z'),
      });
      expect(out.emit).toBe(false);
      if (!out.emit) {
        expect(out.row.unresolvedCells).toEqual(['/service']);
        expect(out.row.moment).toBe('appointment_reminder');
        expect(out.row.momentTemplateKey).toBe('mt.appointment_reminder@1');
      }
    }
  });

  it('a missing required composition fact refuses before projection', () => {
    expect(() =>
      composeOrSuppress({
        momentKey: 'appointment_reminder',
        compositionInput: appointmentComposition({
          when: measure('2026-09-17T12:00:00.000Z'),
        }),
        dedupeKey: 'd'.repeat(64),
        subjectPrincipalProofHash: null,
        now: new Date('2026-09-16T09:00:00.000Z'),
      }),
    ).toThrow(/facts do not match schema/);
  });

  it('the suppression row carries pointers and never values', () => {
    const out = composeOrSuppress({
      momentKey: 'appointment_reminder',
      compositionInput: appointmentComposition({
        when: measure('2026-09-17T12:00:00.000Z'),
        service: cell('Стрижка бороды', 'UNAVAILABLE'),
      }),
      dedupeKey: 'd'.repeat(64),
      subjectPrincipalProofHash: null,
      now: new Date('2026-09-16T09:00:00.000Z'),
    });
    expect(out.emit).toBe(false);
    if (!out.emit) {
      expect(suppressionRowIsContentFree(out.row)).toBe(true);
      expect(JSON.stringify(out.row)).not.toContain('Стрижка');
    }
  });

  it('refuses missing, wrongly typed, client-supplied and LLM-supplied composition facts', () => {
    expect(() =>
      assertMomentCompositionInput(
        appointmentComposition({
          when: measure('2026-09-17T12:00:00.000Z'),
        }),
      ),
    ).toThrow(/facts do not match schema/);
    expect(() =>
      assertMomentCompositionInput(
        appointmentComposition({
          when: cell('not a Measure'),
          service: cell('Стрижка'),
        }),
      ),
    ).toThrow(/wrong type/);
    for (const producer of ['client', 'llm'])
      expect(() =>
        assertMomentCompositionInput({
          ...appointmentComposition(),
          producer,
        }),
      ).toThrow(/not closed/);
  });
});

describe('K13 — GAP-ATTENDANCE-CONFIRM stays open, and K13 does not close it', () => {
  it('an appointment_reminder carries the gap, and composes a LIMITATION', () => {
    expect(GAP_BLOCKED_MOMENTS.appointment_reminder).toBe(
      'GAP-ATTENDANCE-CONFIRM',
    );
    expect(MOMENT_REGISTRY.appointment_reminder.kind).toBe('LIMITATION');
  });

  it('while the gap is open only NONE, NAVIGATE and HANDOFF are admissible', () => {
    expect(() =>
      assertNoAcknowledgementAffordance(
        'appointment_reminder',
        [{ effect: 'NONE' }, { effect: 'NAVIGATE' }, { effect: 'HANDOFF' }],
        ['GAP-ATTENDANCE-CONFIRM'],
      ),
    ).not.toThrow();
    // A «Приду» control that writes nothing is not emitted.
    for (const effect of ['COMMIT', 'DRAFT', 'REFINE', 'REQUEST_APPROVAL'])
      expect(() =>
        assertNoAcknowledgementAffordance(
          'appointment_reminder',
          [{ effect }],
          ['GAP-ATTENDANCE-CONFIRM'],
        ),
      ).toThrow(/GAP-ATTENDANCE-CONFIRM is open/);
  });
});

describe('K13 — control.delivery.resolve joins the space, and the space stays closed', () => {
  it('the CONTROL space is closed at the contract’s three keys', () => {
    expect([...CONTROL_SPACE].sort()).toEqual([
      'control.delivery.resolve',
      'control.run.cancel',
      'control.widget.dismiss',
    ]);
  });

  it('the submission-dispatchable set is smaller, and the difference is exact', () => {
    // A person does not ask which channel their reminder goes out on. The two sets differ on
    // purpose, and asserting the difference is what stops one drifting from the other.
    const union = [...DISPATCHED, ...CONTROL_KEYS_DISPATCHED_ELSEWHERE].sort();
    expect(union).toEqual([...CONTROL_SPACE].sort());
    expect([...DISPATCHED]).toEqual(['control.widget.dismiss']);
  });

  it('every CONTROL key has its own floor, and none defaults to ANONYMOUS by accident', () => {
    // The ternary this replaced would have given the new key ANONYMOUS — a floor becoming a hole
    // the moment the space grew.
    expect(
      subjectFloorFor({ space: 'CONTROL', key: 'control.delivery.resolve' }),
    ).toBe('BOUND_CLIENT');
    expect(
      subjectFloorFor({ space: 'CONTROL', key: 'control.run.cancel' }),
    ).toBe('BOUND_CLIENT');
    expect(
      subjectFloorFor({ space: 'CONTROL', key: 'control.widget.dismiss' }),
    ).toBe('ANONYMOUS');
    // A key outside the space is unresolvable and gets the top rung, not the bottom.
    expect(subjectFloorFor({ space: 'CONTROL', key: 'control.invented' })).toBe(
      'STEP_UP_VERIFIED',
    );

    // The floor table's domain must EQUAL the space. While they coincide the `?? FAIL_CLOSED`
    // default is unreachable, and that is the state to hold: a key added to the space without a
    // floor row must fail here, not be quietly softened by a default.
    expect(Object.keys(CONTROL_FLOOR).sort()).toEqual(
      [...CONTROL_SPACE].sort(),
    );
  });

  it('the totality quantification still ranges over every key in every space', () => {
    expect(allRefs().filter((r) => r.space === 'CONTROL')).toHaveLength(3);
    for (const ref of allRefs()) expect(subjectFloorFor(ref)).toBeTruthy();
  });
});
