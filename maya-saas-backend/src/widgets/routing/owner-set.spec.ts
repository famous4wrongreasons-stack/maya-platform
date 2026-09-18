// U10a — `ownerSet` / `sameOwner` over the REAL registries (AREA-B §3.4's owner-set table).
//
// Class U (unit). Never live proof (§0.5): no gate runs here and nothing flips a clause. What it
// does prove is that Gate 10's owner reading is the contract's — over the live C9 registry, U-TAB's
// §2.4 tables, P-25's F38 rows and the F27 control registry — rather than over a map written for a
// test, and that every branch the contract calls `undefined` really fails closed.
//
// The F27 owner endpoints are re-read FROM THE CONTRACT here, so that an edit to the cell turns this
// spec red instead of leaving `CONTROL_REGISTRY` and the contract quietly disagreeing.

import fs from 'node:fs';
import path from 'node:path';

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import { KIND_OWNER_CLASS } from '../../widget-contract/owner-classes';
import { CONTROL_REGISTRY } from '../../widget-contract/tables';
import {
  AE_PROPOSE_PAIRING,
  type ProposePairingRow,
  proposeForAe,
} from '../authority/propose-pairing';
import {
  assertOwnerSetResolves,
  ownerSet,
  ownerSetOverPairing,
  sameOwner,
} from './owner-set';

const c9 = (key: string): CapabilityRef => ({ space: 'C9', key });
const ae = (key: string): CapabilityRef => ({ space: 'AE', key });
const control = (key: string): CapabilityRef =>
  ({ space: 'CONTROL', key }) as CapabilityRef;
const tool = (key: string): CapabilityRef => ({ space: 'TOOL', key });
const members = (ref: CapabilityRef): string[] | undefined => {
  const set = ownerSet(ref);
  return set === undefined ? undefined : [...set].sort();
};

