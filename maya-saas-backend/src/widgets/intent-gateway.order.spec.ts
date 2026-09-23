// T17 (G8-R I11) and B-1 (G10 §9.4): the pipeline's order, asserted in full, on the running service.
//
// §3.9 fixes one order, and k3 checks 2 and 3 read it from the source text. This reads the service
// itself (U0 item 9):
//   - the array's `n` sequence is exactly 1, 2, 3, 4, 5, 6, 7, 8, 8-R, 9, 10, 11, 12, 13, 14. The same
//     sequence, and each slot's host, is read from the `#` and "Runs in" columns of the contract's §3.9
//     table (`docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md`), so the literal below is not a copy that could
//     drift from the contract unseen;
//   - the runner calls the slots in that order, each once, and a slot runs only after every earlier
//     slot passed. For each position, a non-pass verdict there stops the pipeline at that slot, `ran`
//     equals its position, and no later slot is called. That is G10 T-3's `ran === 11`, for every slot.
// G8-R I11 found only the count asserted. `intent-gateway.spec.ts` has since pinned the array's `n`
// list; this is the order test the plan names (U0 item 9), and it adds what a list alone cannot see:
// the contract's own table, and the order in which the runner actually calls the slots.
//
// B-1's second half, "only Gate 9 may return the lowering", is D-1's producer map. `mergeFacts` checks
// it at run time, and T-ARCH-FACTS checks it at the source (`gates/facts.architecture.spec.ts`).
//
// The named mutants are run below, over the real array with its slots re-ordered:
//   - M14 (G8-R): 8-R moved after 9;
//   - M-8 (G10): 10 moved after 11, or before 9;
//   - a slot dropped, duplicated, re-spelled or re-hosted.
//
// Class BUILD / U: the real array, with each slot's `run` replaced by a recorder. Not live proof.

import fs from 'node:fs';
import path from 'node:path';

import { Logger } from '@nestjs/common';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import type { Gate, GateVerdict, PrincipalView } from './gate.types';
import { IntentGatewayService } from './intent-gateway.service';

/** §3.9's order, as G8-R T17 and G10 B-1 state it. */
const SECTION_3_9: readonly string[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '8-R',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
];

const CONTRACT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'rebuild',
  'MAYA-WIDGET-CONTRACT-V1.md',
);

const cells = (line: string): string[] =>
  line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());

/** §3.9's gate table: each row's `#` and the first host its "Runs in" names. */
const contractTable = (): { n: string; host: string }[] => {
  const text = fs.readFileSync(CONTRACT, 'utf8');
  const section = text.indexOf('\n### 3.9 ');
  if (section < 0) throw new Error('the contract has no §3.9');
  const lines = text.slice(section).split('\n');
  const at = lines.findIndex((l) => /^\|\s*#\s*\|\s*Gate\s*\|/.test(l));
  if (at < 0) throw new Error('§3.9 has no gate table');
  const header = cells(lines[at]);
  // Counted from the right: a cell's own text may not contain a column separator, but the closing
  // columns ("Runs in", "Status") are the table's last two.
  const fromEnd = header.length - header.indexOf('Runs in');
  const rows: { n: string; host: string }[] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    const c = cells(line);
    rows.push({
      n: c[0].replace(/\*/g, ''),
      host: c[c.length - fromEnd].split('→')[0].trim(),
    });
  }
  return rows;
};

// ── the running service, with its slots replaced by recorders ────────────────────────────────────

const ACTOR: Readonly<AuthenticatedUser> = Object.freeze({
  userId: 'user-a',
  sessionId: 'session-a',
  tenantId: 'tenant-a',
  role: UserRole.ADMINISTRATOR,
  email: 'a@example.test',
  branchId: null,
  membershipId: 'membership-a',
  membershipStatus: 'active',
});

