// Gate 11, as a function. GATES-PLAN-V11 U11a — exits G11-N9 and G11-N10, class [U].
//
// AREA-C §2.1.4 names G11-N9 and G11-N10 as this unit's two [U] exits without spelling them; they are
// stated here as the two things the card's scope makes decidable at function level, and the report
// records the reading:
//
//   G11-N9   THE APPLICABILITY TABLE. Six rows, total, no default, and each row answers as ruled —
//            including row W refusing `superseded/handle_stale` with ZERO owner calls while the
//            witness lane is unbound (AMB-01a), and rows A0/N0 throwing rather than refusing (D-11).
//   G11-N10  WHAT THE GATE DECIDES, AND WHAT IT DOES NOT. A divergence is `superseded` and never
//            `refuse`; B-18's three owner codes are the only ones that reach `handle_stale`; a policy
//            fence passes through; a transport error is a FAULT and is not swallowed; the gate holds
//            no reader of its own and cannot reach `bodyHash` at all.
//
// A UNIT TEST IS NOT LIVE PROOF (§0.5). Nothing here flips a clause: slot 11 is unreachable on the
// live path until Gates 8, 9 and 10 stop refusing, and the live file is
// `test/widgets-live/gate11-nouns.live-spec.ts`.

import type { GateVerdict } from '../gate.types';
import {
  asHandle,
  asWitness,
  type Handle,
  type Witness,
} from '../noun-resolution/noun-handles';
import {
  APPLICABILITY_ROWS,
  applicabilityRow,
  gate11ApplicabilityOf,
  nounActor,
  nounResolverInput,
  nounRow,
  type ApplicabilityRow,
  type Gate11Applicability,
  type NounActor,
  type NounResolverInput,
} from '../noun-resolution/noun-resolution';
import {
  NOUN_RESOLUTION_PORTS_UNBOUND,
  type NounReadResult,
  type NounResolutionPorts,
} from '../noun-resolution/noun-resolution.ports';
import { gate11 } from './gate11';
import { ctx, guardRegistries, rec } from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

const ACTOR: NounActor = Object.freeze({ tenantId: 't1', userId: 'u1' });
const RUN = asHandle('11111111-1111-4111-8111-111111111111');
const FROZEN = asWitness('22222222-2222-4222-8222-222222222222');
const MOVED = asWitness('33333333-3333-4333-8333-333333333333');
const EFFECTS = [
  'NONE',
  'NAVIGATE',
  'REFINE',
  'CONTROL',
  'DRAFT',
  'REQUEST_APPROVAL',
  'COMMIT',
  'HANDOFF',
];

const input = (over: Partial<NounResolverInput> = {}): NounResolverInput => ({
  capability: { space: 'C9', key: 'catalog.services.read' },
  frozenNouns: new Map<string, Handle>(),
  requestedScopeHash: 'e'.repeat(64),
  principalProofHash: 'a'.repeat(64),
  tenantId: 't1',
  confirmationOfRef: null,
  producedByIntentTokenHash: null,
  ...over,
});

const withNouns = (...nouns: string[]): NounResolverInput =>
  input({ frozenNouns: new Map(nouns.map((n) => [n, asHandle(`h_${n}`)])) });

const applies = (
  over: Partial<Gate11Applicability> = {},
): Gate11Applicability => ({ effect: 'NAVIGATE', witness: null, ...over });

/** A recording port pair. A lane is UNBOUND when its option is left out. */
const portSpy = (options: {
  read?: NounReadResult | (() => Promise<NounReadResult>);
  revision?: Witness | null | (() => Promise<Witness | null>);
}) => {
  const readCalls: Array<{ input: NounResolverInput; actor: NounActor }> = [];
  const witnessCalls: Array<{ run: Handle; actor: NounActor }> = [];
  const read = options.read;
  const revision = options.revision;
  const ports: NounResolutionPorts = {
    nouns:
      read === undefined
        ? null
        : {
            read: (i, a) => {
              readCalls.push({ input: i, actor: a });
              return typeof read === 'function'
                ? read()
                : Promise.resolve(read);
            },
          },
    witness:
      revision === undefined
        ? null
        : {
            currentRevision: (run, a) => {
              witnessCalls.push({ run, actor: a });
              return typeof revision === 'function'
                ? revision()
                : Promise.resolve(revision);
            },
          },
  };
  return { ports, readCalls, witnessCalls };
};