describe('U10a — ownerSet and sameOwner (C11:4833-4844)', () => {
  // ── the C9 branch ──────────────────────────────────────────────────────────────────────────────

  it('U10A-OS-1 a C9 key resolves to the owner classes of the kinds that name it', () => {
    expect(members(c9('catalog.services.read'))).toEqual(['CATALOG_READ']);
    expect(members(c9('booking.availability.read'))).toEqual([
      'AVAILABILITY_READ',
    ]);
    // `owner_report.status` is named by PROGRESS (ORCHESTRATION_RUN) and by ARTIFACT (ARTIFACT_OWNER):
    // one key, two owning kinds, so the set has two members and both of them own it.
    expect(members(c9('owner_report.status'))).toEqual([
      'ARTIFACT_OWNER',
      'ORCHESTRATION_RUN',
    ]);
  });

  it('U10A-OS-2 `b35.preview` and `b35.status` share CLIENT_LIST’s owner label', () => {
    const preview = members(c9('b35.preview'));
    const status = members(c9('b35.status'));
    expect(preview).toContain('CLIENT_READ');
    expect(status).toContain('CLIENT_READ');
    expect(preview).toEqual(status);
    expect(sameOwner(c9('b35.preview'), c9('b35.status'))).toBe(true);
  });

  it('U10A-OS-3 an unregistered C9 key is `undefined`, not an empty set', () => {
    expect(ownerSet(c9('catalog.services.write'))).toBeUndefined();
    expect(ownerSet(c9(''))).toBeUndefined();
    expect(ownerSet(c9('__proto__'))).toBeUndefined();
    expect(ownerSet(c9('constructor'))).toBeUndefined();
  });

  it('U10A-OS-4 INHERITED and NONE never appear in an owner set (C11:4836) [M10-7]', () => {
    const inherited = Object.entries(KIND_OWNER_CLASS)
      .filter(([, owner]) => owner === 'INHERITED' || owner === 'NONE')
      .map(([kind]) => kind);
    expect(inherited.sort()).toEqual(['CHOICE', 'FORM', 'LIMITATION']);
    const everyOwner = new Set<string>();
    for (const capability of [
      ...AE_PROPOSE_PAIRING.map((row) => row.propose),
      c9('catalog.services.read'),
      c9('booking.availability.read'),
      c9('owner_report.status'),
      c9('b35.preview'),
      c9('c9.no_action'),
      c9('clients.dossier.read'),
    ])
      for (const owner of ownerSet(capability) ?? []) everyOwner.add(owner);
    expect(everyOwner.size).toBeGreaterThan(0);
    expect([...everyOwner]).not.toContain('INHERITED');
    expect([...everyOwner]).not.toContain('NONE');
  });

  it('U10A-OS-5 a registered key no kind owns is DEFINED and empty, and owns nothing', () => {
    // Defined-but-empty is a different answer from `undefined`: the key exists, no kind's owner class
    // names it. `sameOwner` is false either way, but only `undefined` means "unknown capability".
    const orphans = ['appointments.own.list', 'loyalty.own.read'].filter(
      (key) => (ownerSet(c9(key)) ?? new Set()).size === 0,
    );
    expect(orphans.length).toBeGreaterThan(0);
    for (const key of orphans) {
      expect(ownerSet(c9(key))).toBeDefined();
      expect(sameOwner(c9(key), c9(key))).toBe(false);
    }
  });

  // ── the AE branch (C11:4838-4839) ──────────────────────────────────────────────────────────────

  it('U10A-OS-6 an AE key reaches its owner through its one propose row', () => {
    expect(members(ae('crm.appointment.create.v1'))).toEqual(
      members(c9('appointments.own.create')),
    );
    expect(members(ae('crm.appointment.create.v1'))).toEqual(['BOOKING_OWNER']);
    // Every one of F38's thirteen rows agrees with P-25's own lookup: two readers of one table.
    for (const row of AE_PROPOSE_PAIRING) {
      const viaPairing = proposeForAe(row.ae);
      expect(viaPairing).not.toBeNull();
      expect(members(row.ae)).toEqual(members(viaPairing as CapabilityRef));
    }
  });

  it('U10A-OS-7 an AE key with NO pairing row is `undefined` (F37 gap)', () => {
    expect(ownerSet(ae('crm.appointment.detail.v1'))).toBeUndefined();
    expect(ownerSet(ae('not.a.registered.capability.v1'))).toBeUndefined();
    expect(proposeForAe('crm.appointment.detail.v1')).toBeNull();
  });

  it('U10A-OS-8 [RI] an AE key with TWO pairing rows is `undefined` (FR-6b) [M10-8]', () => {
    const duplicated: readonly ProposePairingRow[] = [
      { propose: c9('appointments.own.create'), ae: ae('duplicated.v1') },
      { propose: c9('settings.update'), ae: ae('duplicated.v1') },
    ];
    expect(
      ownerSetOverPairing(duplicated, ae('duplicated.v1')),
    ).toBeUndefined();
    // …and with exactly one row the same injected table DOES resolve, so the refusal above is the
    // cardinality rule and not a broken harness.
    expect([
      ...(ownerSetOverPairing(duplicated.slice(0, 1), ae('duplicated.v1')) ??
        []),
    ]).toEqual(['BOOKING_OWNER']);
  });

  it('U10A-OS-9 [RI] a pairing row whose propose side is unregistered is `undefined`', () => {
    const broken: readonly ProposePairingRow[] = [
      { propose: c9('appointments.own.invent'), ae: ae('orphan.v1') },
    ];
    expect(ownerSetOverPairing(broken, ae('orphan.v1'))).toBeUndefined();
  });

  it('U10A-OS-10 a ref carried in the wrong space does not cross the pairing table', () => {
    // The AE branch matches `p.ae` only. A C9 key spelled as an AE ref, and an AE key spelled as a
    // C9 ref, both miss.
    expect(ownerSet(ae('appointments.own.create'))).toBeUndefined();
    expect(ownerSet(c9('crm.appointment.create.v1'))).toBeUndefined();
  });

  // ── the CONTROL and TOOL branches ──────────────────────────────────────────────────────────────

  it('U10A-OS-11 a CONTROL key resolves to its F27 owner-endpoint cell, read from the contract', () => {
    const contract = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md',
      ),
      'utf8',
    );
    // F27's own table (C11:427-431), taken as the contiguous rows under its header, so that a
    // sentence elsewhere naming the three keys cannot be mistaken for a row.
    const lines = contract.split('\n');
    const header = lines.findIndex((line) =>
      line.startsWith('| control key | owner endpoint |'),
    );
    expect(header).toBeGreaterThan(0);
    const rows: string[][] = [];
    for (let i = header + 2; i < lines.length && lines[i].startsWith('|'); i++)
      rows.push(
        lines[i]
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim().replace(/^`|`$/g, '')),
      );
    const cells = new Map(rows.map((cells) => [cells[0], cells[1]]));
    expect([...cells.keys()].sort()).toEqual([
      'control.delivery.resolve',
      'control.run.cancel',
      'control.widget.dismiss',
    ]);
    for (const [key, endpoint] of cells)
      expect(members(control(key))).toEqual([endpoint.replace(/`/g, '')]);
    expect(members(control('control.widget.dismiss'))).toEqual([
      'widget layer',
    ]);
    expect(members(control('control.delivery.resolve'))).toEqual([
      'widget layer',
    ]);
    expect(members(control('control.run.cancel'))).toEqual([
      'POST /api/orchestration/runs/:id/cancel',
    ]);
    expect(Object.keys(CONTROL_REGISTRY).sort()).toEqual(
      [...cells.keys()].sort(),
    );
  });

  it('U10A-OS-12 the two widget-layer controls share an owner; run.cancel does not [M10-9]', () => {
    expect(
      sameOwner(
        control('control.widget.dismiss'),
        control('control.delivery.resolve'),
      ),
    ).toBe(true);
    expect(
      sameOwner(
        control('control.widget.dismiss'),
        control('control.run.cancel'),
      ),
    ).toBe(false);
  });

  it('U10A-OS-13 a CONTROL key outside the closed three, and any TOOL key, are `undefined`', () => {
    expect(ownerSet(control('control.widget.bogus'))).toBeUndefined();
    expect(ownerSet(control('control.run.start'))).toBeUndefined();
    expect(ownerSet(tool('get_services'))).toBeUndefined();
    expect(ownerSet(tool('any_tool_at_all'))).toBeUndefined();
  });

  it('U10A-OS-14 a null, undefined or space-less ref is `undefined`', () => {
    expect(ownerSet(null)).toBeUndefined();
    expect(ownerSet(undefined)).toBeUndefined();
    expect(
      ownerSet({ space: 'NOPE', key: 'x' } as unknown as CapabilityRef),
    ).toBeUndefined();
  });

  // ── sameOwner (C11:4844) ───────────────────────────────────────────────────────────────────────

  it('U10A-OS-15 sameOwner is intersection, and `undefined` fails closed on either side [M10-6]', () => {
    expect(
      sameOwner(c9('catalog.services.read'), c9('catalog.staff.read')),
    ).toBe(true);
    expect(
      sameOwner(c9('catalog.services.read'), c9('booking.availability.read')),
    ).toBe(false);
    // A key shared by two kinds intersects each of them.
    expect(sameOwner(c9('owner_report.status'), c9('c9.no_action'))).toBe(true);
    // Undefined on either side, or on both, is false — never "treat as the same owner".
    expect(sameOwner(c9('catalog.services.read'), tool('get_services'))).toBe(
      false,
    );
    expect(sameOwner(tool('get_services'), c9('catalog.services.read'))).toBe(
      false,
    );
    expect(sameOwner(tool('a'), tool('b'))).toBe(false);
    expect(sameOwner(null, c9('catalog.services.read'))).toBe(false);
    expect(sameOwner(c9('catalog.services.read'), null)).toBe(false);
  });

  it('U10A-OS-16 an AE commit and its own propose key share an owner', () => {
    expect(
      sameOwner(ae('crm.appointment.create.v1'), c9('appointments.own.create')),
    ).toBe(true);
    expect(
      sameOwner(ae('crm.appointment.create.v1'), c9('catalog.services.read')),
    ).toBe(false);
  });

  // ── the load assertion ─────────────────────────────────────────────────────────────────────────

  it('U10A-OS-17 the load assertion passes over the real registries', () => {
    expect(() => assertOwnerSetResolves()).not.toThrow();
    // What it checks, stated again as data: every pairing row's propose side resolves in C9, and no
    // F27 owner-endpoint cell is blank — so `ownerSet` can always name an owner for a paired AE key.
    for (const row of AE_PROPOSE_PAIRING)
      expect(ownerSet(row.propose)).toBeDefined();
    for (const cell of Object.values(CONTROL_REGISTRY))
      expect(cell.ownerEndpoint.trim()).not.toEqual('');
  });
});
