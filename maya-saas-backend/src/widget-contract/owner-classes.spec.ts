// U-TAB exit tests TAB-3..TAB-7, TAB-9 and TAB-10 (GATES-PLAN-V11, Wave 0). Class BUILD/U: the generated
// tables and the owner-class module against the contract text they are read from, and against the live
// registries. Not live proof.
//
// This file sits in `src/widget-contract/`, which `scripts/widget-contract-check.mjs` reads as a whole:
// every helper is declared inside a `describe`, so no top-level name can collide with a contract module's.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { ActionCapabilityRegistry } from '../action-engine/action-engine.registry';
import { C9_CAPABILITIES } from '../orchestration/c9.registry';
import type { CapabilityRef } from './capability-ref';
import type { EffectClass } from './intent';
import type { OwnerClass, WidgetKind } from './kinds';
import {
  F79_OWNER_CLASS_KEYS,
  KIND_OWNER_CLASS,
  OWNER_CLASSES,
  REGISTERED_KEYS,
  allowedKinds,
  assertOwnerClassesResolve,
  emittable,
  isInheritedOwner,
  isOwnerClassKey,
  ownerClassKeys,
} from './owner-classes';
import {
  CONTROL_REGISTRY,
  EFFECT_KEY_SPACES,
  KIND_ALLOWED_TARGET_CLASSES,
  KIND_PERMITTED_EFFECTS,
} from './tables';