const answer = (v: GateVerdict) => ({
  outcome: v.outcome,
  code: 'code' in v ? v.code : null,
});

const fact = (v: GateVerdict) => {
  if (v.outcome !== 'pass' || v.facts?.resolvedNouns === undefined)
    throw new Error(`the verdict carries no resolvedNouns fact: ${v.outcome}`);
  return v.facts.resolvedNouns;
};

// ── G11-N9 ───────────────────────────────────────────────────────────────────────────────────────

describe('G11-N9 [U] — the applicability table is six rows, total, and each answers as ruled', () => {
  it('G11-N9-a: the table is exactly W, A1, N1, A0, N0, P, and every combination lands on one of them', () => {
    expect([...APPLICABILITY_ROWS]).toEqual(['W', 'A1', 'N1', 'A0', 'N0', 'P']);
    const bound = portSpy({
      read: { kind: 'resolved', values: new Map() },
    }).ports;
    const seen = new Set<ApplicabilityRow>();
    for (const effect of EFFECTS)
      for (const nouns of [[], ['appointment']])
        for (const witness of [null, { run: RUN, revision: FROZEN }])
          for (const ports of [null, bound]) {
            const row = applicabilityRow(
              withNouns(...nouns),
              applies({ effect, witness }),
              ports,
            );
            expect(APPLICABILITY_ROWS).toContain(row);
            seen.add(row);
          }
    // Not vacuous: the sweep reaches every row, so "total" is a claim about six live branches.
    expect([...seen].sort()).toEqual(['A0', 'A1', 'N0', 'N1', 'P', 'W']);
  });

  it('G11-N9-b: row W wins over the noun rows — a stale world is stale whatever the nouns say', () => {
    const bound = portSpy({
      read: { kind: 'resolved', values: new Map() },
      revision: FROZEN,
    }).ports;
    const witnessed = applies({
      effect: 'COMMIT',
      witness: { run: RUN, revision: FROZEN },
    });
    expect(applicabilityRow(withNouns('appointment'), witnessed, bound)).toBe(
      'W',
    );
    // `nounRow` is the same table with the witness lane already decided, and never answers 'W'.
    expect(nounRow(withNouns('appointment'), witnessed, bound)).toBe('A1');
  });

  it('G11-N9-c: ROW W, witness lane UNBOUND → superseded/handle_stale with ZERO owner calls (AMB-01a)', async () => {
    const spy = portSpy({ read: { kind: 'resolved', values: new Map() } });
    const v = await gate11(
      withNouns('appointment'),
      applies({ effect: 'COMMIT', witness: { run: RUN, revision: FROZEN } }),
      ACTOR,
      spy.ports,
    );
    expect(answer(v)).toEqual({ outcome: 'superseded', code: 'handle_stale' });
    // The whole point of the lane: it refuses BEFORE any owner is asked anything.
    expect({
      reads: spy.readCalls.length,
      witness: spy.witnessCalls.length,
    }).toEqual({ reads: 0, witness: 0 });
  });

  it('G11-N9-d: ROW W with no ports at all, and a revision whose run is missing, take the same branch', async () => {
    const noPorts = await gate11(
      input(),
      applies({ witness: { run: RUN, revision: FROZEN } }),
      ACTOR,
      null,
    );
    expect(answer(noPorts)).toEqual({
      outcome: 'superseded',
      code: 'handle_stale',
    });
    const spy = portSpy({ revision: FROZEN });
    const noRun = await gate11(
      input(),
      applies({ witness: { run: null, revision: FROZEN } }),
      ACTOR,
      spy.ports,
    );
    expect(answer(noRun)).toEqual({
      outcome: 'superseded',
      code: 'handle_stale',
    });
    expect(spy.witnessCalls).toEqual([]);
  });

  it('G11-N9-e: ROW W bound — the RUN’s handle is what is read, and the frozen witness is only compared', async () => {
    const spy = portSpy({ revision: FROZEN });
    const v = await gate11(
      input(),
      applies({ witness: { run: RUN, revision: FROZEN } }),
      ACTOR,
      spy.ports,
    );
    // The witness agreed and nothing else was owed, so the gate falls through to row P and passes.
    expect(answer(v)).toEqual({ outcome: 'pass', code: null });
    expect(fact(v).row).toBe('P');
    expect(spy.witnessCalls).toEqual([{ run: RUN, actor: ACTOR }]);
  });

  it('G11-N9-f: ROW W — a moved revision, and an owner with no current revision, both supersede', async () => {
    const witnessed = applies({ witness: { run: RUN, revision: FROZEN } });
    expect(
      answer(
        await gate11(
          input(),
          witnessed,
          ACTOR,
          portSpy({ revision: MOVED }).ports,
        ),
      ),
    ).toEqual({ outcome: 'superseded', code: 'handle_stale' });
    // `null` is a DIVERGENCE, not a match: "cannot be compared" and "compared equal" are never the
    // same branch (F5, fail closed).
    expect(
      answer(
        await gate11(
          input(),
          witnessed,
          ACTOR,
          portSpy({ revision: null }).ports,
        ),
      ),
    ).toEqual({ outcome: 'superseded', code: 'handle_stale' });
  });

  it('G11-N9-g: ROW W — a witness that diverges stops the pipeline before the noun read', async () => {
    const spy = portSpy({
      read: { kind: 'resolved', values: new Map() },
      revision: MOVED,
    });
    await gate11(
      withNouns('appointment'),
      applies({ effect: 'COMMIT', witness: { run: RUN, revision: FROZEN } }),
      ACTOR,
      spy.ports,
    );
    expect(spy.readCalls).toEqual([]);
  });

  it('G11-N9-h: ROWS A1 and N1 — exactly one fresh read, with F15’s seven and the actor', async () => {
    for (const [row, effect, nouns] of [
      ['A1', 'COMMIT', [] as string[]],
      ['N1', 'NAVIGATE', ['appointment']],
    ] as const) {
      const spy = portSpy({
        read: { kind: 'resolved', values: new Map([['appointment', 'x']]) },
      });
      const i = withNouns(...nouns);
      const v = await gate11(i, applies({ effect }), ACTOR, spy.ports);
      expect({ row, outcome: v.outcome }).toEqual({ row, outcome: 'pass' });
      expect({ row, calls: spy.readCalls.length }).toEqual({ row, calls: 1 });
      expect(spy.readCalls[0]).toEqual({ input: i, actor: ACTOR });
      expect(fact(v).row).toBe(row);
    }
  });

  it('G11-N9-i: ROWS A0 and N0 throw — a missing owner is a construction defect, never drift (D-11)', async () => {
    await expect(
      gate11(input(), applies({ effect: 'COMMIT' }), ACTOR, null),
    ).rejects.toThrow(/slot 11 owes a fresh read on row A0/);
    await expect(
      gate11(withNouns('appointment'), applies({ effect: 'NAVIGATE' }), ACTOR, {
        nouns: null,
        witness: null,
      }),
    ).rejects.toThrow(/slot 11 owes a fresh read on row N0/);
  });

  it('G11-N9-j: ROW P — nothing owed: a pass, an EMPTY fact, and no owner call', async () => {
    const spy = portSpy({
      read: { kind: 'resolved', values: new Map([['appointment', 'x']]) },
      revision: FROZEN,
    });
    const v = await gate11(input(), applies(), ACTOR, spy.ports);
    expect(answer(v)).toEqual({ outcome: 'pass', code: null });
    expect(fact(v)).toEqual({
      row: 'P',
      diverged: false,
      diff: [],
      values: new Map(),
    });
    expect({
      reads: spy.readCalls.length,
      witness: spy.witnessCalls.length,
    }).toEqual({ reads: 0, witness: 0 });
  });

  it('G11-N9-k: only the three effects D-4 blocks make a NOUN-LESS record owe a read, and the set is Gate 11’s own', () => {
    const bound = portSpy({
      read: { kind: 'resolved', values: new Map() },
    }).ports;
    // CKPT-W1 review fix. This pinned `REFINE: 'A1', CONTROL: 'A1'` and read the legacy five-member
    // `ACTUATING` out of `gates/effect-sets.ts`. Row 11's antecedent is "each frozen noun is resolved
    // by a fresh read from its canonical owner" (C11:4731) — a record that froze NO noun owes no read
    // — and the only ground the wider reading had was the claim, written into `noun-resolution.ts`,
    // that rows A0/N0 are unreachable before P-01's discharge. D-4 and AREA-C F-3 block exactly
    // `DRAFT`, `REQUEST_APPROVAL` and `COMMIT`; `REFINE` and `CONTROL` are mintable this cycle and
    // are the plan's own non-actuating evidence backbone (§0.3 "10.R2 … is L via CONTROL records";
    // §3.2 Gate 11 reads SCHED.2 REFINE nouns). The claim was false for those two, so the set is
    // narrowed to the three the justification actually covers, and stated in Gate 11's own file.
    expect(
      Object.fromEntries(
        EFFECTS.map((effect) => [
          effect,
          nounRow(input(), applies({ effect }), bound),
        ]),
      ),
    ).toEqual({
      NONE: 'P',
      NAVIGATE: 'P',
      HANDOFF: 'P',
      REFINE: 'P',
      CONTROL: 'P',
      DRAFT: 'A1',
      REQUEST_APPROVAL: 'A1',
      COMMIT: 'A1',
    });
  });

  it('G11-N9-l: a CONTROL or REFINE record with no frozen noun and NO port bound is row P — a pass with zero owner calls, never A0', async () => {
    // CKPT-W1 review fix, the reachable half of G11-N9-k. `control.widget.dismiss` carries no runId,
    // no revisionId and no frozen noun, and a noun-less `REFINE` is equally ordinary. Slots 9 and 10
    // are refusing stubs today, so neither reaches slot 11 yet; U9b (W2) and U10b (W3) open them
    // while U11b — which BINDS these ports — is W4. Under the five-member set both took row A0 with
    // `NOUN_RESOLUTION_PORTS_UNBOUND`, and A0 THROWS: an HTTP 500 raised after `T` had already
    // committed Gate 9's durable USER turn. A widget layer may refuse; it may not fault (R3.9.3,
    // C11:4902-4903: "only a genuine transport fault may look like a fault"). This is the ratchet.
    for (const effect of ['CONTROL', 'REFINE'] as const) {
      const spy = portSpy({});
      expect(nounRow(input(), applies({ effect }), spy.ports)).toBe('P');
      expect(
        applicabilityRow(
          input(),
          applies({ effect }),
          NOUN_RESOLUTION_PORTS_UNBOUND,
        ),
      ).toBe('P');
      const verdict = await gate11(
        input(),
        applies({ effect }),
        ACTOR,
        NOUN_RESOLUTION_PORTS_UNBOUND,
      );
      expect(answer(verdict)).toEqual({ outcome: 'pass', code: null });
      expect({
        reads: spy.readCalls.length,
        witness: spy.witnessCalls.length,
      }).toEqual({ reads: 0, witness: 0 });
    }
  });
});

