// Gate 5, as a function: a positive proof, the refusal proofs, and the carrier ceiling.
//
// Every test here would have passed vacuously before the gates were wired, because the gate it
// exercises was a stub that refused everything. That is the point: `mechanism_absent` is not a
// fence, and a suite that could not tell a fence from a blanket refusal is not a suite.

import fs from 'node:fs';
import path from 'node:path';

import type { ChannelId } from '../../widget-contract/lifecycle';
import type { PrincipalView } from '../gate.types';
import {
  CHANNEL_MAX_LEVEL,
  channelMaxLevel,
  resolveVerificationLevel,
} from '../authority/authority-resolver';
import {
  effectiveLevel,
  gate5,
  recomputeFloor,
  widgetFloorDivergence,
} from './gate5';
import {
  code,
  ctx as baseCtx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

const ctx = (
  record: Parameters<typeof baseCtx>[0],
  over: Parameters<typeof baseCtx>[1] = {},
): ReturnType<typeof baseCtx> =>
  baseCtx(record, {
    ...over,
    principal:
      over.principal ?? principal(over.verificationLevel ?? 'SESSION_VERIFIED'),
  });

beforeAll(guardRegistries);

const principal = (
  verificationLevel: PrincipalView['verificationLevel'],
): PrincipalView => ({
  authority: {
    kind: 'USER',
    tenantId: 't1',
    userId: 'u1',
    membershipId: 'm1',
    clientId: null,
    channelLinkId: null,
    branchRefs: [],
    staffRef: null,
    proofHash: 'a'.repeat(64),
  },
  role: 'administrator',
  presentationMode: 'owner',
  verificationLevel,
  proofHash: 'a'.repeat(64),
});

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
    expect(v.outcome).toBe('superseded');
    expect(code(v)).toBe('policy_floor_changed');
  });

  it('G15-4 increments only the process-local divergence counter', () => {
    widgetFloorDivergence.reset();
    const r = rec({ verificationFloor: 'ANONYMOUS' });
    expect(gate5(ctx(r)).outcome).toBe('superseded');
    expect(widgetFloorDivergence.count).toBe(1);
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

  it('effectiveLevel(ctx) is the session level capped by the channel ceiling, and Gate 5 compares it', () => {
    const r = rec({ verificationFloor: recomputeFloor(rec()) });
    expect(effectiveLevel(ctx(r))).toBe('SESSION_VERIFIED');
    expect(
      effectiveLevel(ctx(r, { channelMaxLevel: channelMaxLevel('sms') })),
    ).toBe('CHANNEL_IDENTITY');
    expect(effectiveLevel(ctx(r, { verificationLevel: 'ANONYMOUS' }))).toBe(
      'ANONYMOUS',
    );
    // The level Gate 5 reports below the floor is the one this export returns.
    const capped = ctx(r, { channelMaxLevel: 'CHANNEL_IDENTITY' });
    const v = gate5(capped);
    expect('detail' in v && v.detail).toBe(
      `${effectiveLevel(capped)} below ${recomputeFloor(r)}`,
    );
  });

  it('G15-5 a non-rung principal term fails closed into the existing step-up refusal', () => {
    const r = rec({ verificationFloor: recomputeFloor(rec()) });
    const malformed = principal('SESSION_VERIFIED');
    const v = gate5(
      ctx(r, {
        principal: {
          ...malformed,
          verificationLevel: 'NOT_A_RUNG' as PrincipalView['verificationLevel'],
        },
      }),
    );
    expect(v.outcome).toBe('refuse');
    expect(code(v)).toBe('handoff_required');
  });

  it('G15-6b [U-proof] a shortfall returns only its code; Gate 5 invents no landing handle', () => {
    const r = rec({ verificationFloor: recomputeFloor(rec()) });
    const v = gate5(ctx(r, { verificationLevel: 'ANONYMOUS' }));
    expect(v).toEqual({
      outcome: 'refuse',
      code: 'handoff_required',
      detail: `ANONYMOUS below ${recomputeFloor(r)}`,
    });
    expect(Object.keys(v).sort()).toEqual(['code', 'detail', 'outcome']);
  });

  it('the cap is stated once: effectiveLevel is declared in gate5.ts and nowhere else in the widget layer', () => {
    const widgets = path.join(__dirname, '..');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
      });
    const declarers = walk(widgets)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) =>
        /\b(?:const|let|var|function)\s+effectiveLevel\b/.test(
          fs.readFileSync(f, 'utf8'),
        ),
      )
      .map((f) => path.relative(widgets, f).split(path.sep).join('/'));
    expect(declarers).toEqual(['gates/gate5.ts']);
  });

  it('the carrier ceiling is keyed by ChannelId, and a channel with no row caps at the bottom', () => {
    expect(channelMaxLevel('telegram-bot')).toBe('BOUND_CLIENT');
    expect(channelMaxLevel('sms')).toBe('CHANNEL_IDENTITY');
    expect(channelMaxLevel('native-shell')).toBe('SESSION_VERIFIED');
    // A ChannelId the table has no row for fails closed.
    expect(channelMaxLevel('guest-chat')).toBe('ANONYMOUS');
    // So does a value outside the vocabulary that reaches the function at runtime — including the
    // retired `native` key, which is not a ChannelId.
    expect(
      channelMaxLevel('a-carrier-nobody-declared' as unknown as ChannelId),
    ).toBe('ANONYMOUS');
    expect(channelMaxLevel('native' as unknown as ChannelId)).toBe('ANONYMOUS');
    expect(Object.keys(CHANNEL_MAX_LEVEL)).toHaveLength(7);
    expect(Object.keys(CHANNEL_MAX_LEVEL).sort()).toEqual([
      'email',
      'native-shell',
      'pwa',
      'realtime-voice',
      'sms',
      'telegram-bot',
      'web-push',
    ]);
    expect(
      effectiveLevel({
        principal: principal('SESSION_VERIFIED'),
        channelMaxLevel: channelMaxLevel('sms'),
      }),
    ).toBe('CHANNEL_IDENTITY');
    expect(
      effectiveLevel({
        principal: principal('ANONYMOUS'),
        channelMaxLevel: channelMaxLevel('pwa'),
      }),
    ).toBe('ANONYMOUS');
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