/** A store that answers the one record read; nothing reads the record, because every slot is replaced. */
const store = () => ({
  /** D-1's `T`, in a double with one connection: the callback runs against the same object. */
  $transaction: <T>(work: (tx: unknown) => Promise<T>): Promise<T> =>
    work(store()),
  widgetIntentRecord: {
    findFirst: () =>
      Promise.resolve({
        confirmationJson: null,
        emission: {
          supersededByWidgetId: null,
          deliveryChannel: 'pwa',
          lifecycleState: 'MINTED',
        },
      }),
  },
});

const slotsOf = (gateway: IntentGatewayService): Gate[] =>
  (gateway as unknown as { gates: Gate[] }).gates;

const submit = (gateway: IntentGatewayService) =>
  gateway.submit({
    intentToken: 'token',
    tenantId: 'tenant-a',
    actor: ACTOR,
    submission: { intent_token: 'token' },
    carrier: 'pwa',
  });

/**
 * D-2: the live principal is resolved by the gateway, not passed in. Every slot here is a recorder, so
 * the view's only job is to exist — a `null` would be refused at slot 3 before the recorders ran.
 */
const principals = {
  resolve: () =>
    Promise.resolve({
      authority: null,
      role: null,
      presentationMode: 'staff',
      verificationLevel: 'SESSION_VERIFIED',
      proofHash: 'proof',
    } as unknown as PrincipalView),
};

const NON_PASS: readonly GateVerdict[] = [
  { outcome: 'refuse', code: 'effect_not_admissible', detail: 'recorder' },
  { outcome: 'superseded', code: 'handle_stale', detail: 'recorder' },
  { outcome: 'terminate', why: 'recorder' },
];

/**
 * Replace every slot's `run` with a recorder that passes, except at `stopAt`, where it returns a
 * non-pass verdict. Returns the order the slots were called in.
 */
const record = (gateway: IntentGatewayService, stopAt: number | null) => {
  const calls: string[] = [];
  slotsOf(gateway).forEach((slot, i) => {
    jest.spyOn(slot, 'run').mockImplementation(() => {
      calls.push(slot.n);
      return i === stopAt
        ? NON_PASS[i % NON_PASS.length]
        : { outcome: 'pass' as const };
    });
  });
  return calls;
};

/** Every way the running pipeline departs from §3.9's order. Empty when it holds. */
const orderBreaks = async (
  make: () => IntentGatewayService,
): Promise<string[]> => {
  const breaks: string[] = [];
  const order = slotsOf(make()).map((g) => g.n);
  if (order.join(',') !== SECTION_3_9.join(','))
    breaks.push(`array order ${order.join(' ')}`);
  const table = contractTable();
  const hosts = slotsOf(make()).map((g) => `${g.n}:${g.host}`);
  const contractHosts = table.map((r) => `${r.n}:${r.host}`);
  if (hosts.join(',') !== contractHosts.join(','))
    breaks.push(
      `hosts ${hosts.join(' | ')} against §3.9 ${contractHosts.join(' | ')}`,
    );

  const all = make();
  const calls = record(all, null);
  const r = await submit(all);
  if (
    calls.join(',') !== SECTION_3_9.join(',') ||
    r.ran !== SECTION_3_9.length ||
    r.stoppedAt !== null
  )
    breaks.push(
      `all pass: called ${calls.join(' ')}, ran ${r.ran}, stopped at ${r.stoppedAt}`,
    );

  for (let k = 0; k < SECTION_3_9.length; k += 1) {
    const g = make();
    const seen = record(g, k);
    const stopped = await submit(g);
    const expected = SECTION_3_9.slice(0, k + 1);
    if (
      stopped.stoppedAt !== SECTION_3_9[k] ||
      stopped.ran !== k + 1 ||
      seen.join(',') !== expected.join(',')
    )
      breaks.push(
        `non-pass at position ${k + 1}: stopped at ${stopped.stoppedAt}, ran ${stopped.ran}, called ${seen.join(' ')}`,
      );
  }
  return breaks;
};

const real = () =>
  new IntentGatewayService(
    store() as never,
    principals,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    { mint: () => Promise.resolve(null) },
  );

