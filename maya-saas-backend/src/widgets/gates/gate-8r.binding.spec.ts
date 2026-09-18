// T-BIND / T-WIRED-8R / T17 — what the real module binds, what the slot passes, and where it sits.
//
// Row 8-R's last clause has no ruled content this cycle: nothing in V1.1 states the closed
// affirmation vocabulary's members, its owner or its publication (G8R A1/A2), and the packet settles
// it out of scope — "The readback vocabulary waits for a SPOKEN carrier" (PKT:471). GATES-PLAN-V11
// §0.5's U class admits that only on one condition: the mechanism must be COMPLETE against its owner
// interface and fail closed, with the production binding proven to be the empty one. That proof is
// T-BIND, and it is the reason this file boots the real `WidgetsModule` instead of asserting over a
// constant: a null in `gate-8r.owners.ts` says nothing about what the module actually provides.
//
// `PrismaService` is stubbed with `{}` because only DI resolution is under test (the same stub
// `widget-owner-ports.module.spec.ts` uses). No database is touched and none is needed.
//
// MERGE FIX (U8R's merge): booting `WidgetsModule` in isolation now needs `ConfigModule` global and a
// `CRM_ENCRYPTION_KEY`, because P-PRINCIPAL binds `PRINCIPAL_RESOLVER` through `C9Module` (D-6 imports
// owners as MODULES) and that module reaches `ActionEngineModule`, whose factory refuses to build
// without an attestation/identity/payload secret. The application supplies these from its
// environment; an isolated module test has to supply them too. They are test literals, and no secret
// of any deployment is in this file — the same disclosure `widget-owner-ports.module.spec.ts` carries.

import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { GATE_8R_OWNERS } from '../di-tokens';
import { pipelineSources } from '../gate-slots.spec-helper.spec';
import { WidgetsModule } from '../widgets.module';
import { GATE_8R_OWNERS_UNRULED } from './gate-8r.owners';

/** What the real module answers for the token: the bound value, or the fact that nothing is bound. */
const OWNER_MODULE_CONFIG: Readonly<Record<string, string>> = {
  CRM_ENCRYPTION_KEY: 'gate-8r-binding-spec-crm-encryption-key-0123456789',
};

const resolveOwners = async (): Promise<
  { bound: true; value: unknown } | { bound: false; why: string }
> => {
  const restore = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(OWNER_MODULE_CONFIG)) {
    restore.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await resolveOwnersInModule();
  } finally {
    for (const [key, value] of restore)
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
};

const resolveOwnersInModule = async (): Promise<
  { bound: true; value: unknown } | { bound: false; why: string }
> => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      WidgetsModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  try {
    return { bound: true, value: moduleRef.get<unknown>(GATE_8R_OWNERS) };
  } catch (error) {
    return { bound: false, why: (error as Error).message };
  } finally {
    await moduleRef.close();
  }
};

/** Slot 8-R's element of the gateway array, as source. */
const slot8RSource = (): string => {
  const unit = pipelineSources().slotUnits.find(
    (u) => u.slot === '8-R' && u.file.endsWith('#slot-8-R'),
  );
  if (!unit) throw new Error('the gateway array has no slot 8-R');
  return unit.source;
};

describe('Gate 8-R — the production binding, the wiring and the position', () => {
  it('T-BIND: whatever the real WidgetsModule binds for GATE_8R_OWNERS is the unruled owner set — the vocabulary is empty in production until A1/A2 are ruled', async () => {
    const resolved = await resolveOwners();
    if (resolved.bound) {
      // The identity matters, not just the shape: a second frozen `{ isReadbackAffirmation: null }`
      // would pass a structural check and would be a second place to bind a vocabulary later.
      expect(resolved.value).toBe(GATE_8R_OWNERS_UNRULED);
      expect(GATE_8R_OWNERS_UNRULED.isReadbackAffirmation).toBeNull();
    } else {
      // Before R8R-1 the token is unbound and the gate uses the same value as its default (U8R's
      // add-only interim, `gate8r.ts`). The claim — production admits no affirmation — holds either
      // way, and `T-BIND-WIRED` below is what stops the interim becoming permanent by omission.
      expect(resolved.why).toContain(GATE_8R_OWNERS);
      expect(GATE_8R_OWNERS_UNRULED.isReadbackAffirmation).toBeNull();
    }
  }, 30_000);

  it('T-BIND-WIRED: GATE_8R_OWNERS resolves from the real WidgetsModule (the provider R8R-1 adds)', async () => {
    const resolved = await resolveOwners();
    expect(resolved.bound).toBe(true);
  }, 30_000);

  it('T-WIRED-8R: slot 8-R passes the INJECTED owner set to `gate8R`, not the file default', () => {
    expect(slot8RSource()).toMatch(/gate8R\(\s*ctx\s*,\s*this\.gate8ROwners/);
  });

  it('T-WIRED-8R control: the rule flips exactly with the argument, so its red is about the wiring and nothing else', () => {
    const rule = /gate8R\(\s*ctx\s*,\s*this\.gate8ROwners/;
    expect(rule.test('run: (ctx) => gate8R(ctx, this.gate8ROwners),')).toBe(
      true,
    );
    expect(rule.test('run: (ctx) => gate8R(ctx),')).toBe(false);
    // And since R8R-1 (U8R's merge) the slot is the FIRST of those two: the control says the rule can
    // tell them apart, and T-WIRED-8R above says which one the gateway holds.
    expect(slot8RSource()).not.toMatch(/gate8R\(ctx\)/);
  });

  it('T17: 8-R is the slot between 8 and 9, spelled `8-R`, in the array the gateway is built from', () => {
    const order = pipelineSources().order;
    expect(order).toContain('8-R');
    expect(order.indexOf('8')).toBeLessThan(order.indexOf('8-R'));
    expect(order.indexOf('8-R')).toBeLessThan(order.indexOf('9'));
    expect(order.indexOf('8-R')).toBe(order.indexOf('8') + 1);
  });

  it('slot 8-R carries no `pendingOn`: the gate is built, and its unruled vocabulary is a refusal rather than an absent mechanism', () => {
    expect(slot8RSource()).not.toMatch(/pendingOn/);
  });
});
