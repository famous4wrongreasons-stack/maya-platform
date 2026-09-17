// P-25 exit tests PAIR-1, PAIR-2 and PAIR-3 (GATES-PLAN-V11, Wave 1).
//
// Class BUILD: the runtime `AE_PROPOSE_PAIRING` against the contract text it is transcribed from and
// against the two live registries it names. Not live proof — no gate runs here, and nothing flips a
// clause at this unit's merge (§1.0 "Audit").
//
// The contract is read from the repository rather than pinned as a literal here, so that an edit to
// F38 turns PAIR-1 red instead of leaving a stale transcription green. The 13 expected pairs are ALSO
// written out by hand below: the parse and the transcription are two independent statements of the
// same table, and a bug in the parser cannot quietly agree with a bug in the rows.

import fs from 'node:fs';
import path from 'node:path';

import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';
import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import type { CapabilityRef } from '../../widget-contract/capability-ref';
import {
  AE_PROPOSE_PAIRING,
  type ProposePairingRow,
  aeForPropose,
  assertProposePairingResolves,
  checkProposePairing,
  hasExactlyOnePairing,
  pairingForAe,
  pairingForPropose,
  proposeForAe,
} from './propose-pairing';

describe('P-25 — AE_PROPOSE_PAIRING, the runtime rows of F38', () => {
  const BACKEND = path.resolve(__dirname, '..', '..', '..');
  const CONTRACT = fs.readFileSync(
    path.resolve(BACKEND, '..', 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md'),
    'utf8',
  );
  const norm = (t: string): string => t.replace(/\s+/g, ' ').trim();
  const ticks = (t: string): string[] =>
    [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  /** The contiguous markdown table under an exact header line. */
  const table = (header: string): string[][] => {
    const lines = CONTRACT.split('\n');
    const at = lines.findIndex((l) => l.startsWith(header));
    expect(at).toBeGreaterThan(0);
    const rows: string[][] = [];
    for (let i = at + 2; i < lines.length && lines[i].startsWith('|'); i++)
      rows.push(
        lines[i]
          .split(/(?<!\\)\|/)
          .slice(1, -1)
          .map((c) => c.replace(/\\\|/g, '|').trim()),
      );
    return rows;
  };

  /** F38's table, C11:759-773, parsed: `[C9-CAP key, AE-CAP key]` per row. */
  const F38 = (): [string, string][] =>
    table('| C9-CAP key | Owner traversed | AE-CAP key |').map((cells) => {
      expect(cells).toHaveLength(3);
      const propose = ticks(cells[0]);
      const ae = ticks(cells[2]);
      expect(propose).toHaveLength(1);
      expect(ae).toHaveLength(1);
      return [propose[0], ae[0]];
    });

  /** The same table, transcribed by hand from C11:761-773, in the contract's order. */
  const TRANSCRIBED: readonly (readonly [string, string])[] = [
    ['appointments.own.create', 'crm.appointment.create.v1'],
    ['appointments.own.cancel', 'crm.appointment.cancel.v1'],
    ['appointments.own.reschedule', 'crm.appointment.reschedule.v1'],
    ['loyalty.internal.adjust', 'loyalty.internal-adjust.execute.v1'],
    ['expenses.create', 'expenses.create.execute.v1'],
    ['expenses.period.complete', 'expenses.period-declare.execute.v1'],
    [
      'staff.schedule.update',
      'package5.wave3.update-staff-schedule-day.execute.v1',
    ],
    ['settings.update', 'package5.settings.assistant.execute.v1'],
    ['tasks.create', 'package5.work-item.task-create.execute.v1'],
    ['tasks.complete', 'package5.work-item.task-complete.execute.v1'],
    [
      'support.contact-admin.request',
      'package5.work-item.admin-contact.execute.v1',
    ],
    [
      'notifications.appointments.update',
      'package5.settings.appointment-notifications.execute.v1',
    ],
    ['b35.confirm', 'communication.bulk-campaign.admit.v2'],
  ];

  const pairs = (rows: readonly ProposePairingRow[]): [string, string][] =>
    rows.map((r) => [r.propose.key, r.ae.key]);
  const C9_KEYS = new Set(C9_CAPABILITIES.map((c) => c.capabilityKey));
  const AE_KEYS = new Set(
    new ActionCapabilityRegistry().list().map((c) => c.capability),
  );

  // ── PAIR-1 ──────────────────────────────────────────────────────────────────────────────────────

  it('PAIR-1 the rows are F38, in its order, and no more', () => {
    expect(norm(CONTRACT)).toContain(
      norm('**F38 — the propose↔AE mapping, traced call site by call site.**'),
    );
    expect(norm(CONTRACT)).toContain(
      norm('A row appears here only where the trace from the AI-tool handler'),
    );
    expect(norm(CONTRACT)).toContain(
      norm(
        'dispatch through its service to a literal AE-CAP key or a registered constant completed.',
      ),
    );
    const parsed = F38();
    expect(parsed).toHaveLength(13);
    // the parse and the hand transcription agree, so neither alone is the oracle
    expect(parsed).toEqual(TRANSCRIBED.map((p) => [...p]));
    expect(pairs(AE_PROPOSE_PAIRING)).toEqual(parsed);
  });

  it('PAIR-1 every row is `C9` ⇄ `AE`, frozen, and adds no field', () => {
    expect(Object.isFrozen(AE_PROPOSE_PAIRING)).toBe(true);
    for (const r of AE_PROPOSE_PAIRING) {
      expect(Object.keys(r).sort()).toEqual(['ae', 'propose']);
      expect(r.propose.space).toBe('C9');
      expect(r.ae.space).toBe('AE');
      expect(Object.keys(r.propose).sort()).toEqual(['key', 'space']);
      expect(Object.keys(r.ae).sort()).toEqual(['key', 'space']);
      expect(Object.isFrozen(r)).toBe(true);
    }
  });

  it('PAIR-1 F37 is honoured: no gap-keyed appointment-detail key is paired', () => {
    // GAP-APPOINTMENT-DETAIL-COMMIT (C11:742-744): no propose key exists for these four, and none
    // may be inferred. A row for one of them would be exactly the inference F37 forbids.
    for (const facet of ['attendance', 'duration', 'services', 'fields'])
      expect(
        AE_PROPOSE_PAIRING.some((r) =>
          r.ae.key.startsWith(`crm.appointment.${facet}.`),
        ),
      ).toBe(false);
    // GAP-BULK-SEND-DIRECT: `admit.v2` is paired; the other three bulk keys are not.
    expect(pairingForAe('communication.bulk-campaign.execute.v1')).toBeNull();
    expect(pairingForAe('communication.bulk-slot.admit.v2')).toBeNull();
    expect(pairingForAe('communication.bulk-campaign.shadow.v1')).toBeNull();
    // GAP-EXPENSE-DELETE: registered, and with no propose key at all.
    expect(pairingForAe('expenses.delete.execute.v1')).toBeNull();
  });

  // ── PAIR-2 ──────────────────────────────────────────────────────────────────────────────────────

  it('PAIR-2 exactly one pairing per AE key (FR-6b)', () => {
    expect(norm(CONTRACT)).toContain(
      norm(
        'an allowlist row must be `BOOKING_CONFIRMATION` and the `ae` side of exactly one pairing row',
      ),
    );
    const ae = AE_PROPOSE_PAIRING.map((r) => r.ae.key);
    const propose = AE_PROPOSE_PAIRING.map((r) => r.propose.key);
    expect(new Set(ae).size).toBe(ae.length);
    expect(new Set(propose).size).toBe(propose.length);
    for (const [proposeKey, aeKey] of TRANSCRIBED) {
      expect(hasExactlyOnePairing(aeKey)).toBe(true);
      expect(proposeForAe(aeKey)).toEqual({ space: 'C9', key: proposeKey });
      expect(aeForPropose(proposeKey)).toEqual({ space: 'AE', key: aeKey });
      expect(proposeForAe({ space: 'AE', key: aeKey })).toEqual({
        space: 'C9',
        key: proposeKey,
      });
      expect(aeForPropose({ space: 'C9', key: proposeKey })).toEqual({
        space: 'AE',
        key: aeKey,
      });
    }
  });

  it('PAIR-2 the lookups fail closed on a miss, a wrong space and an inherited key', () => {
    const wrongSpace: CapabilityRef[] = [
      { space: 'C9', key: 'crm.appointment.create.v1' },
      { space: 'TOOL', key: 'crm.appointment.create.v1' },
      { space: 'CONTROL', key: 'control.widget.dismiss' },
    ];
    for (const ref of wrongSpace) {
      expect(pairingForAe(ref)).toBeNull();
      expect(hasExactlyOnePairing(ref)).toBe(false);
    }
    expect(
      pairingForPropose({ space: 'AE', key: 'appointments.own.create' }),
    ).toBeNull();
    for (const miss of [
      'crm.appointment.attendance.v1',
      'appointments.own.list',
      '',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(pairingForAe(miss)).toBeNull();
      expect(pairingForPropose(miss)).toBeNull();
      expect(proposeForAe(miss)).toBeNull();
      expect(aeForPropose(miss)).toBeNull();
      expect(hasExactlyOnePairing(miss)).toBe(false);
    }
    for (const absent of [null, undefined]) {
      expect(pairingForAe(absent)).toBeNull();
      expect(pairingForPropose(absent)).toBeNull();
      expect(proposeForAe(absent)).toBeNull();
      expect(aeForPropose(absent)).toBeNull();
      expect(hasExactlyOnePairing(absent)).toBe(false);
    }
  });

  it('PAIR-2 the fence refuses a duplicated side, on either side', () => {
    const first = AE_PROPOSE_PAIRING[0];
    // a registered key on each side that F38 does not pair, so each case duplicates ONE side only
    const sparePropose: CapabilityRef = {
      space: 'C9',
      key: 'appointments.own.list',
    };
    const spareAe: CapabilityRef = {
      space: 'AE',
      key: 'expenses.delete.execute.v1',
    };
    expect(C9_KEYS.has(sparePropose.key)).toBe(true);
    expect(AE_KEYS.has(spareAe.key)).toBe(true);
    const duplicatedAe = checkProposePairing([
      ...AE_PROPOSE_PAIRING,
      { propose: sparePropose, ae: first.ae },
    ]);
    expect(duplicatedAe).toEqual([
      `${first.ae.key} is the ae side of 2 rows (FR-6b)`,
    ]);
    const duplicatedPropose = checkProposePairing([
      ...AE_PROPOSE_PAIRING,
      { propose: first.propose, ae: spareAe },
    ]);
    expect(duplicatedPropose).toEqual([
      `${first.propose.key} is the propose side of 2 rows`,
    ]);
    const wholeRowTwice = checkProposePairing([...AE_PROPOSE_PAIRING, first]);
    expect(wholeRowTwice).toHaveLength(2);
    expect(checkProposePairing(AE_PROPOSE_PAIRING)).toEqual([]);
  });

  // ── PAIR-3 ──────────────────────────────────────────────────────────────────────────────────────

  it('PAIR-3 every propose key is registered in c9Registry and every AE key in ActionCapabilityRegistry', () => {
    for (const r of AE_PROPOSE_PAIRING) {
      expect(C9_KEYS.has(r.propose.key)).toBe(true);
      expect(AE_KEYS.has(r.ae.key)).toBe(true);
    }
    expect(() => assertProposePairingResolves()).not.toThrow();
  });

  it('PAIR-3 the fence refuses an unregistered key and a mis-spaced side', () => {
    const good = AE_PROPOSE_PAIRING[0];
    expect(C9_KEYS.has('appointments.own.invented')).toBe(false);
    expect(AE_KEYS.has('crm.appointment.create.v2')).toBe(false);
    expect(
      checkProposePairing([
        {
          propose: { space: 'C9', key: 'appointments.own.invented' },
          ae: good.ae,
        },
      ]),
    ).toEqual(['row 0: appointments.own.invented is not a registered C9 key']);
    expect(
      checkProposePairing([
        {
          propose: good.propose,
          ae: { space: 'AE', key: 'crm.appointment.create.v2' },
        },
      ]),
    ).toEqual(['row 0: crm.appointment.create.v2 is not a registered AE key']);
    expect(
      checkProposePairing([
        {
          propose: { space: 'AE', key: good.ae.key },
          ae: { space: 'C9', key: good.propose.key },
        },
      ]),
    ).toEqual([
      'row 0: propose side is in space AE',
      'row 0: ae side is in space C9',
    ]);
    // the load assertion reports exactly what the fence found, in its own words
    expect(
      checkProposePairing([
        {
          propose: { space: 'C9', key: 'appointments.own.invented' },
          ae: { space: 'AE', key: 'crm.appointment.create.v2' },
        },
      ]).join('; '),
    ).toBe(
      'row 0: appointments.own.invented is not a registered C9 key; row 0: crm.appointment.create.v2 is not a registered AE key',
    );
  });
});
