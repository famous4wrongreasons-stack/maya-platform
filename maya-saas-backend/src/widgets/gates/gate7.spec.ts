// Gate 7, as a function: every clause of §3.9 row 7, over the fixture set of the G7 spec (§6.3).
//
// CLASS [U]. A function-level spec is never live proof (§0.5), and nothing here flips a clause. What
// it is for: each clause is exercised in BOTH directions — one record it admits and one it refuses —
// because a clause that is only ever seen passing is indistinguishable from a clause that is not
// there. The `detail` prefix (`G7.C1:` …) is asserted, so two clauses sharing a code are told apart.
//
// The COMMIT cases that need an allowlist row the live table does not hold are marked
// **fixture-only** and run under a substituted P-23 runtime allowlist. That substitution is the only one
// in this file, it is named at every call site, and it never substitutes a registry or a policy row.

import type { EffectClass } from '../../widget-contract/intent';
import type { ProducingRecordRow } from '../authority/commit-guard';
import type { ProposePairingRow } from '../authority/propose-pairing';
import { AE_WIDGET_COMMIT_ALLOWLIST as P23_ALLOWLIST } from '../authority/ae-commit-allowlist.runtime';
import type { AllowlistRow } from '../booking/booking-allowlist';
import type { GateVerdict, IntentRecordRow } from '../gate.types';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';
import { gate7 } from './gate7';

beforeAll(guardRegistries);

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────

const C9 = (key: string) => ({ capabilitySpace: 'C9', capabilityKey: key });
const AE = (key: string) => ({ capabilitySpace: 'AE', capabilityKey: key });
const CONTROL = (key: string) => ({
  capabilitySpace: 'CONTROL',
  capabilityKey: key,
});
const handoff = (space: string, key: string) => ({
  capabilitySpace: null,
  capabilityKey: null,
  handoffSpace: space,
  handoffKey: key,
});
/** A target of the given class. Only class `c` names a ref (§2.3.4). */
const target = (cls: string, ref?: { space: string; key: string }) => ({
  targetJson: ref ? { class: cls, ref } : { class: cls },
});

const record = (over: Partial<IntentRecordRow>): IntentRecordRow =>
  rec({
    widgetKind: 'METRIC',
    effect: 'NONE',
    capabilitySpace: null,
    capabilityKey: null,
    priority: 0,
    deliveryChannel: 'pwa',
    ...over,
  });

/** The clause id a refusal reports, e.g. `C7`. `null` for a pass. */
const clause = (v: GateVerdict): string | null => {
  if (!('detail' in v) || typeof v.detail !== 'string') return null;
  const m = /^G7\.([A-Za-z0-9]+):/.exec(v.detail);
  return m ? m[1] : `unprefixed(${v.detail})`;
};

const detail = (v: GateVerdict): string =>
  'detail' in v && typeof v.detail === 'string' ? v.detail : '';

/** A producing-record loader over a fixed table, and the hashes it was asked for. */
const producing = (
  rows: Readonly<Record<string, ProducingRecordRow>>,
): {
  load: (h: string) => Promise<ProducingRecordRow | null>;
  asked: string[];
} => {
  const asked: string[] = [];
  return {
    asked,
    load: (h) => {
      asked.push(h);
      return Promise.resolve(rows[h] ?? null);
    },
  };
};

const NEVER_ASKED = producing({});

// ── substitution (fixture-only) ─────────────────────────────────────────────────────────────────

interface Substitutes {
  readonly allowlist?: readonly AllowlistRow[];
  readonly pairing?: readonly ProposePairingRow[];
}

/**
 * Re-loads Gate 7 with the P-23 runtime allowlist (and optionally `AE_PROPOSE_PAIRING`) replaced.
 * Used only where the case says "fixture-only": the live allowlist deliberately has no MONEY,
 * consent, identity or tenant-authority row, and a fence never shown refusing is not a fence.
 */