// ── G11-N10 ──────────────────────────────────────────────────────────────────────────────────────

describe('G11-N10 [U] — what Gate 11 decides, and what it refuses to decide', () => {
  it('G11-N10-a: a value divergence is SUPERSEDED, never `refuse` (row 11, C11:4731)', async () => {
    const spy = portSpy({
      read: {
        kind: 'diverged',
        diff: [
          { noun: 'start', frozen: 'h_start', fresh: '2026-09-18T10:00Z' },
        ],
      },
    });
    const v = await gate11(
      withNouns('start'),
      applies({ effect: 'COMMIT' }),
      ACTOR,
      spy.ports,
    );
    expect(answer(v)).toEqual({ outcome: 'superseded', code: 'handle_stale' });
    // The body this file replaced returned `refuse`. That is the regression this line holds.
    expect(v.outcome).not.toBe('refuse');
  });

  it('G11-N10-b: B-18’s three owner codes are the only ones that reach `handle_stale`', async () => {
    for (const reason of [
      'not_found',
      'already_cancelled',
      'slot_taken',
    ] as const) {
      const spy = portSpy({ read: { kind: 'gone', reason } });
      const v = await gate11(
        withNouns('appointment'),
        applies({ effect: 'COMMIT' }),
        ACTOR,
        spy.ports,
      );
      expect({ reason, ...answer(v) }).toEqual({
        reason,
        outcome: 'superseded',
        code: 'handle_stale',
      });
    }
  });

  it('G11-N10-c: a policy fence PASSES THROUGH to Gates 13/14 (B-18); Gate 11 is not a second Gate 6', async () => {
    const spy = portSpy({ read: { kind: 'policy_deferred' } });
    const v = await gate11(
      withNouns('appointment'),
      applies({ effect: 'COMMIT' }),
      ACTOR,
      spy.ports,
    );
    expect(answer(v)).toEqual({ outcome: 'pass', code: null });
    expect(fact(v).diverged).toBe(false);
    expect(fact(v).diff).toEqual([]);
  });

  it('G11-N10-d: a TRANSPORT error is a fault — it is not swallowed into `handle_stale` (R3.9.3)', async () => {
    const boom = new Error('ECONNRESET talking to the booking owner');
    await expect(
      gate11(
        withNouns('appointment'),
        applies({ effect: 'COMMIT' }),
        ACTOR,
        portSpy({ read: () => Promise.reject(boom) }).ports,
      ),
    ).rejects.toThrow(boom);
    await expect(
      gate11(
        input(),
        applies({ witness: { run: RUN, revision: FROZEN } }),
        ACTOR,
        portSpy({ revision: () => Promise.reject(boom) }).ports,
      ),
    ).rejects.toThrow(boom);
  });

  it('G11-N10-e: the resolved fact carries the OWNER’s values, and the gate adds none of its own', async () => {
    const values = new Map([
      ['appointment', 'appt-1'],
      ['start', '2026-09-18T10:00Z'],
    ]);
    const spy = portSpy({ read: { kind: 'resolved', values } });
    const v = await gate11(
      withNouns('appointment', 'start'),
      applies({ effect: 'COMMIT' }),
      ACTOR,
      spy.ports,
    );
    expect(fact(v)).toEqual({ row: 'A1', diverged: false, diff: [], values });
  });

  it('G11-N10-f: no `detail` of any branch carries a handle or an owner value (R3.7.3)', async () => {
    const leaky = 'h_appointment';
    const branches: GateVerdict[] = [
      await gate11(
        withNouns('appointment'),
        applies({ effect: 'COMMIT', witness: { run: RUN, revision: FROZEN } }),
        ACTOR,
        portSpy({ read: { kind: 'resolved', values: new Map() } }).ports,
      ),
      await gate11(
        withNouns('appointment'),
        applies({ effect: 'COMMIT' }),
        ACTOR,
        portSpy({
          read: {
            kind: 'diverged',
            diff: [{ noun: 'appointment', frozen: leaky, fresh: 'appt-2' }],
          },
        }).ports,
      ),
      await gate11(
        withNouns('appointment'),
        applies({ effect: 'COMMIT' }),
        ACTOR,
        portSpy({ read: { kind: 'gone', reason: 'not_found' } }).ports,
      ),
    ];
    for (const v of branches) {
      const detail = 'detail' in v ? (v.detail ?? '') : '';
      expect({ detail, leaks: detail.includes(leaky) }).toEqual({
        detail,
        leaks: false,
      });
      expect(detail.includes('appt-2')).toBe(false);
    }
  });

  it('G11-N10-g: the gate holds NO reader of its own — with the ports removed, no branch invents one', async () => {
    // The replaced body's `if (!fresh) return pass` is the shape this asserts against: an unbound lane
    // is never a pass. Row P is the one lane that passes without an owner, and it passes because
    // NOTHING WAS OWED — which the fact says out loud.
    const unbound: NounResolutionPorts = { nouns: null, witness: null };
    expect(fact(await gate11(input(), applies(), ACTOR, unbound)).row).toBe(
      'P',
    );
    expect(
      answer(
        await gate11(
          input(),
          applies({ witness: { run: RUN, revision: FROZEN } }),
          ACTOR,
          unbound,
        ),
      ),
    ).toEqual({ outcome: 'superseded', code: 'handle_stale' });
    await expect(
      gate11(withNouns('a'), applies({ effect: 'COMMIT' }), ACTOR, unbound),
    ).rejects.toThrow(/no noun port is bound/);
  });

  it('G11-N10-h: `bodyHash` is not read by Gate 11 — it is not reachable from its inputs at all', () => {
    // F15's seven have no `bodyHash` member, so the comparison the old body made cannot be written
    // here without adding a field, which G11-N15 fails the build over.
    expect(Object.keys(input()).sort()).toEqual([
      'capability',
      'confirmationOfRef',
      'frozenNouns',
      'principalProofHash',
      'producedByIntentTokenHash',
      'requestedScopeHash',
      'tenantId',
    ]);
    expect(Object.keys(input())).not.toContain('bodyHash');
  });
});