describe('U-TAB — §2.4 owner classes, K20 emittable, allowedKinds, and the generated effect tables', () => {
  const BACKEND = path.resolve(__dirname, '..', '..');
  const CONTRACT = fs.readFileSync(
    path.resolve(BACKEND, '..', 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md'),
    'utf8',
  );
  const norm = (t: string): string => t.replace(/\s+/g, ' ').trim();
  const ticks = (t: string): string[] =>
    [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  /** The contiguous markdown table under an exact header; `\|` inside a cell is an escaped pipe. */
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
  const KINDS = Object.keys(KIND_PERMITTED_EFFECTS) as WidgetKind[];
  const C9_KEYS = C9_CAPABILITIES.map((c) => c.capabilityKey);
  const AE = new ActionCapabilityRegistry().list();
  const keySet = (refs: Iterable<CapabilityRef>): string[] =>
    [...refs].map((r) => `${r.space}:${r.key}`).sort();

  // ── TAB-3 ───────────────────────────────────────────────────────────────────────────────────────

  it('TAB-3 KIND_PERMITTED_EFFECTS equals §2.4, row for row', () => {
    // Transcribed from §2.4 (C11:2877-2898), independently of the generator.
    const expected: Record<WidgetKind, EffectClass[]> = {
      CHOICE: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL', 'HANDOFF'],
      SERVICE_SELECTOR: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL', 'DRAFT'],
      STAFF_SELECTOR: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL', 'DRAFT'],
      TIME_SLOT_SELECTOR: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL', 'DRAFT'],
      BOOKING_CONFIRMATION: [
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'COMMIT',
        'HANDOFF',
      ],
      SCHEDULE: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL', 'HANDOFF'],
      CLIENT_LIST: [
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'REQUEST_APPROVAL',
        'HANDOFF',
      ],
      METRIC: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'],
      CHART: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'],
      REPORT: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'],
      STRATEGY_OPTIONS: [
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'REQUEST_APPROVAL',
      ],
      APPROVAL: ['NONE', 'NAVIGATE', 'CONTROL', 'COMMIT', 'HANDOFF'],
      PROGRESS: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'],
      LIMITATION: ['NONE', 'NAVIGATE', 'CONTROL', 'HANDOFF'],
      SOURCE_STATUS: ['NONE', 'NAVIGATE', 'CONTROL', 'HANDOFF'],
      SETTINGS_DRAFT: [
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'COMMIT',
        'HANDOFF',
      ],
      FORM: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL', 'DRAFT', 'HANDOFF'],
      CONSENT_STATE: ['NONE', 'CONTROL', 'HANDOFF'],
      IDENTITY_BINDING: ['NONE', 'CONTROL', 'HANDOFF'],
      PAYMENT_HANDOFF: [
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'COMMIT',
        'HANDOFF',
      ],
      MEDIA_PREVIEW: ['NONE', 'NAVIGATE', 'REFINE', 'CONTROL'],
      ARTIFACT: ['NONE', 'NAVIGATE', 'CONTROL', 'HANDOFF'],
    };
    expect(KIND_PERMITTED_EFFECTS).toEqual(expected);
    expect(Object.isFrozen(KIND_PERMITTED_EFFECTS)).toBe(true);
    expect(Object.isFrozen(KIND_PERMITTED_EFFECTS.CHOICE)).toBe(true);
    // And the contract still says so: each row's effects cell, ceiling phrase removed.
    const rows = table('| # | Kind | Permitted effects (ceiling) |');
    expect(rows.map((c) => ticks(c[1])[0])).toEqual(KINDS);
    for (const c of rows)
      expect(c[2].replace(/\s*\(\*\*[A-Z_]+\*\*\)$/, '')).toBe(
        expected[ticks(c[1])[0] as WidgetKind].join(', '),
      );
    // K11: exactly four kinds may carry a COMMIT.
    expect(
      KINDS.filter((k) => KIND_PERMITTED_EFFECTS[k].includes('COMMIT')),
    ).toEqual([
      'BOOKING_CONFIRMATION',
      'APPROVAL',
      'SETTINGS_DRAFT',
      'PAYMENT_HANDOFF',
    ]);
  });

  // ── TAB-4 ───────────────────────────────────────────────────────────────────────────────────────

  it('TAB-4 EFFECT_KEY_SPACES equals R3.2.2, and no effect class names a TOOL ref', () => {
    expect(
      norm(CONTRACT).includes(
        'Only `REFINE`, `DRAFT`, `HANDOFF` and a class-`c` `NAVIGATE` may carry a `C9` ref; only `COMMIT` and `REQUEST_APPROVAL` may carry an `AE` ref in `capability`, and a `HANDOFF` may also name an `AE` destination in `handoff_capability_ref`, referenced and never invoked (§0.12 F69); only `CONTROL` may carry a `CONTROL` ref; **no intent of any effect class may carry a `TOOL` ref.**',
      ),
    ).toBe(true);
    expect(EFFECT_KEY_SPACES).toEqual({
      NONE: [],
      NAVIGATE: ['C9'],
      REFINE: ['C9'],
      CONTROL: ['CONTROL'],
      DRAFT: ['C9'],
      REQUEST_APPROVAL: ['AE'],
      COMMIT: ['AE'],
      HANDOFF: ['C9', 'AE'],
    });
    for (const spaces of Object.values(EFFECT_KEY_SPACES))
      expect(spaces).not.toContain('TOOL');
  });

  // ── TAB-5 ───────────────────────────────────────────────────────────────────────────────────────

  it('TAB-5 ownerClassKeys is total over the 22 kinds, and NONE resolves to the empty set', () => {
    expect(KINDS).toHaveLength(22);
    for (const k of KINDS) {
      expect(ownerClassKeys(k)).toBeInstanceOf(Set);
      expect(OWNER_CLASSES).toContain(KIND_OWNER_CLASS[k]);
    }
    expect(KIND_OWNER_CLASS.LIMITATION).toBe('NONE');
    expect(ownerClassKeys('LIMITATION').size).toBe(0);
    expect(KINDS.filter((k) => KIND_OWNER_CLASS[k] === 'NONE')).toEqual([
      'LIMITATION',
    ]);
    // An unknown kind (a stored string) resolves to nothing rather than throwing.
    expect(ownerClassKeys('NOT_A_KIND' as WidgetKind).size).toBe(0);
  });

  it('TAB-5 catalog.services.read resolves to CATALOG_READ, and to no other owner class', () => {
    const ref: CapabilityRef = { space: 'C9', key: 'catalog.services.read' };
    const owners = new Set(
      [...allowedKinds(ref)].map((k) => KIND_OWNER_CLASS[k]),
    );
    expect([...owners]).toEqual(['CATALOG_READ']);
    expect([...allowedKinds(ref)]).toEqual(['SERVICE_SELECTOR']);
    expect(isOwnerClassKey('SERVICE_SELECTOR', ref)).toBe(true);
    expect(isOwnerClassKey('STAFF_SELECTOR', ref)).toBe(false);
  });

  it('TAB-5 an INHERITED kind resolves to no registry-load key, stays emittable, and is fenced per intent (IR-TAB-2)', () => {
    // C11:2856-2857: INHERITED resolves to "the keys the intent's own capability names" — a property of
    // one intent, not a registry-load constant; C11:2864-2866 exempts it, with NONE, from the load duty.
    const inherited = KINDS.filter(
      (k) => KIND_OWNER_CLASS[k] === 'INHERITED',
    ).sort();
    expect(inherited).toEqual(['CHOICE', 'FORM']);
    for (const k of inherited) {
      expect(ownerClassKeys(k).size).toBe(0);
      expect(isInheritedOwner(k)).toBe(true);
      // K20's formula is not what makes them emittable: §2.7 lists both among the sixteen.
      expect(emittable(k)).toBe(true);
      // The C11:2113/2145 fence never admits them from a registry key.
      expect(
        isOwnerClassKey(k, { space: 'C9', key: 'catalog.staff.read' }),
      ).toBe(false);
    }
    for (const k of KINDS.filter((x) => KIND_OWNER_CLASS[x] !== 'INHERITED'))
      expect(isInheritedOwner(k)).toBe(false);
    expect(isInheritedOwner('NOT_A_KIND' as WidgetKind)).toBe(false);
    // No registry key admits an INHERITED kind anywhere in the inverse index.
    const admitted = new Set(
      [
        ...C9_KEYS.map((key): CapabilityRef => ({ space: 'C9', key })),
        ...AE.map((a): CapabilityRef => ({ space: 'AE', key: a.capability })),
      ].flatMap((ref) => [...allowedKinds(ref)]),
    );
    expect(inherited.filter((k) => admitted.has(k))).toEqual([]);
  });

  it('TAB-5 wildcards and brace sets expand over the C9 registry (clients.* is not empty)', () => {
    const clients = C9_KEYS.filter((k) => k.startsWith('clients.'));
    expect(clients.length).toBeGreaterThan(0);
    for (const key of clients)
      expect(isOwnerClassKey('CLIENT_LIST', { space: 'C9', key })).toBe(true);
    expect(
      isOwnerClassKey('CLIENT_LIST', {
        space: 'C9',
        key: 'clients.dormant.list',
      }),
    ).toBe(true);
    for (const key of [
      'appointments.own.create',
      'appointments.own.reschedule',
      'appointments.own.cancel',
    ])
      expect(
        isOwnerClassKey('BOOKING_CONFIRMATION', { space: 'C9', key }),
      ).toBe(true);
    expect(
      isOwnerClassKey('BOOKING_CONFIRMATION', {
        space: 'C9',
        key: 'appointments.own.list',
      }),
    ).toBe(false);
    // A wildcard over keys the registry lacks is empty, not an error.
    expect(ownerClassKeys('CONSENT_STATE').size).toBe(0);
    expect(ownerClassKeys('MEDIA_PREVIEW').size).toBe(0);
  });

  it("TAB-5 KIND_OWNER_CLASS and every kind's keys equal §2.4's column, with F79 for SETTINGS_OWNER", () => {
    // The closed union, from §2.4's fenced declaration.
    const at = CONTRACT.indexOf('\ntype OwnerClass =');
    const union = [
      ...CONTRACT.slice(at, CONTRACT.indexOf(';', at)).matchAll(/'(\w+)'/g),
    ].map((m) => m[1]);
    expect([...OWNER_CLASSES].sort()).toEqual([...union].sort());

    // F79's six classes and their keys (C11:1502-1509), the one table with this header.
    const isKey = (t: string): boolean =>
      /^[a-z0-9_-]+(\.[a-z0-9_{},*-]+)+$/.test(t);
    const f79Rows = table('| owner class | keys |');
    expect(f79Rows).toHaveLength(6);
    expect(
      Object.fromEntries(
        f79Rows.map((c) => [ticks(c[0])[0], ticks(c[1]).filter(isKey)]),
      ),
    ).toEqual(F79_OWNER_CLASS_KEYS);

    // Expansion oracle, written independently of the module.
    const expand = (pattern: string): string[] => {
      const brace = /^(.*)\{(.*)\}$/.exec(pattern);
      if (brace) return brace[2].split(',').map((m) => brace[1] + m);
      if (pattern.endsWith('.*'))
        return C9_KEYS.filter((k) => k.startsWith(pattern.slice(0, -1)));
      return [pattern];
    };
    // Tokens a cell names that are not owner keys, each for the reason its own cell gives.
    const NOT_OWNER_KEYS: Partial<Record<WidgetKind, string[]>> = {
      PROGRESS: ['control.run.cancel'], // "cancellation is `control.run.cancel`"
      SETTINGS_DRAFT: ['expenses.create', 'loyalty.internal.adjust'], // "are **not** among them"
    };
    const rows = table('| # | Kind | Permitted effects (ceiling) |');
    for (const c of rows) {
      const kind = ticks(c[1])[0] as WidgetKind;
      const tokens = ticks(c[3]);
      const ownerClass = tokens.find((t) =>
        (OWNER_CLASSES as readonly string[]).includes(t),
      ) as OwnerClass;
      expect([kind, KIND_OWNER_CLASS[kind]]).toEqual([kind, ownerClass]);
      const patterns = tokens
        .filter(isKey)
        .filter((t) => !(NOT_OWNER_KEYS[kind] ?? []).includes(t));
      let expected: string[];
      if (ownerClass === 'NONE') expected = [];
      else if (ownerClass === 'INHERITED')
        expected = []; // IR-TAB-2: the intent's own capability names them, not this table
      else if (ownerClass === 'ACTION_EXECUTION')
        expected = AE.filter((a) => a.approvalRequirement === 'REQUIRED').map(
          (a) => `AE:${a.capability}`,
        );
      else if (ownerClass === 'SETTINGS_OWNER')
        expected = Object.values(F79_OWNER_CLASS_KEYS)
          .flat()
          .map((k) => `C9:${k}`);
      else expected = patterns.flatMap(expand).map((k) => `C9:${k}`);
      expect([kind, keySet(ownerClassKeys(kind))]).toEqual([
        kind,
        [...new Set(expected)].sort(),
      ]);
    }
    // Outcome-neutral pick (plan §0.2): CLIENT_LIST's cell names CLIENT_READ first.
    expect(KIND_OWNER_CLASS.CLIENT_LIST).toBe('CLIENT_READ');
  });

  it('TAB-5 the registry-load assertion holds on the real registries', () => {
    expect(() => assertOwnerClassesResolve()).not.toThrow();
    for (const k of KINDS)
      for (const ref of ownerClassKeys(k))
        expect(REGISTERED_KEYS.has(`${ref.space}:${ref.key}`)).toBe(true);
    expect(REGISTERED_KEYS.size).toBe(
      C9_KEYS.length + AE.length + Object.keys(CONTROL_REGISTRY).length,
    );
  });

  // ── TAB-6 ───────────────────────────────────────────────────────────────────────────────────────

  it('TAB-6 emittable(PAYMENT_HANDOFF) is false, and K20 blocks exactly the kinds §2.7 blocks on registration', () => {
    expect(emittable('PAYMENT_HANDOFF')).toBe(false);
    const blocked = table('| Status | Kinds |').find((c) =>
      c[0].includes('Blocked on capability registration'),
    );
    expect(blocked).toBeDefined();
    expect(KINDS.filter((k) => !emittable(k)).sort()).toEqual(
      ticks(blocked?.[1] ?? '').sort(),
    );
    // LIMITATION is the fail-closed emission itself (§2.7 lists it emittable; reading choice in the report).
    expect(emittable('LIMITATION')).toBe(true);
    expect(emittable('NOT_A_KIND' as WidgetKind)).toBe(false);
  });

  // ── TAB-7 ───────────────────────────────────────────────────────────────────────────────────────

  it('TAB-7 allowedKinds is the inverse of ownerClassKeys, compared by value', () => {
    const everyRef: CapabilityRef[] = [
      ...C9_KEYS.map((key): CapabilityRef => ({ space: 'C9', key })),
      ...AE.map((a): CapabilityRef => ({ space: 'AE', key: a.capability })),
      ...Object.keys(CONTROL_REGISTRY).map((key): CapabilityRef => ({
        space: 'CONTROL',
        key: key as keyof typeof CONTROL_REGISTRY,
      })),
    ];
    let pairs = 0;
    for (const k of KINDS)
      for (const ref of ownerClassKeys(k)) {
        // a fresh object, so the inverse cannot hold by identity alone
        expect(allowedKinds({ ...ref })).toContain(k);
        pairs++;
      }
    for (const ref of everyRef)
      for (const k of allowedKinds(ref))
        expect(isOwnerClassKey(k, ref)).toBe(true);
    expect(pairs).toBeGreaterThan(0);
    expect([
      ...allowedKinds({ space: 'TOOL', key: 'catalog.services.read' }),
    ]).toEqual([]);
    expect([
      ...allowedKinds({ space: 'CONTROL', key: 'control.widget.dismiss' }),
    ]).toEqual([]);
    expect([...allowedKinds({ space: 'C9', key: 'no.such.key' })]).toEqual([]);
    expect(
      [...allowedKinds({ space: 'C9', key: 'catalog.staff.read' })].sort(),
    ).toEqual(['STAFF_SELECTOR']); // IR-TAB-2: no INHERITED kind is admitted from a registry key
  });

  // ── TAB-9 ───────────────────────────────────────────────────────────────────────────────────────

  it('TAB-9 build-tables.mjs regenerates tables.ts with no diff', () => {
    const out = execFileSync(
      process.execPath,
      [
        path.join(BACKEND, 'scripts/widget-contract/build-tables.mjs'),
        '--check',
      ],
      { cwd: BACKEND, encoding: 'utf8' },
    );
    expect(out).toContain('src/widget-contract/tables.ts is current');
  }, 60_000);

  // ── TAB-10 ──────────────────────────────────────────────────────────────────────────────────────

  it("TAB-10 no kind's allowed_target_classes contains 'c' (C11:2801)", () => {
    expect(
      norm(CONTRACT).includes(
        "The default is `['w','i','detail']` for every kind, plus `'s'` for every kind whose `permitted_effects` include `HANDOFF`. **`'c'` is permitted on no kind in this contract version.**",
      ),
    ).toBe(true);
    expect(Object.keys(KIND_ALLOWED_TARGET_CLASSES)).toEqual(KINDS);
    for (const k of KINDS) {
      const classes: readonly string[] = KIND_ALLOWED_TARGET_CLASSES[k];
      expect([k, classes.includes('c')]).toEqual([k, false]);
      expect([k, [...classes].sort()]).toEqual([
        k,
        (KIND_PERMITTED_EFFECTS[k].includes('HANDOFF')
          ? ['w', 'i', 'detail', 's']
          : ['w', 'i', 'detail']
        ).sort(),
      ]);
    }
  });
});