const withSubstitutes = async <T>(
  subs: Substitutes,
  work: (g: typeof gate7) => Promise<T>,
): Promise<T> => {
  let loaded: { gate7: typeof gate7 } | undefined;
  jest.isolateModules(() => {
    if (subs.allowlist || subs.pairing) {
      const rows = subs.allowlist;
      const runtimeRows = rows
        ? Object.fromEntries(
            rows.map((candidate) => [
              candidate.ae,
              {
                confirmation_kind: candidate.confirmationKind,
                family:
                  candidate.confirmationKind === 'BOOKING_CONFIRMATION'
                    ? 'booking'
                    : 'settings',
                min_verification: 'SESSION_VERIFIED',
                requires_ae_approval: false,
                propose: { space: 'C9', key: candidate.proposeKey },
              },
            ]),
          )
        : P23_ALLOWLIST;
      jest.doMock('../authority/ae-commit-allowlist.runtime', () => ({
        ...jest.requireActual<object>(
          '../authority/ae-commit-allowlist.runtime',
        ),
        AE_WIDGET_COMMIT_ALLOWLIST: runtimeRows,
      }));
    }
    if (subs.allowlist) {
      const rows = subs.allowlist;
      jest.doMock('../booking/booking-allowlist', () => ({
        ...jest.requireActual<object>('../booking/booking-allowlist'),
        AE_WIDGET_COMMIT_ALLOWLIST: rows,
        isAllowlisted: (ae: string) =>
          rows.some((candidate) => candidate.ae === ae),
        rowFor: (ae: string) =>
          rows.find((candidate) => candidate.ae === ae) ?? null,
      }));
    }
    if (subs.pairing) {
      const rows = subs.pairing;
      jest.doMock('../authority/propose-pairing', () => {
        const only = (ae: string) => {
          const hit = rows.filter((r) => r.ae.key === ae);
          return hit.length === 1 ? hit[0] : null;
        };
        return {
          ...jest.requireActual<object>('../authority/propose-pairing'),
          AE_PROPOSE_PAIRING: rows,
          pairingForAe: only,
          hasExactlyOnePairing: (ae: string) => only(ae) !== null,
        };
      });
    }
    // The substituted registry is reachable only through `require` inside `isolateModules`.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('./gate7') as { gate7: typeof gate7 };
  });
  try {
    if (!loaded) throw new Error('the substituted Gate 7 did not load');
    return await work(loaded.gate7);
  } finally {
    jest.dontMock('../authority/ae-commit-allowlist.runtime');
    jest.dontMock('../booking/booking-allowlist');
    jest.dontMock('../authority/propose-pairing');
    jest.resetModules();
  }
};

const row = (
  ae: string,
  confirmationKind: AllowlistRow['confirmationKind'],
  confirmationOfKind: AllowlistRow['confirmationOfKind'],
): AllowlistRow => ({
  ae,
  proposeKey: 'c9.fixture.propose',
  confirmationKind,
  confirmationOfKind,
});

const pair = (propose: string, ae: string): ProposePairingRow => ({
  propose: { space: 'C9', key: propose },
  ae: { space: 'AE', key: ae },
});

// ── C1 — effect within the kind's declared ceiling, over `widget_kind` ──────────────────────────

describe('C1 — `effect` is within the kind’s declared ceiling, over `IntentRecord.widget_kind`', () => {
  it('G7-P4/P10/P12: an effect the kind’s cell lists passes — REFINE, DRAFT and a run-less REFINE', async () => {
    const cases: Partial<IntentRecordRow>[] = [
      {
        widgetKind: 'METRIC',
        effect: 'REFINE',
        ...C9('catalog.services.read'),
      },
      {
        widgetKind: 'SERVICE_SELECTOR',
        effect: 'DRAFT',
        ...C9('catalog.services.read'),
      },
      { widgetKind: 'METRIC', effect: 'REFINE', ...C9('c9.no_action') },
    ];
    for (const over of cases)
      expect((await gate7(ctx(record(over)), NEVER_ASKED.load)).outcome).toBe(
        'pass',
      );
  });

  it('G7-N1a: a DRAFT on METRIC — the cell is the fence, and METRIC’s does not list DRAFT', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'DRAFT',
          ...C9('catalog.services.read'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C1']);
  });

  it('G7-N1b: a REFINE on APPROVAL — MEMBERSHIP, not an ordered rank. APPROVAL’s cell is `NONE, NAVIGATE, CONTROL, COMMIT, HANDOFF`, so an ordered comparison would admit this and the contract does not', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'APPROVAL',
          effect: 'REFINE',
          ...C9('catalog.services.read'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C1']);
    // The control: the same off-order class IS admitted where the cell lists it.
    expect(
      (
        await gate7(
          ctx(
            record({
              widgetKind: 'APPROVAL',
              effect: 'NAVIGATE',
              ...target('w'),
            }),
          ),
          NEVER_ASKED.load,
        )
      ).outcome,
    ).toBe('pass');
  });

  it('G7-N1c: a HANDOFF on METRIC — METRIC’s cell has no HANDOFF, and HANDOFF is off-order', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'HANDOFF',
          ...handoff('C9', 'settings.read'),
          ...target('s'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C1']);
  });

  it('G7-N1d: a COMMIT on METRIC — K11’s four COMMIT-bearing kinds do not include it', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'COMMIT',
          ...AE('crm.appointment.create.v1'),
          confirmationOfKind: 'draft',
          confirmationOfRef: 'draft-1',
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C1']);
  });

  it('an unknown kind and an unknown effect both refuse: the lookup has no default branch', async () => {
    for (const over of [
      { widgetKind: 'NOT_A_KIND' },
      { effect: 'MUTATE' },
    ] as Partial<IntentRecordRow>[]) {
      const v = await gate7(ctx(record(over)), NEVER_ASKED.load);
      expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C1']);
    }
  });
});

