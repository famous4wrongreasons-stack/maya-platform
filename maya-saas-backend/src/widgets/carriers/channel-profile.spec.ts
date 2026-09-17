// U-TAB exit tests TAB-1, TAB-2 and TAB-8 (GATES-PLAN-V11, Wave 0). Class BUILD/U: the generated tier
// tables against §4.5.3, `carrierAdmits` over every channel, and the one-implementation import fence.
// Not live proof: Gate 7's C7 and the fitter's CARRIER CEILING are exercised by their own units.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { EffectClass } from '../../widget-contract/intent';
import type { ChannelId, RenderTier } from '../../widget-contract/lifecycle';
import {
  CHANNEL_TIER,
  TIER_EFFECTS,
  TIER_ESCAPE,
} from '../../widget-contract/tables';
import { PROFILES, carrierAdmits } from './channel-profile';

const SRC = path.resolve(__dirname, '..', '..');
const CONTRACT = fs.readFileSync(
  path.resolve(SRC, '..', '..', 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md'),
  'utf8',
);
const ticks = (t: string): string[] =>
  [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const EFFECTS: readonly EffectClass[] = [
  'NONE',
  'NAVIGATE',
  'REFINE',
  'CONTROL',
  'DRAFT',
  'REQUEST_APPROVAL',
  'COMMIT',
  'HANDOFF',
];
const DISMISS: CapabilityRef = {
  space: 'CONTROL',
  key: 'control.widget.dismiss',
};
const RUN_CANCEL: CapabilityRef = {
  space: 'CONTROL',
  key: 'control.run.cancel',
};
const C9_READ: CapabilityRef = { space: 'C9', key: 'catalog.services.read' };
/** A ref of the right space for each effect, so only the carrier decides. */
const refFor = (effect: EffectClass): CapabilityRef | null =>
  effect === 'NONE' || effect === 'NAVIGATE'
    ? null
    : effect === 'CONTROL'
      ? RUN_CANCEL
      : effect === 'COMMIT' || effect === 'REQUEST_APPROVAL'
        ? { space: 'AE', key: 'crm.appointment.create.v1' }
        : C9_READ;
const admitted = (channel: string): EffectClass[] =>
  EFFECTS.filter((e) => carrierAdmits(channel, e, refFor(e), 1));

describe('U-TAB — §4.5.3 tiers and carrierAdmits', () => {
  it('TAB-1 CHANNEL_TIER is total over the 11 ChannelIds and equals the tier table', () => {
    const at = CONTRACT.indexOf('\ntype ChannelId =');
    const channels = [
      ...CONTRACT.slice(at, CONTRACT.indexOf(';', at)).matchAll(/'([^']+)'/g),
    ].map((m) => m[1]);
    expect(channels).toHaveLength(11);
    expect(Object.keys(CHANNEL_TIER)).toEqual(channels);

    // §4.5.3 (C11:5885-5893), transcribed.
    const expected: Record<ChannelId, RenderTier> = {
      pwa: 'RICH_INTERACTIVE',
      'native-shell': 'RICH_INTERACTIVE',
      'telegram-miniapp': 'RICH_INTERACTIVE',
      'telegram-bot': 'RICH_CONSTRAINED',
      'web-push': 'ANNOUNCEMENT',
      'realtime-voice': 'SPOKEN',
      'guest-chat': 'ANONYMOUS_CHAT',
      'web-public': 'PUBLIC_READ',
      'public-community': 'PUBLIC_READ',
      sms: 'TEXT_ONLY',
      email: 'TEXT_ONLY',
    };
    expect(CHANNEL_TIER).toEqual(expected);
    expect(Object.isFrozen(CHANNEL_TIER)).toBe(true);

    // And the table still says so.
    const lines = CONTRACT.split('\n');
    const header = lines.findIndex((l) =>
      l.startsWith('| tier | channels | `max_intents` |'),
    );
    const fromTable: Record<string, string> = {};
    for (let i = header + 2; lines[i].startsWith('|'); i++) {
      const cells = lines[i].split('|').slice(1, -1);
      for (const ch of ticks(cells[1])) fromTable[ch] = ticks(cells[0])[0];
    }
    expect(fromTable).toEqual(expected);

    // Every carrier profile's tier is its channel's cell.
    for (const p of Object.values(PROFILES))
      expect([p.carrier, p.tier]).toEqual([p.carrier, CHANNEL_TIER[p.carrier]]);
  });

  it('TAB-2 each TIER_EFFECTS cell equals CH1 plus the escape', () => {
    const all = [...EFFECTS];
    expect(TIER_EFFECTS).toEqual({
      RICH_INTERACTIVE: { effects: all, escape: false },
      RICH_CONSTRAINED: {
        effects: all.filter((e) => e !== 'NONE'),
        escape: false,
      },
      ANNOUNCEMENT: { effects: ['NAVIGATE', 'HANDOFF'], escape: true },
      SPOKEN: { effects: all.filter((e) => e !== 'NONE'), escape: false },
      TEXT_ONLY: { effects: ['HANDOFF'], escape: true },
      PUBLIC_READ: { effects: ['NAVIGATE', 'HANDOFF'], escape: true },
      ANONYMOUS_CHAT: { effects: ['REFINE', 'HANDOFF'], escape: true },
    });
    expect(TIER_ESCAPE).toEqual({
      effect: 'CONTROL',
      space: 'CONTROL',
      key: 'control.widget.dismiss',
      priority: 0,
    });
    // The same allowlists through the one function, channel by channel (priority 1: no escape).
    expect(admitted('pwa')).toEqual(all);
    expect(admitted('native-shell')).toEqual(all);
    expect(admitted('telegram-miniapp')).toEqual(all);
    expect(admitted('telegram-bot')).toEqual(all.filter((e) => e !== 'NONE'));
    expect(admitted('realtime-voice')).toEqual(all.filter((e) => e !== 'NONE'));
    expect(admitted('web-push')).toEqual(['NAVIGATE', 'HANDOFF']);
    expect(admitted('sms')).toEqual(['HANDOFF']);
    expect(admitted('email')).toEqual(['HANDOFF']);
    expect(admitted('web-public')).toEqual(['NAVIGATE', 'HANDOFF']);
    expect(admitted('public-community')).toEqual(['NAVIGATE', 'HANDOFF']);
    expect(admitted('guest-chat')).toEqual(['REFINE', 'HANDOFF']);
  });

  it('TAB-2 carrierAdmits: the escape is CONTROL, control.widget.dismiss and priority 0, on every tier that lacks CONTROL', () => {
    for (const channel of [
      'web-push',
      'sms',
      'email',
      'web-public',
      'public-community',
      'guest-chat',
    ]) {
      expect([channel, carrierAdmits(channel, 'CONTROL', DISMISS, 0)]).toEqual([
        channel,
        true,
      ]);
      // priority 1 is not the escape (F60: priority 0, never dropped)
      expect([channel, carrierAdmits(channel, 'CONTROL', DISMISS, 1)]).toEqual([
        channel,
        false,
      ]);
      // no other CONTROL key rides on the escape
      expect([
        channel,
        carrierAdmits(channel, 'CONTROL', RUN_CANCEL, 0),
      ]).toEqual([channel, false]);
      expect([
        channel,
        carrierAdmits(
          channel,
          'CONTROL',
          {
            space: 'CONTROL',
            key: 'control.delivery.resolve',
          },
          0,
        ),
      ]).toEqual([channel, false]);
      // the key alone is not enough: a C9-spelled dismiss, a null ref, another effect
      expect([
        channel,
        carrierAdmits(
          channel,
          'CONTROL',
          { space: 'C9', key: 'control.widget.dismiss' },
          0,
        ),
      ]).toEqual([channel, false]);
      expect([channel, carrierAdmits(channel, 'CONTROL', null, 0)]).toEqual([
        channel,
        false,
      ]);
      expect([channel, carrierAdmits(channel, 'NONE', DISMISS, 0)]).toEqual([
        channel,
        false,
      ]);
    }
    // Where the cell reaches CONTROL, CONTROL is admitted by membership, escape or not.
    expect(carrierAdmits('telegram-bot', 'CONTROL', RUN_CANCEL, 3)).toBe(true);
    expect(carrierAdmits('realtime-voice', 'CONTROL', DISMISS, 2)).toBe(true);
  });

  it('TAB-2 carrierAdmits: a tier cell is an allowlist, not an ordered ceiling', () => {
    // ANONYMOUS_CHAT reaches REFINE and still refuses NAVIGATE, which sits below REFINE in the order.
    expect(carrierAdmits('guest-chat', 'REFINE', C9_READ, 1)).toBe(true);
    expect(carrierAdmits('guest-chat', 'NAVIGATE', null, 1)).toBe(false);
    expect(carrierAdmits('guest-chat', 'NONE', null, 0)).toBe(false);
    // ANNOUNCEMENT reaches NAVIGATE and refuses NONE; TEXT_ONLY is HANDOFF alone.
    expect(carrierAdmits('web-push', 'NONE', null, 0)).toBe(false);
    expect(carrierAdmits('sms', 'NAVIGATE', null, 1)).toBe(false);
    // CH2: no DRAFT, REQUEST_APPROVAL or COMMIT on a notification action, whatever the ref.
    for (const e of ['DRAFT', 'REQUEST_APPROVAL', 'COMMIT'] as const)
      expect([e, carrierAdmits('web-push', e, refFor(e), 0)]).toEqual([
        e,
        false,
      ]);
  });

  it('TAB-2 carrierAdmits: NONE only on RICH_INTERACTIVE (R3.2.3)', () => {
    for (const channel of Object.keys(CHANNEL_TIER) as ChannelId[])
      expect([channel, carrierAdmits(channel, 'NONE', null, 0)]).toEqual([
        channel,
        CHANNEL_TIER[channel] === 'RICH_INTERACTIVE',
      ]);
  });

  it('TAB-2 carrierAdmits: a channel outside ChannelId admits nothing, not even the escape', () => {
    for (const channel of [
      'carrier-pigeon',
      'constructor',
      '__proto__',
      'toString',
      '',
    ]) {
      for (const e of EFFECTS)
        expect([channel, e, carrierAdmits(channel, e, refFor(e), 1)]).toEqual([
          channel,
          e,
          false,
        ]);
      expect(carrierAdmits(channel, 'CONTROL', DISMISS, 0)).toBe(false);
    }
  });

  describe('TAB-8 one carrierAdmits implementation', () => {
    const HOME = 'widgets/carriers/channel-profile.ts';
    const TABLES = 'widget-contract/tables.ts';
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    /** Violations over `[path under src, text]` pairs: extra implementations and direct tier-table readers. */
    const scan = (
      files: ReadonlyArray<readonly [string, string]>,
    ): string[] => {
      const found: string[] = [];
      const homes: string[] = [];
      for (const [rel, text] of files) {
        if (!/carrierAdmits|TIER_EFFECTS|TIER_ESCAPE/.test(text)) continue;
        const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true);
        const visit = (n: ts.Node): void => {
          const declared =
            (ts.isVariableDeclaration(n) ||
              ts.isFunctionDeclaration(n) ||
              ts.isMethodDeclaration(n) ||
              ts.isPropertyAssignment(n) ||
              ts.isPropertyDeclaration(n)) &&
            n.name !== undefined &&
            ts.isIdentifier(n.name) &&
            n.name.text === 'carrierAdmits';
          if (declared) homes.push(rel);
          if (
            ts.isIdentifier(n) &&
            (n.text === 'TIER_EFFECTS' || n.text === 'TIER_ESCAPE') &&
            rel !== HOME &&
            rel !== TABLES
          )
            found.push(`${rel} reads ${n.text} directly`);
          ts.forEachChild(n, visit);
        };
        visit(sf);
      }
      if (homes.join() !== HOME)
        found.push(`carrierAdmits is declared in [${homes.join(', ')}]`);
      return found;
    };
    const sources = (): Array<[string, string]> =>
      walk(SRC)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
        .map((f): [string, string] => [
          path.relative(SRC, f).split(path.sep).join('/'),
          fs.readFileSync(f, 'utf8'),
        ]);

    it('TAB-8 carrierAdmits is declared once, in carriers/channel-profile.ts, and nothing else reads the tier allowlists', () => {
      expect(scan(sources())).toEqual([]);
    }, 60_000);

    it('TAB-8 the fence turns red on a second implementation or a direct reader (planted)', () => {
      const real = sources();
      expect(
        scan([
          ...real,
          [
            'widgets/gates/gate7-copy.ts',
            "import { TIER_EFFECTS } from '../../widget-contract/tables';\nexport const c7 = TIER_EFFECTS.SPOKEN;\n",
          ],
        ]),
      ).toEqual([
        'widgets/gates/gate7-copy.ts reads TIER_EFFECTS directly',
        'widgets/gates/gate7-copy.ts reads TIER_EFFECTS directly',
      ]);
      expect(
        scan([
          ...real,
          [
            'widgets/emission/fit-ceiling.ts',
            'export function carrierAdmits(): boolean {\n  return true;\n}\n',
          ],
        ]),
      ).toEqual([
        `carrierAdmits is declared in [${HOME}, widgets/emission/fit-ceiling.ts]`,
      ]);
      expect(scan(real.filter(([rel]) => rel !== HOME))).toEqual([
        'carrierAdmits is declared in []',
      ]);
    }, 60_000);
  });
});