// ── the projection the integrator's slot-11 adapter calls (IR-11a-1) ─────────────────────────────

describe('G11-N10-P [U] — the slot-11 projection, and the INTERIM context overload', () => {
  it('projects exactly F15’s seven from the record, and the two legal extras beside them', () => {
    const r = rec({
      capabilitySpace: 'C9',
      capabilityKey: 'booking.create',
      frozenNounsJson: { appointment: 'h_appt', start: 'h_start' },
      confirmationOfKind: 'record',
      confirmationOfRef: 'r-1',
      producedByIntentTokenHash: 'f'.repeat(64),
      effect: 'COMMIT',
      runId: '11111111-1111-4111-8111-111111111111',
      revisionId: '22222222-2222-4222-8222-222222222222',
    });
    const i = nounResolverInput(r);
    expect(Object.keys(i).sort()).toEqual([
      'capability',
      'confirmationOfRef',
      'frozenNouns',
      'principalProofHash',
      'producedByIntentTokenHash',
      'requestedScopeHash',
      'tenantId',
    ]);
    expect(i.capability).toEqual({ space: 'C9', key: 'booking.create' });
    expect([...i.frozenNouns.keys()].sort()).toEqual(['appointment', 'start']);
    expect(i.confirmationOfRef).toEqual({ kind: 'record', ref: 'r-1' });
    const a = gate11ApplicabilityOf(r);
    expect(Object.keys(a).sort()).toEqual(['effect', 'witness']);
    expect(a.effect).toBe('COMMIT');
    expect(a.witness?.revision).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('a malformed `frozen_nouns` column projects to NO noun rather than to a guessed one', () => {
    for (const column of [
      null,
      42,
      'h_appt',
      ['h_appt'],
      { appointment: 7 },
      { appointment: '' },
    ])
      expect(
        nounResolverInput(rec({ frozenNounsJson: column })).frozenNouns.size,
      ).toBe(0);
  });

  it('a record with no witness has none, and `runId` alone is not one', () => {
    expect(gate11ApplicabilityOf(rec()).witness).toBeNull();
    expect(
      gate11ApplicabilityOf(
        rec({ runId: '11111111-1111-4111-8111-111111111111' }),
      ).witness,
    ).toBeNull();
    // A revision with no run is malformed; it is carried so the witness lane can refuse it.
    expect(
      gate11ApplicabilityOf(
        rec({ revisionId: '22222222-2222-4222-8222-222222222222' }),
      ).witness?.run,
    ).toBeNull();
  });

  it('the actor is narrowed to the two members an owner reads as — no role, no session, no email', () => {
    expect(Object.keys(nounActor(ctx(rec()).actor)).sort()).toEqual([
      'tenantId',
      'userId',
    ]);
  });

  it('a null record at slot 11 THROWS: Gate 1 refuses first, so it is a construction defect (J-1)', () => {
    expect(() => nounResolverInput(null)).toThrow(/slot 11 ran with no record/);
    expect(() => gate11ApplicabilityOf(null)).toThrow(
      /slot 11 ran with no record/,
    );
  });

  it('INTERIM: the context overload is the same gate — same views, and no port bound', async () => {
    const r = rec({ effect: 'NAVIGATE' });
    const viaContext = await gate11(ctx(r));
    const viaViews = await gate11(
      nounResolverInput(r),
      gate11ApplicabilityOf(r),
      nounActor(ctx(r).actor),
      null,
    );
    expect(answer(viaContext)).toEqual(answer(viaViews));
    expect(fact(viaContext)).toEqual(fact(viaViews));
    // And, because it binds no port, a record that owes a witness comparison refuses through it too.
    expect(
      answer(
        await gate11(
          ctx(rec({ revisionId: '22222222-2222-4222-8222-222222222222' })),
        ),
      ),
    ).toEqual({ outcome: 'superseded', code: 'handle_stale' });
  });
});