// ── C2 / C3 — the key space matches the effect; CONTROL keys are in the control registry ────────

describe('C2 and C3 — the key space matches the effect (R3.2.2, F69), and the key resolves', () => {
  it('G7-P5/P6/P7/P8: each effect passes with the member and space F69 gives it', async () => {
    const cases: Partial<IntentRecordRow>[] = [
      // P5: a `w`-class NAVIGATE names nothing at all — F69's "otherwise nothing".
      { widgetKind: 'METRIC', effect: 'NAVIGATE', ...target('w') },
      // P6: a HANDOFF names its destination in the handoff member, never in `capability`.
      {
        widgetKind: 'LIMITATION',
        effect: 'HANDOFF',
        ...handoff('C9', 'settings.read'),
        ...target('s'),
      },
      // P7/P8: CONTROL names a CONTROL ref, and both registered keys pass — `control.run.cancel` is
      // a submitted intent (R3.2.6), not merely Gate 13's dispatch set.
      {
        widgetKind: 'METRIC',
        effect: 'CONTROL',
        ...CONTROL('control.widget.dismiss'),
      },
      {
        widgetKind: 'PROGRESS',
        effect: 'CONTROL',
        ...CONTROL('control.run.cancel'),
      },
    ];
    for (const over of cases)
      expect((await gate7(ctx(record(over)), NEVER_ASKED.load)).outcome).toBe(
        'pass',
      );
  });

  it('G7-N2a: a HANDOFF whose destination is CONTROL-spaced — R3.2.2 admits C9 and AE only', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'LIMITATION',
          effect: 'HANDOFF',
          ...handoff('CONTROL', 'control.widget.dismiss'),
          ...target('s'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
  });

  it('G7-N2b: a NAVIGATE carrying a `capability` — F69 gives NAVIGATE the class-`c` target and no other member', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'NAVIGATE',
          ...C9('catalog.services.read'),
          ...target('w'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
  });

  it('G7-N2c: a CONTROL carrying a C9 ref', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'CONTROL',
          ...C9('catalog.services.read'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
  });

  it('G7-N2d: a REFINE carrying an AE ref — the widget layer never bridges a key space (F70)', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'CHOICE',
          effect: 'REFINE',
          ...AE('crm.appointment.create.v1'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
  });

  it('G7-N2e: a COMMIT with a half-populated ref — F21 says a half pair is not a ref', async () => {
    for (const half of [
      { capabilitySpace: 'AE', capabilityKey: null },
      { capabilitySpace: null, capabilityKey: 'crm.appointment.create.v1' },
    ]) {
      const v = await gate7(
        ctx(
          record({
            widgetKind: 'BOOKING_CONFIRMATION',
            effect: 'COMMIT',
            ...half,
            confirmationOfKind: 'draft',
            confirmationOfRef: 'draft-1',
          }),
        ),
        NEVER_ASKED.load,
      );
      expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
    }
  });

  it('an effect that must name a capability and names none refuses; a `NONE` that names one refuses too', async () => {
    const refine = await gate7(
      ctx(record({ widgetKind: 'METRIC', effect: 'REFINE' })),
      NEVER_ASKED.load,
    );
    expect([code(refine), clause(refine)]).toEqual([
      'effect_not_admissible',
      'C2',
    ]);
    const none = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'NONE',
          ...C9('catalog.services.read'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(none), clause(none)]).toEqual(['effect_not_admissible', 'C2']);
  });

  it('no effect may name a TOOL ref (F69’s closing sentence), including one spelled like a C9 key', async () => {
    for (const effect of [
      'REFINE',
      'CONTROL',
      'COMMIT',
    ] as readonly EffectClass[]) {
      const v = await gate7(
        ctx(
          record({
            widgetKind: effect === 'COMMIT' ? 'BOOKING_CONFIRMATION' : 'METRIC',
            effect,
            capabilitySpace: 'TOOL',
            capabilityKey: 'catalog.services.read',
          }),
        ),
        NEVER_ASKED.load,
      );
      expect([effect, code(v), clause(v)]).toEqual([
        effect,
        'effect_not_admissible',
        'C2',
      ]);
    }
  });

  it('G7-N3a: an unregistered CONTROL key — F27 closes the space at three keys, and Gate 7 is the fence', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'CONTROL',
          ...CONTROL('control.bogus'),
          priority: 1,
        }),
      ),
      NEVER_ASKED.load,
    );
    // C3 rather than C2: the space is right, the membership is not.
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C3']);
  });

  it('an unregistered C9 key refuses at the same membership check, reported as C2', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'REFINE',
          ...C9('no.such.key'),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
  });

  it('a class-`c` target on an effect F69 does not give one refuses', async () => {
    const v = await gate7(
      ctx(
        record({
          widgetKind: 'METRIC',
          effect: 'REFINE',
          ...C9('catalog.services.read'),
          ...target('c', { space: 'C9', key: 'catalog.services.read' }),
        }),
      ),
      NEVER_ASKED.load,
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C2']);
  });
});