// The runner logs each stop at debug level; the recorders stop it on purpose, 240 times.
beforeEach(() => {
  jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('T17 / B-1 — the pipeline runs §3.9’s fifteen slots in order', () => {
  it('the contract’s §3.9 table, read from the contract, is the sequence G8-R T17 and G10 B-1 state', () => {
    const table = contractTable();
    expect(table.map((r) => r.n)).toEqual(SECTION_3_9);
    expect(table.find((r) => r.n === '12')?.host).toBe('Projector');
    expect(table.find((r) => r.n === '14')?.host).toBe(
      'CanonicalActionIngressService',
    );
  });

  it('the array’s n sequence is exactly 1, 2, 3, 4, 5, 6, 7, 8, 8-R, 9, 10, 11, 12, 13, 14', () => {
    expect(slotsOf(real()).map((g) => g.n)).toEqual(SECTION_3_9);
  });

  it('each slot is hosted where §3.9 runs it', () => {
    expect(slotsOf(real()).map((g) => [g.n, g.host])).toEqual(
      contractTable().map((r) => [r.n, r.host]),
    );
  });

  it('when every slot passes, the runner calls all fifteen in order, each once', async () => {
    const gateway = real();
    const calls = record(gateway, null);
    await expect(submit(gateway)).resolves.toEqual({
      verdict: { outcome: 'pass' },
      stoppedAt: null,
      ran: 15,
    });
    // Fifteen distinct slot numbers, in order: each slot ran exactly once.
    expect(calls).toEqual(SECTION_3_9);
  });

  it.each(SECTION_3_9.map((n, k) => [n, k] as const))(
    'a non-pass at slot %s stops the pipeline there: every earlier slot ran once, no later slot ran',
    async (n, k) => {
      const gateway = real();
      const calls = record(gateway, k);
      const r = await submit(gateway);
      expect(r.stoppedAt).toBe(n);
      expect(r.ran).toBe(k + 1);
      expect(calls).toEqual(SECTION_3_9.slice(0, k + 1));
    },
  );

  describe('the order fence goes red on each re-ordering (mutations over the real array)', () => {
    /** The real service, with its array rebuilt by `mutate` from the real slots. */
    const mutated =
      (mutate: (slots: Gate[]) => Gate[]) => (): IntentGatewayService => {
        const gateway = real();
        Object.defineProperty(gateway, 'gates', {
          value: mutate([...slotsOf(gateway)]),
        });
        return gateway;
      };
    const at = (slots: Gate[], n: string): number =>
      slots.findIndex((g) => g.n === n);
    const move = (n: string, after: string) => (slots: Gate[]) => {
      const [slot] = slots.splice(at(slots, n), 1);
      slots.splice(at(slots, after) + 1, 0, slot);
      return slots;
    };

    it('CONTROL: the real array breaks nothing', async () => {
      await expect(orderBreaks(real)).resolves.toEqual([]);
    });

    const mutants: ReadonlyArray<readonly [string, (slots: Gate[]) => Gate[]]> =
      [
        ['M14: 8-R moved after 9', move('8-R', '9')],
        ['M-8: 10 moved after 11', move('10', '11')],
        ['M-8: 10 moved before 9', move('10', '8-R')],
        ['12 and 13 swapped', move('12', '13')],
        ['slot 14 dropped', (slots) => slots.filter((g) => g.n !== '14')],
        [
          'slot 12 duplicated',
          (slots) => [...slots.slice(0, 13), slots[12], ...slots.slice(13)],
        ],
        [
          '8-R re-spelled 8R',
          (slots) => slots.map((g) => (g.n === '8-R' ? { ...g, n: '8R' } : g)),
        ],
        [
          'slot 12 re-hosted in the gateway',
          (slots) =>
            slots.map((g) =>
              g.n === '12' ? { ...g, host: 'IntentGateway' as const } : g,
            ),
        ],
      ];

    it.each(mutants)('RED: %s', async (_name, mutate) => {
      expect((await orderBreaks(mutated(mutate))).length).toBeGreaterThan(0);
    });
  });
});