// ── C7 — the delivering tier was permitted to carry this effect ─────────────────────────────────

describe('C7 — the delivering tier was permitted to carry this effect (§3.12, CH1/CH2)', () => {
  const onChannel = (
    channel: string,
    over: Partial<IntentRecordRow>,
  ): Promise<GateVerdict> =>
    gate7(ctx(record({ deliveryChannel: channel, ...over })), NEVER_ASKED.load);

  it('G7-P5/P6/P12: each tier carries the classes its cell lists', async () => {
    expect(
      (
        await onChannel('web-push', {
          widgetKind: 'METRIC',
          effect: 'NAVIGATE',
          ...target('w'),
        })
      ).outcome,
    ).toBe('pass');
    expect(
      (
        await onChannel('sms', {
          widgetKind: 'LIMITATION',
          effect: 'HANDOFF',
          ...handoff('C9', 'settings.read'),
          ...target('s'),
        })
      ).outcome,
    ).toBe('pass');
    expect(
      (
        await onChannel('guest-chat', {
          widgetKind: 'METRIC',
          effect: 'REFINE',
          ...C9('c9.no_action'),
        })
      ).outcome,
    ).toBe('pass');
  });

  it('G7-A1a/A1b, P-ESC-TEXT, P-ESC-PUBLIC, P-ESC-ANNOUNCE: the one F60 escape is admitted on EVERY tier whose cell does not reach CONTROL — `ANNOUNCEMENT` included (CH1, AMB-11)', async () => {
    for (const channel of ['guest-chat', 'web-push', 'sms', 'web-public'])
      expect([
        channel,
        (
          await onChannel(channel, {
            widgetKind: 'METRIC',
            effect: 'CONTROL',
            ...CONTROL('control.widget.dismiss'),
            priority: 0,
          })
        ).outcome,
      ]).toEqual([channel, 'pass']);
  });

  it('G7-N-ESC-P1: the escape is that ONE intent — this key, at priority 0. Priority 1 is not it', async () => {
    const v = await onChannel('web-push', {
      widgetKind: 'METRIC',
      effect: 'CONTROL',
      ...CONTROL('control.widget.dismiss'),
      priority: 1,
    });
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C7']);
  });

  it('G7-A1c: another registered CONTROL key is not the escape, even at priority 0', async () => {
    const v = await onChannel('guest-chat', {
      widgetKind: 'METRIC',
      effect: 'CONTROL',
      ...CONTROL('control.delivery.resolve'),
      priority: 0,
    });
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C7']);
  });

  it('G7-N7a/N7b/N7c: a class the cell does not list is refused, whichever tier it is', async () => {
    const cases: [string, Partial<IntentRecordRow>][] = [
      [
        'web-push',
        { widgetKind: 'METRIC', effect: 'REFINE', ...C9('c9.no_action') },
      ],
      ['sms', { widgetKind: 'METRIC', effect: 'NAVIGATE', ...target('w') }],
      [
        'web-public',
        { widgetKind: 'METRIC', effect: 'REFINE', ...C9('c9.no_action') },
      ],
    ];
    for (const [channel, over] of cases) {
      const v = await onChannel(channel, over);
      expect([channel, code(v), clause(v)]).toEqual([
        channel,
        'effect_not_admissible',
        'C7',
      ]);
    }
  });

  it('G7-N7-GUEST-NAV: `ANONYMOUS_CHAT` carries REFINE and HANDOFF — an ALLOWLIST, so NAVIGATE is refused although a richer tier carries it', async () => {
    const v = await onChannel('guest-chat', {
      widgetKind: 'METRIC',
      effect: 'NAVIGATE',
      ...target('w'),
    });
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C7']);
  });

  it('G7-N-NONE-PUSH: `NONE` is carried by `RICH_INTERACTIVE` alone (R3.2.3)', async () => {
    expect(
      (await onChannel('pwa', { widgetKind: 'METRIC', effect: 'NONE' }))
        .outcome,
    ).toBe('pass');
    for (const channel of ['web-push', 'telegram-bot', 'guest-chat']) {
      const v = await onChannel(channel, {
        widgetKind: 'METRIC',
        effect: 'NONE',
      });
      expect([channel, code(v), clause(v)]).toEqual([
        channel,
        'effect_not_admissible',
        'C7',
      ]);
    }
  });

  it('G7-N7e: a channel outside `ChannelId`, and one that is a property of `Object.prototype`, admit nothing', async () => {
    for (const channel of ['', 'not-a-channel', 'constructor', '__proto__']) {
      const v = await onChannel(channel, {
        widgetKind: 'METRIC',
        effect: 'NAVIGATE',
        ...target('w'),
      });
      expect([channel, code(v), clause(v)]).toEqual([
        channel,
        'effect_not_admissible',
        'C7',
      ]);
    }
  });

  it('C7 is keyed on the RECORD’s delivery channel, not on `ctx.carrier`: the route hard-codes `pwa` and the refusal still fires', async () => {
    const r = record({
      widgetKind: 'METRIC',
      effect: 'REFINE',
      ...C9('c9.no_action'),
      deliveryChannel: 'web-push',
    });
    for (const carrier of ['pwa', 'web-push', 'sms'] as const) {
      const v = await gate7(ctx(r, { carrier }), NEVER_ASKED.load);
      expect([carrier, clause(v)]).toEqual([carrier, 'C7']);
    }
  });
});

// ── the COMMIT branch ───────────────────────────────────────────────────────────────────────────

const commitRecord = (over: Partial<IntentRecordRow> = {}): IntentRecordRow =>
  record({
    widgetKind: 'BOOKING_CONFIRMATION',
    effect: 'COMMIT',
    ...AE('crm.appointment.create.v1'),
    confirmationOfKind: 'draft',
    confirmationOfRef: 'draft-1',
    ...over,
  });

describe('the COMMIT branch — C9a → C6 → C8a → C4 → C5a → C5b → C8b → C6a → C11 → C9b', () => {
  it('G7-FC1: the canonical `create` COMMIT reaches C11 and stops there — BOOK.1’s own interim, “until `confirmation_subject` is stored, Gate 7 refuses every BOOKING_CONFIRMATION COMMIT”', async () => {
    const v = await gate7(ctx(commitRecord()), NEVER_ASKED.load);
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C11',
    ]);
    expect(detail(v)).toContain('no confirmation_subject');
    // Reaching C11 means C9a, C6, C8a, C4, C8b and C6a all ran: the branch is evaluated, not skipped.
  });

  it('G7-FC2: a `reschedule` COMMIT whose producing REFINE was consumed on the pairing’s propose key passes C5a and C5b, and stops at C11', async () => {
    const p = producing({
      'produced-1': {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'appointments.own.reschedule',
        consumedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    const v = await gate7(
      ctx(
        commitRecord({
          ...AE('crm.appointment.reschedule.v1'),
          confirmationOfKind: 'record',
          confirmationOfRef: 'appointment-1',
          producedByIntentTokenHash: 'produced-1',
        }),
      ),
      p.load,
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C11',
    ]);
    expect(p.asked).toEqual(['produced-1']);
  });

  /** A MONEY key on a substituted allowlist row of the named kind, run through Gate 7. */
  const moneyCommitOn = (kind: AllowlistRow['confirmationKind']) => {
    const money = 'loyalty.internal-adjust.execute.v1';
    return withSubstitutes({ allowlist: [row(money, kind, 'draft')] }, (g) =>
      g(
        ctx(commitRecord({ widgetKind: kind, ...AE(money) })),
        NEVER_ASKED.load,
      ),
    );
  };

  it('G7-N9a: C9a refuses a MONEY capability — FR-6d’s fence is that no money-mutating key is actuatable from a widget at all (fixture-only)', async () => {
    const v = await moneyCommitOn('BOOKING_CONFIRMATION');
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C9a']);
  });

  it('G7-N9b: C9a is FR-6d’s predicate, not F31’s VETO — the same MONEY key refuses on `PAYMENT_HANDOFF`, which F31 admits (F82 routes this very key there), so an F31-shaped C9a would pass it down to C9b (fixture-only)', async () => {
    const v = await moneyCommitOn('PAYMENT_HANDOFF');
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C9a']);
  });

  it('G7-N6a/N6b/N6c: C6 compares the LIVE allowlist row’s kind with `widget_kind` — the same key on three other COMMIT-bearing kinds refuses', async () => {
    for (const kind of ['SETTINGS_DRAFT', 'APPROVAL', 'PAYMENT_HANDOFF']) {
      const v = await gate7(
        ctx(commitRecord({ widgetKind: kind })),
        NEVER_ASKED.load,
      );
      expect([kind, code(v), clause(v)]).toEqual([
        kind,
        'booking_confirmation_required',
        'C6',
      ]);
      expect(detail(v)).toContain('requires BOOKING_CONFIRMATION');
    }
  });

  it('G7-N6d: C6 reads the table in the RUNNING process, not the state the record was minted under (fixture-only)', async () => {
    const v = await withSubstitutes(
      {
        allowlist: [
          row('crm.appointment.create.v1', 'SETTINGS_DRAFT', 'draft'),
        ],
      },
      (g) => g(ctx(commitRecord()), NEVER_ASKED.load),
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C6',
    ]);
  });

  it('G7-N6e: a key whose row was WITHDRAWN resolves to no confirmation kind at all — F72 has no default branch (fixture-only)', async () => {
    const v = await withSubstitutes({ allowlist: [] }, (g) =>
      g(ctx(commitRecord()), NEVER_ASKED.load),
    );
    // `capability_not_allowlisted` is a MINT code; at ingress it is `effect_not_admissible`.
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C6']);
    expect(detail(v)).toContain('capability_not_allowlisted');
  });

  it('G7-N8a: C8a — a BOOKING capability whose row is not `BOOKING_CONFIRMATION` refuses even when C6 agrees with the record (fixture-only)', async () => {
    const v = await withSubstitutes(
      {
        allowlist: [
          row('crm.appointment.create.v1', 'SETTINGS_DRAFT', 'draft'),
        ],
      },
      (g) =>
        g(
          ctx(commitRecord({ widgetKind: 'SETTINGS_DRAFT' })),
          NEVER_ASKED.load,
        ),
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C8a',
    ]);
  });

  it('G7-N4a/N4b/N4c: C4 — a non-null `confirmation_of_ref` of the kind the row assigns; a `reschedule` carrying `draft` is the bypass it exists to stop', async () => {
    const cases: [string, Partial<IntentRecordRow>][] = [
      ['N4a', { confirmationOfRef: null }],
      ['N4b', { confirmationOfKind: 'record' }],
      [
        'N4c',
        {
          ...AE('crm.appointment.reschedule.v1'),
          confirmationOfKind: 'draft',
          confirmationOfRef: 'appointment-1',
        },
      ],
    ];
    for (const [id, over] of cases) {
      const v = await gate7(ctx(commitRecord(over)), NEVER_ASKED.load);
      expect([id, code(v), clause(v)]).toEqual([
        id,
        'booking_confirmation_required',
        'C4',
      ]);
    }
  });

  it('G7-N5a/N5b/N5c/N5e/N5g: C5a — the producing record must be named, resolve in this tenant, be CONSUMED, and be of the effect class F74 fixes', async () => {
    const base: Partial<IntentRecordRow> = {
      ...AE('crm.appointment.reschedule.v1'),
      confirmationOfKind: 'record',
      confirmationOfRef: 'appointment-1',
      producedByIntentTokenHash: 'produced-1',
    };
    const consumed = new Date('2026-05-01T00:00:00.000Z');
    const cases: [
      string,
      Partial<IntentRecordRow>,
      ProducingRecordRow | null,
    ][] = [
      ['N5a (named nothing)', { producedByIntentTokenHash: null }, null],
      ['N5b (resolves to nothing)', {}, null],
      [
        'N5c (never consumed)',
        {},
        {
          effect: 'REFINE',
          capabilitySpace: 'C9',
          capabilityKey: 'appointments.own.reschedule',
          consumedAt: null,
        },
      ],
      [
        'N5e (a consumed NAVIGATE)',
        {},
        {
          effect: 'NAVIGATE',
          capabilitySpace: 'C9',
          capabilityKey: 'appointments.own.reschedule',
          consumedAt: consumed,
        },
      ],
      [
        'N5g (a consumed REQUEST_APPROVAL for a `record` confirmation)',
        {},
        {
          effect: 'REQUEST_APPROVAL',
          capabilitySpace: 'AE',
          capabilityKey: 'crm.appointment.reschedule.v1',
          consumedAt: consumed,
        },
      ],
    ];
    for (const [id, over, producingRow] of cases) {
      const p = producing(producingRow ? { 'produced-1': producingRow } : {});
      const v = await gate7(ctx(commitRecord({ ...base, ...over })), p.load);
      expect([id, code(v), clause(v)]).toEqual([
        id,
        'booking_confirmation_required',
        'C5a',
      ]);
    }
  });

  it('G7-N5f: the loader is tenant-scoped IN THE QUERY — a record that exists only in another tenant simply does not resolve', async () => {
    // The double answers for this tenant alone, which is what `findProducingRecord(hash, tenantId)`
    // does; a loader that filtered afterwards would have read the foreign row first.
    const p = producing({});
    const v = await gate7(
      ctx(
        commitRecord({
          ...AE('crm.appointment.cancel.v1'),
          confirmationOfKind: 'record',
          confirmationOfRef: 'appointment-1',
          producedByIntentTokenHash: 'in-another-tenant',
        }),
      ),
      p.load,
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C5a',
    ]);
    expect(p.asked).toEqual(['in-another-tenant']);
  });

  it('G7-N5h: C5b — the producing record’s C9 key must be the `propose` side of the COMMIT’s own pairing row, not merely some booking propose key', async () => {
    const p = producing({
      'produced-1': {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        // A real propose key of a real pairing row — but of the CANCEL row, not the reschedule one.
        capabilityKey: 'appointments.own.cancel',
        consumedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    const v = await gate7(
      ctx(
        commitRecord({
          ...AE('crm.appointment.reschedule.v1'),
          confirmationOfKind: 'record',
          confirmationOfRef: 'appointment-1',
          producedByIntentTokenHash: 'produced-1',
        }),
      ),
      p.load,
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C5b',
    ]);
  });

  it('G7-N5i: C5b’s `approval` identity is the COMMIT’s OWN AE key — a consumed REQUEST_APPROVAL on another key refuses (fixture-only)', async () => {
    const ae = 'package5.work-item.task-create.execute.v1';
    const p = producing({
      'produced-1': {
        effect: 'REQUEST_APPROVAL',
        capabilitySpace: 'AE',
        capabilityKey: 'package5.work-item.task-complete.execute.v1',
        consumedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    const v = await withSubstitutes(
      { allowlist: [row(ae, 'APPROVAL', 'approval')] },
      (g) =>
        g(
          ctx(
            commitRecord({
              widgetKind: 'APPROVAL',
              ...AE(ae),
              confirmationOfKind: 'approval',
              confirmationOfRef: 'approval-1',
              producedByIntentTokenHash: 'produced-1',
            }),
          ),
          p.load,
        ),
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C5b',
    ]);
  });

  it('G7-FC3: the same APPROVAL case with the producing REQUEST_APPROVAL on the COMMIT’s own AE key passes Gate 7 — the identity is evaluated, not a blanket refusal (fixture-only)', async () => {
    const ae = 'package5.work-item.task-create.execute.v1';
    const p = producing({
      'produced-1': {
        effect: 'REQUEST_APPROVAL',
        capabilitySpace: 'AE',
        capabilityKey: ae,
        consumedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    });
    const v = await withSubstitutes(
      { allowlist: [row(ae, 'APPROVAL', 'approval')] },
      (g) =>
        g(
          ctx(
            commitRecord({
              widgetKind: 'APPROVAL',
              ...AE(ae),
              confirmationOfKind: 'approval',
              confirmationOfRef: 'approval-1',
              producedByIntentTokenHash: 'produced-1',
            }),
          ),
          p.load,
        ),
    );
    expect(v.outcome).toBe('pass');
  });

  it('G7-C8b: a BOOKING key that is the `ae` side of NO single pairing row refuses at C8b (fixture-only pairing)', async () => {
    const v = await withSubstitutes({ pairing: [] }, (g) =>
      g(ctx(commitRecord()), NEVER_ASKED.load),
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C8b',
    ]);
  });

  it('G7-FC5: a `SETTINGS_DRAFT` COMMIT whose propose key is `consent_class: none` passes C6a — and Gate 7 (fixture-only)', async () => {
    const ae = 'package5.settings.assistant.execute.v1';
    const v = await withSubstitutes(
      { allowlist: [row(ae, 'SETTINGS_DRAFT', 'draft')] },
      (g) =>
        g(
          ctx(commitRecord({ widgetKind: 'SETTINGS_DRAFT', ...AE(ae) })),
          NEVER_ASKED.load,
        ),
    );
    expect(v.outcome).toBe('pass');
  });

  it('G7-N6g: F80 — the same COMMIT whose pairing’s propose key is `personal_data` refuses at C6a (fixture-only)', async () => {
    const ae = 'package5.settings.assistant.execute.v1';
    const v = await withSubstitutes(
      {
        allowlist: [row(ae, 'SETTINGS_DRAFT', 'draft')],
        pairing: [pair('appointments.own.create', ae)],
      },
      (g) =>
        g(
          ctx(commitRecord({ widgetKind: 'SETTINGS_DRAFT', ...AE(ae) })),
          NEVER_ASKED.load,
        ),
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C6a']);
    expect(detail(v)).toContain('personal_data');
  });

  it('G7-N6g-2: a `SETTINGS_DRAFT` COMMIT with no single pairing row refuses at C6a too — the propose key is what F80 reads (fixture-only)', async () => {
    const ae = 'package5.settings.assistant.execute.v1';
    const v = await withSubstitutes(
      { allowlist: [row(ae, 'SETTINGS_DRAFT', 'draft')], pairing: [] },
      (g) =>
        g(
          ctx(commitRecord({ widgetKind: 'SETTINGS_DRAFT', ...AE(ae) })),
          NEVER_ASKED.load,
        ),
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C6a']);
  });

  it('G7-FC4: C9b — `PAYMENT_HANDOFF` is gap-blocked, and the block is READ from K20’s derived `emittable`, not hard-coded (fixture-only)', async () => {
    const ae = 'package5.work-item.task-create.execute.v1';
    const v = await withSubstitutes(
      { allowlist: [row(ae, 'PAYMENT_HANDOFF', 'draft')] },
      (g) =>
        g(
          ctx(commitRecord({ widgetKind: 'PAYMENT_HANDOFF', ...AE(ae) })),
          NEVER_ASKED.load,
        ),
    );
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C9b']);
  });

  it('G7-N-C11-NULL: C11 is a HELD LANE — a stored `confirmation_subject` does not lift it either, because the comparison is U7c’s', async () => {
    const withMember = {
      ...commitRecord(),
      confirmationSubject: 'create',
    } as unknown as IntentRecordRow;
    const v = await gate7(ctx(withMember), NEVER_ASKED.load);
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C11',
    ]);
    expect(detail(v)).toContain('pending U7c');
  });

  it('T7-ONE-READ: the producing-record loader is asked ONLY for a non-draft COMMIT — every other refusal keeps the pipeline at one store read', async () => {
    const p = producing({});
    for (const r of [
      record({ widgetKind: 'METRIC', effect: 'NONE' }),
      record({
        widgetKind: 'METRIC',
        effect: 'REFINE',
        ...C9('catalog.services.read'),
      }),
      record({
        widgetKind: 'METRIC',
        effect: 'DRAFT',
        ...C9('catalog.services.read'),
      }),
      commitRecord(),
      commitRecord({ widgetKind: 'SETTINGS_DRAFT' }),
    ])
      await gate7(ctx(r), p.load);
    expect(p.asked).toEqual([]);
  });

  it('T7-UNWIRED: the INTERIM default loader is fail-closed: with no loader wired, a non-draft COMMIT refuses at C5a rather than passing', async () => {
    const v = await gate7(
      ctx(
        commitRecord({
          ...AE('crm.appointment.cancel.v1'),
          confirmationOfKind: 'record',
          confirmationOfRef: 'appointment-1',
          producedByIntentTokenHash: 'produced-1',
        }),
      ),
    );
    expect([code(v), clause(v)]).toEqual([
      'booking_confirmation_required',
      'C5a',
    ]);
  });
});

// ── I18 and I21 — the two properties the pipeline needs Gate 7 to keep ──────────────────────────

describe('I18 and I21 — no client value is an antecedent, and no role is read', () => {
  it('G7-N11: the verdict is byte-identical however the submission is dressed', async () => {
    const r = record({
      widgetKind: 'METRIC',
      effect: 'DRAFT',
      ...C9('catalog.services.read'),
    });
    const plain = await gate7(ctx(r), NEVER_ASKED.load);
    const dressed = await gate7(
      ctx(r, {
        submission: {
          intent_token: 'tok',
          inputs: {
            widget_kind: 'BOOKING_CONFIRMATION',
            delivery_channel: 'pwa',
            effect: 'NAVIGATE',
            priority: 0,
          },
        },
      }),
      NEVER_ASKED.load,
    );
    expect(JSON.stringify(dressed)).toBe(JSON.stringify(plain));
  });

  it('G7-N12: the verdict is byte-identical across every actor role, and across every verification level', async () => {
    const r = record({
      widgetKind: 'METRIC',
      effect: 'REFINE',
      ...C9('c9.no_action'),
      deliveryChannel: 'web-push',
    });
    const base = JSON.stringify(await gate7(ctx(r), NEVER_ASKED.load));
    for (const role of [
      'tenant_owner',
      'administrator',
      'accountant',
      'staff',
      'client',
    ]) {
      const c = ctx(r);
      const v = await gate7(
        { ...c, actor: { ...c.actor, role: role as (typeof c.actor)['role'] } },
        NEVER_ASKED.load,
      );
      expect([role, JSON.stringify(v)]).toEqual([role, base]);
    }
    for (const level of [
      'ANONYMOUS',
      'CHANNEL_IDENTITY',
      'BOUND_CLIENT',
      'SESSION_VERIFIED',
      'STEP_UP_VERIFIED',
    ] as const)
      expect([
        level,
        JSON.stringify(
          await gate7(ctx(r, { verificationLevel: level }), NEVER_ASKED.load),
        ),
      ]).toEqual([level, base]);
  });

  it('no record at all refuses, and reports C1', async () => {
    const c = ctx(record({}));
    const v = await gate7({ ...c, record: null }, NEVER_ASKED.load);
    expect([code(v), clause(v)]).toEqual(['effect_not_admissible', 'C1']);
  });
});
