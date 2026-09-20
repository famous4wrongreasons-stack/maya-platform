// Gate 6 on the live path — «Gate 6 in full» through the real pipeline (GATES-PLAN-V11 U6-L1).
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT.
//
// It proves that slot 6 RUNS the block: that each subject reaches Gate 6 at all (slots 1-5 admit it),
// that the verdict is the block's verdict, that a refusal stops at '6' with `gates_run` 6 and writes
// nothing, and that the branches the block forbids an owner on reach no owner. `GATE MODULE EXISTS !=
// GATE ENFORCED` is the rule this file answers.
//
// It is NOT evidence under §0.5. Every record here is written by `Fixtures.widget` plus the harness's
// `[synthetic record]` update — not by a production trigger — so no line of it carries an `[E-MINT]`,
// `[E-HOSTILE]`, `[E-DRIFT]`, `[E-TAMPER]` or `[E-INDEP]` label, and nothing it shows may flip a
// clause (D-17, HAR-12). E1-G6 rewrites these cases onto T-2b records with manifest lines and the
// integrator flips G6-1…G6-7, G6-15…G6-20 and G6-FR14 there.
//
// THREE KINDS OF CASE, kept apart because they carry different weight:
//
//   P-*  a subject the block ADMITS. The claim is "slot 6 did not stop it", never "it reached slot 9":
//        the slot after 6 moves as Wave 1 lands, so the assertion is about 6.
//   N-*  a subject the block REFUSES, on a path a conformant record can reach. `stopped_at_gate '6'`,
//        `insufficient_authority`, the branch's own detail, and zero durable writes.
//   S-*  a subject Gate 5 SHADOWS. A TOOL ref and an unregistered key both derive
//        `STEP_UP_VERIFIED` (K4's fail-closed floor), so on a conformant build they never reach 6.
//        These assert the ADMISSIBLE WORLDS — stop at 5, or stop at 6 — so the file is true on the
//        unmutated tree and on the runner's neutralised mirrors alike, and the mutants that make slot
//        6 useless are killed by the same test. §0.5's E-INDEP is how they become L-T at E1.
//
// The AE branch is absent from this file on purpose: D-4 forbids minting a DRAFT, REQUEST_APPROVAL or
// COMMIT on the proof database before P-DISCHARGE, and an AE subject is only ever one of those. It is
// covered [RI] in `src/widgets/gates/gate6.spec.ts` and is BLOCKED-DISCHARGE in the audit.

import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { UserRole } from '../../src/common/domain.enums';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import { WidgetEmitterService } from '../../src/widgets/emission/emitter.service';
import { WidgetStoresService } from '../../src/widgets/stores/widget-stores.service';
import { AiToolPolicyService } from '../../src/ai-tools/ai-tool-policy.service';
import { EntitlementsService } from '../../src/entitlements/entitlements.service';
import * as c9Registry from '../../src/orchestration/c9.registry';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import {
  Fixtures,
  type TenantFixture,
  type UserFixture,
  type WidgetFixture,
} from './support/fixtures';
import {
  bootHttp,
  GATEWAY_SCOPE,
  type HttpHarness,
} from './support/http-bootstrap';

/** The slots at or before 6. A stop outside this set is a stop AFTER slot 6 (`'8-R'` is a slot id). */
const AT_OR_BEFORE_SIX = ['0', '1', '2', '3', '4', '5', '6'];

/** `widgets.controller.ts`'s response: these eleven keys and no other. */
const CONTROLLER_KEYS = [
  'code',
  'contract',
  'gates_run',
  'gates_total',
  'next_envelope',
  'outcome',
  'owner_decision',
  // P-RENDER (IR-REN-1): R3.9.3's `reason_text`, the one member SH-22 admits on this response.
  'reason_text',
  'receipt_outcome',
  'resolved_widget',
  'stopped_at_gate',
];

/** Columns `[synthetic record]` sets. `Fixtures.widget` mints `NONE`/priority 0 and nothing else. */
interface Subject {
  readonly effect: string;
  readonly capabilitySpace?: string | null;
  readonly capabilityKey?: string | null;
  readonly handoffSpace?: string | null;
  readonly handoffKey?: string | null;
  readonly targetJson?: Record<string, unknown> | null;
  /** Not a floor term (AREA-A §3.1), so it is set without a recompute. */
  readonly c9Domain?: string | null;
}

/**
 * A conformant §3.8 submission (P-F88's DTO). Built here rather than through a harness helper
 * because the shared bootstrap bodies still send `{intent_token}` alone and the closed DTO refuses
 * that with a 400 (IR-F88-3, not this unit's).
 */
const submissionBody = (record: WidgetFixture): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: record.widgetId,
  intent_token: record.intentToken,
  inputs: null,
  client_nonce: randomUUID(),
  profile_id: 'widgets-live-gate6',
});

describe('Gate 6 — may THIS principal exercise THIS capability (C11:4725, 4736-4798)', () => {
  let env: FixtureContext;

  beforeAll(async () => {
    env = await bootFixtureContext();
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  /** One minted record carrying `subject`, through the real writers plus the synthetic update. */
  const mint = async (
    fx: Fixtures,
    tenant: TenantFixture,
    actor: Readonly<AuthenticatedUser>,
    subject: Subject,
  ): Promise<WidgetFixture> => {
    const { c9Domain, ...columns } = subject;
    const record = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    // `[synthetic record]`: the columns no writer produces today. The floor is recomputed from the
    // updated row (G6 §7.2), so Gate 5's stored-vs-recomputed comparison passes and slot 6 is
    // reached for the reason the case is about.
    await fx.synthetic(record, columns);
    if (c9Domain !== undefined)
      await env.prisma.widgetIntentRecord.update({
        where: {
          intentTokenHash_tenantId: {
            intentTokenHash: record.intentTokenHash,
            tenantId: record.tenantId,
          },
        },
        // `c9_domain` is not a term of `verificationFloor`, so no recompute follows it.
        data: { c9Domain },
      });
    return record;
  };

  // ── [GW] the real WidgetsModule, through the gateway ───────────────────────────────────────────
  //
  // The gateway's own result is used rather than the controller's, because the route's response has
  // six keys and `detail` is not one of them — and every branch of this gate answers the same code,
  // so a test that could not see the detail could not tell which fence fired. The [HTTP] block below
  // asserts the route's shape.
  describe('[GW] the block, branch by branch, on the real pipeline', () => {
    let gw: GatewayHarness;
    let fx: Fixtures;
    let tenant: TenantFixture;
    let user: UserFixture;
    let actor: Readonly<AuthenticatedUser>;
    let owners: {
      canExecute: jest.SpyInstance;
      hasFeature: jest.SpyInstance;
      c9: jest.SpyInstance;
    };

    beforeAll(async () => {
      gw = await bootGateway();
      fx = new Fixtures(env, gw);
      tenant = await fx.tenant('G6');
      await fx.grantFeature(tenant, 'ai.admin');
      await fx.grantFeature(tenant, 'booking');
      user = await fx.user(tenant, UserRole.ADMINISTRATOR);
      actor = await fx.actor(tenant, user);
    }, 120_000);

    beforeEach(() => {
      // The three admission mechanisms the block names. Spied on the REAL prototypes, so "not
      // called" is a statement about the running pipeline and not about a double.
      owners = {
        canExecute: jest.spyOn(
          AiToolPolicyService.prototype,
          'assertCanExecute',
        ),
        hasFeature: jest.spyOn(EntitlementsService.prototype, 'hasFeature'),
        c9: jest.spyOn(c9Registry, 'c9Capability'),
      };
    });
    afterEach(() => {
      jest.restoreAllMocks();
      gw.recorder.clear();
    });
    afterAll(async () => {
      await fx?.teardown();
      await gw?.close();
    });

    /** Submit one subject and answer with the gateway's verdict, its stop and its writes. */
    const run = async (scope: string, subject: Subject) => {
      const record = await mint(fx, tenant, actor, subject);
      gw.recorder.clear();
      const result = await gw.submit(actor, submissionBody(record), scope);
      return {
        scope,
        stop: result.stoppedAt,
        ran: result.ran,
        outcome: result.verdict.outcome,
        code: 'code' in result.verdict ? result.verdict.code : null,
        detail: 'detail' in result.verdict ? (result.verdict.detail ?? '') : '',
        writes: gw.recorder.writes(scope),
      };
    };

    /** A subject the block ADMITS: slot 6 is reached and does not stop it. */
    const admits = async (scope: string, subject: Subject) => {
      const r = await run(scope, subject);
      expect({
        scope,
        pastSix: !AT_OR_BEFORE_SIX.includes(String(r.stop)),
        stop: r.stop,
        detail: r.detail,
      }).toEqual({ scope, pastSix: true, stop: r.stop, detail: r.detail });
      expect({ scope, writes: r.writes }).toEqual({ scope, writes: [] });
      return r;
    };

    /** A subject the block REFUSES at slot 6, with its own detail and no durable write. */
    const refuses = async (scope: string, subject: Subject, detail: string) => {
      const r = await run(scope, subject);
      expect({
        scope,
        stop: r.stop,
        ran: r.ran,
        outcome: r.outcome,
        code: r.code,
        detail: r.detail,
      }).toEqual({
        scope,
        stop: '6',
        ran: 6,
        outcome: 'refuse',
        code: 'insufficient_authority',
        detail,
      });
      expect({ scope, writes: r.writes }).toEqual({ scope, writes: [] });
      return r;
    };

    const noOwnerReached = (scope: string) => {
      expect({
        scope,
        assertCanExecute: owners.canExecute.mock.calls.length,
        c9Capability: owners.c9.mock.calls.length,
      }).toEqual({ scope, assertCanExecute: 0, c9Capability: 0 });
    };

    it('P-NULL / P-NULL-DETAIL [GW]: a `w`, `i`, `s` or `detail` NAVIGATE has no subject, passes slot 6 and reaches no owner (G6-5; A5 adds no branch, M28)', async () => {
      for (const cls of ['w', 'i', 's', 'detail']) {
        const scope = `P-NULL ${cls}`;
        await admits(scope, {
          effect: 'NAVIGATE',
          capabilitySpace: null,
          capabilityKey: null,
          targetJson: { class: cls, route: '/x' },
        });
        noOwnerReached(scope);
      }
    }, 120_000);

    it('P-CONTROL / P-CONTROL-HANDLER [GW]: a CONTROL subject passes slot 6 with NO execute-admission test (G6-18, C11:4771-4773)', async () => {
      // The handler's own principal and tenant check (R3.2.4) is Gate 13's, and U13a/U13b prove it
      // there. What slot 6 must show is the absence: no owner is asked whether this principal may
      // execute a control, because the block names none.
      for (const key of ['control.widget.dismiss', 'control.run.cancel']) {
        const scope = `P-CONTROL ${key}`;
        await admits(scope, {
          effect: 'CONTROL',
          capabilitySpace: 'CONTROL',
          capabilityKey: key,
        });
        noOwnerReached(scope);
      }
    }, 120_000);

    it('N-HANDOFF-UNREG-CONTROL [GW]: an unregistered CONTROL destination is Gate 6’s first refusal, because FLOOR_EXEMPT waived Gate 5', async () => {
      // A class-`s` HANDOFF at priority 0 with a null capability is FLOOR_EXEMPT, so the floor is
      // ANONYMOUS and Gate 5 admits it. Registration in the destination's own space is then the
      // first fence it meets, and it is Gate 6's.
      await refuses(
        'N-HANDOFF-UNREG-CONTROL',
        {
          effect: 'HANDOFF',
          capabilitySpace: null,
          capabilityKey: null,
          handoffSpace: 'CONTROL',
          handoffKey: 'control.not.registered',
          targetJson: { class: 's' },
        },
        'HANDOFF destination is not registered in its space',
      );
    }, 60_000);

    it('P-HANDOFF-A22 / P-HANDOFF-BI / P-HANDOFF-AE / P-HANDOFF-NOEXEC / P-HANDOFF-SCHEDULE-UPDATE [GW]: a HANDOFF resolves the destination fences ONLY (G6-6, G6-7)', async () => {
      // Each of these would be refused by an execute-admission test, and each must pass:
      //   a22.configuration under a BUSINESS_INTELLIGENCE run — `c9Capability` would refuse it, as
      //     the certified note says it must not (C11:4790-4798);
      //   an AE destination — it carries no `AE_WIDGET_COMMIT_ALLOWLIST` row;
      //   a catalogue key — `assertCanExecute` would be the test, and is not applied;
      //   `staff.schedule.update` — B-03's case, admitted as a destination.
      const cases: readonly [string, Subject][] = [
        [
          'P-HANDOFF-A22',
          {
            effect: 'HANDOFF',
            handoffSpace: 'C9',
            handoffKey: 'a22.configuration',
            targetJson: { class: 's' },
            capabilitySpace: null,
            capabilityKey: null,
          },
        ],
        [
          'P-HANDOFF-BI',
          {
            effect: 'HANDOFF',
            handoffSpace: 'C9',
            handoffKey: 'a22.configuration',
            targetJson: { class: 's' },
            capabilitySpace: null,
            capabilityKey: null,
            c9Domain: 'BUSINESS_INTELLIGENCE',
          },
        ],
        [
          'P-HANDOFF-AE',
          {
            effect: 'HANDOFF',
            handoffSpace: 'AE',
            handoffKey: 'crm.visit.payment.v1',
            targetJson: { class: 's' },
            capabilitySpace: null,
            capabilityKey: null,
          },
        ],
        [
          'P-HANDOFF-NOEXEC',
          {
            effect: 'HANDOFF',
            handoffSpace: 'C9',
            handoffKey: 'catalog.services.read',
            targetJson: { class: 's' },
            capabilitySpace: null,
            capabilityKey: null,
          },
        ],
        [
          'P-HANDOFF-SCHEDULE-UPDATE',
          {
            effect: 'HANDOFF',
            handoffSpace: 'C9',
            handoffKey: 'staff.schedule.update',
            targetJson: { class: 's' },
            capabilitySpace: null,
            capabilityKey: null,
          },
        ],
      ];
      for (const [scope, subject] of cases) {
        await admits(scope, subject);
        noOwnerReached(scope);
      }
    }, 180_000);

    it('P-HANDOFF-W-NONSENS [GW]: a NON-sensitive destination is admitted at a `w` target — F48 constrains the class only where the destination is sensitive', async () => {
      await admits('P-HANDOFF-W-NONSENS', {
        effect: 'HANDOFF',
        capabilitySpace: null,
        capabilityKey: null,
        handoffSpace: 'C9',
        handoffKey: 'settings.update',
        targetJson: { class: 'w', route: '/settings' },
      });
    }, 60_000);

    it('N-HANDOFF-SENS-C9 / N-HANDOFF-SENS-C9b [GW]: a SENSITIVE destination admits a class-`s` target and nothing else (R3.5.1 at Gate 6, F48)', async () => {
      const sensitive = (key: string, cls: string): Subject => ({
        effect: 'HANDOFF',
        capabilitySpace: null,
        capabilityKey: null,
        handoffSpace: 'C9',
        handoffKey: key,
        targetJson: { class: cls, route: '/r' },
      });
      // The positive first, so the refusals below are about the CLASS and not about the key.
      await admits(
        'N-HANDOFF-SENS-C9 (control: class s passes)',
        sensitive('owner_report.download', 's'),
      );
      await refuses(
        'N-HANDOFF-SENS-C9',
        sensitive('owner_report.download', 'w'),
        'a sensitive HANDOFF destination admits a class-s target and nothing else',
      );
      await refuses(
        'N-HANDOFF-SENS-C9b',
        sensitive('clients.dossier.read', 'detail'),
        'a sensitive HANDOFF destination admits a class-s target and nothing else',
      );
    }, 120_000);

    it('P-F48-NONHANDOFF [GW]: a SENSITIVE subject OUTSIDE a HANDOFF passes slot 6 — A1’s change, and the reason the old slot-6 predicate had to go', async () => {
      // `owner_report.download` is `personal_data`. The check this unit replaced refused it on every
      // effect; V1.1 puts Gate 6's evaluation of SENSITIVE_DEST in the HANDOFF branch only
      // (C11:1836), leaving R3.5.1's general form to EP-MINT and INV-8′ where it is stated.
      await admits('P-F48-NONHANDOFF', {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'owner_report.download',
      });
    }, 60_000);

    it('P-C9-9-RUNLESS [GW]: on a run-less mint path `c9_domain` is null and `c9Capability` is NOT called (G6-17, R3.7.1)', async () => {
      const scope = 'P-C9-9-RUNLESS';
      await admits(scope, {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'owner_report.status',
        c9Domain: null,
      });
      noOwnerReached(scope);
    }, 60_000);

    it('P-C9-9-RUN [GW]: with `c9_domain` non-null `c9Capability` IS called, with the record’s domain and the registry hash (G6-16)', async () => {
      const scope = 'P-C9-9-RUN';
      await admits(scope, {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'owner_report.status',
        c9Domain: 'ADMIN',
      });
      const c9Calls = owners.c9.mock.calls as unknown[][];
      expect({
        scope,
        calls: c9Calls.map((call) => [call[0], call[1], typeof call[2]]),
      }).toEqual({
        scope,
        calls: [['owner_report.status', 'ADMIN', 'string']],
      });
      // ...and the catalogue owner is still not reached: this is the NINE's branch.
      expect(owners.canExecute.mock.calls.length).toBe(0);
    }, 60_000);

    it('N-C9-DOMAIN / N-OWNER-THROW-C9 [GW]: a domain the key is not registered for refuses, and the RAISE is the refusal (G6-20, C11:4779-4781)', async () => {
      const r = await run('N-C9-DOMAIN', {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'owner_report.status',
        c9Domain: 'OCCUPANCY',
      });
      // A raise at a refusal point answers 200/refuse, never a 500 and never a pass.
      expect({
        stop: r.stop,
        ran: r.ran,
        outcome: r.outcome,
        code: r.code,
        raised: r.detail.startsWith('owner raised:'),
        writes: r.writes,
      }).toEqual({
        stop: '6',
        ran: 6,
        outcome: 'refuse',
        code: 'insufficient_authority',
        raised: true,
        writes: [],
      });
    }, 60_000);

    it('N-C9-BI [GW]: a non-`READ` destination under BUSINESS_INTELLIGENCE is refused OUTSIDE a HANDOFF, and admitted as a destination inside one', async () => {
      // The two halves of the same key, side by side, are the whole of the block's scoping note.
      await refusesRaise('N-C9-BI', {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'a22.configuration',
        c9Domain: 'BUSINESS_INTELLIGENCE',
      });
      await admits('N-C9-BI (the same key as a destination)', {
        effect: 'HANDOFF',
        capabilitySpace: null,
        capabilityKey: null,
        handoffSpace: 'C9',
        handoffKey: 'a22.configuration',
        targetJson: { class: 's' },
        c9Domain: 'BUSINESS_INTELLIGENCE',
      });
    }, 120_000);

    it('P-C9-47 [GW]: C20 admits through the real policy owner using the in-T principal role', async () => {
      const scope = 'P-C9-47';
      await admits(scope, {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'catalog.services.read',
      });
      expect(owners.canExecute.mock.calls.length).toBe(1);
      const calls = owners.canExecute.mock.calls as unknown[][];
      const principal = calls[0]?.[0] as {
        tenantId: string;
        userId: string;
        role: string;
        surface: string;
      };
      expect(principal).toMatchObject({
        tenantId: tenant.id,
        userId: user.id,
        role: UserRole.ADMINISTRATOR,
        surface: 'web',
      });
    }, 60_000);

    // S-TOOL and S-REG are ONE property, run as TWO tests. A TOOL ref and an unregistered C9 key both
    // derive `STEP_UP_VERIFIED` (K4's fail-closed floor), and a pwa session caps at SESSION_VERIFIED,
    // so on a conformant build they stop at slot 5 and never reach Gate 6. On the runner's mirror
    // where Gate 5's level comparison is neutralised (`N6-FLOOR`) they reach it and must stop there.
    // Asserting the admissible WORLDS — {5, 6}, never past 6 — is what makes each test true on both
    // builds; asserting the DETAIL at 6 is what makes it true about the right fence. They are separate
    // tests because a mutation killer names a test by its title, and one title cannot name two.
    const shadowed = async (
      scope: 'S-TOOL' | 'S-REG',
      subject: Subject,
      detail: string,
    ) => {
      const r = await run(scope, subject);
      expect({
        scope,
        stop: ['5', '6'].includes(String(r.stop))
          ? r.stop
          : `${r.stop} (expected 5 or 6)`,
      }).toEqual({ scope, stop: r.stop });
      expect({ scope, outcome: r.outcome, writes: r.writes }).toEqual({
        scope,
        outcome: 'refuse',
        writes: [],
      });
      // `c9.not.registered` has no `WIDGET_CAPABILITY_POLICY` row either, so a build whose REGISTRY
      // check was deleted would still refuse at slot 6 — for the wrong reason. The detail is what
      // tells the two apart, and it is why M20b is killed here rather than by the stop.
      if (r.stop === '6')
        expect({ scope, code: r.code, detail: r.detail }).toEqual({
          scope,
          code: 'insufficient_authority',
          detail,
        });
    };

    it('S-TOOL [GW]: a TOOL-spaced subject stops at slot 5 (Gate 5 shadows it) or at slot 6, never past 6, and at 6 it is the TOOL refusal', async () => {
      await shadowed(
        'S-TOOL',
        {
          effect: 'REFINE',
          capabilitySpace: 'TOOL',
          capabilityKey: 'catalog.services.read',
        },
        'a TOOL ref may not be an intent subject',
      );
    }, 120_000);

    it('S-REG [GW]: an unregistered C9 key stops at slot 5 or at slot 6, never past 6, and at 6 it is the REGISTRY refusal and not the policy-row one', async () => {
      await shadowed(
        'S-REG',
        {
          effect: 'REFINE',
          capabilitySpace: 'C9',
          capabilityKey: 'c9.not.registered',
        },
        'unregistered C9 key',
      );
    }, 120_000);

    it('N-CONTROL-FOREIGN [GW]: a CONTROL record submitted by another principal never reaches slot 6 — Gate 3 binds it first (R3.2.4 is the handler’s, at Gate 13)', async () => {
      // The control case for P-CONTROL-HANDLER: slot 6 does no principal check of its own, and it
      // does not need one, because a foreign principal has already been refused at slot 3.
      const other = await fx.user(tenant, UserRole.MANAGER, 'foreign');
      const otherActor = await fx.actor(tenant, other);
      const record = await mint(fx, tenant, actor, {
        effect: 'CONTROL',
        capabilitySpace: 'CONTROL',
        capabilityKey: 'control.widget.dismiss',
      });
      const scope = 'N-CONTROL-FOREIGN';
      gw.recorder.clear();
      const result = await gw.submit(otherActor, submissionBody(record), scope);
      expect({
        scope,
        stop: result.stoppedAt,
        code: 'code' in result.verdict ? result.verdict.code : null,
        writes: gw.recorder.writes(scope),
      }).toEqual({
        scope,
        stop: '3',
        code: 'widget_principal_mismatch',
        writes: [],
      });
    }, 120_000);

    /** A refusal whose detail is the raise's message: the text carries the owner's words. */
    async function refusesRaise(scope: string, subject: Subject) {
      const r = await run(scope, subject);
      expect({
        scope,
        stop: r.stop,
        code: r.code,
        raised: r.detail.startsWith('owner raised:'),
        writes: r.writes,
      }).toEqual({
        scope,
        stop: '6',
        code: 'insufficient_authority',
        raised: true,
        writes: [],
      });
    }
  });

  // ── [HTTP] AppModule behind all six global guards ──────────────────────────────────────────────
  describe('[HTTP] the route, behind every global guard', () => {
    let http: HttpHarness;
    let fx: Fixtures;
    let tenant: TenantFixture;

    beforeAll(async () => {
      http = await bootHttp();
      fx = new Fixtures(env, {
        stores: http.app.get(WidgetStoresService),
        emitter: http.app.get(WidgetEmitterService),
      });
      tenant = await fx.tenant('G6 HTTP');
      await fx.grantFeature(tenant, 'widgets.runtime');
    }, 180_000);
    afterEach(() => {
      jest.restoreAllMocks();
      http.recorder.clear();
    });
    afterAll(async () => {
      await fx?.teardown();
      await http?.close();
    });

    const principalOf = async (role: UserRole, marker: string) => {
      const user = await fx.user(tenant, role, marker);
      const token = await http.login(tenant.slug, user.email, user.password);
      return { actor: await fx.actorFromAccessToken(token), token };
    };

    it('SMOKE-G6-HANDOFF-SENS [HTTP]: behind every guard, a sensitive destination at a `w` target stops at slot 6 with no write', async () => {
      const { actor, token } = await principalOf(
        UserRole.ADMINISTRATOR,
        'sens',
      );
      const record = await mint(fx, tenant, actor, {
        effect: 'HANDOFF',
        capabilitySpace: null,
        capabilityKey: null,
        handoffSpace: 'C9',
        handoffKey: 'owner_report.download',
        targetJson: { class: 'w', route: '/r' },
      });
      http.recorder.clear();
      const res = await http.postIntent(token, submissionBody(record));
      expect(Object.keys(res.body as object).sort()).toEqual(CONTROLLER_KEYS);
      // IR-REN-1 (P-RENDER, merged in batch A): R3.9.3's rendering travels with the refusal, so the
      // body is asserted in two parts — the verdict exactly, and the rendering by its phrase key. The
      // rendered string itself is the reason table's, not this gate's, and pinning it here would make
      // Gate 6's smoke fail on a wording change (`rendering/reason-table` is where that is held).
      const { reason_text: reason, ...verdictBody } = res.body as Record<
        string,
        unknown
      >;
      expect({ status: res.status, body: verdictBody }).toEqual({
        status: 200,
        body: {
          contract: 'maya.widget.intent/1',
          outcome: 'refuse',
          code: 'insufficient_authority',
          stopped_at_gate: '6',
          gates_run: 6,
          gates_total: 15,
          next_envelope: null,
          owner_decision: null,
          receipt_outcome: null,
          resolved_widget: null,
        },
      });
      expect((reason as { phrase_key?: unknown } | undefined)?.phrase_key).toBe(
        'widget.refusal.insufficient_authority',
      );
      expect(
        typeof (reason as { rendered?: unknown } | undefined)?.rendered,
      ).toBe('string');
      // The route's answer carries no detail, so the refusal says which GATE and not which key.
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    }, 180_000);

    it('SMOKE-G6-HANDOFF-BI / SMOKE-G6-C9-9-DOMAIN [HTTP]: a BI destination is admitted and a BI-unregistered subject is refused, on the same key', async () => {
      const { actor, token } = await principalOf(UserRole.ADMINISTRATOR, 'bi');
      const asHandoff = await mint(fx, tenant, actor, {
        effect: 'HANDOFF',
        capabilitySpace: null,
        capabilityKey: null,
        handoffSpace: 'C9',
        handoffKey: 'a22.configuration',
        targetJson: { class: 's' },
        c9Domain: 'BUSINESS_INTELLIGENCE',
      });
      const asRefine = await mint(fx, tenant, actor, {
        effect: 'REFINE',
        capabilitySpace: 'C9',
        capabilityKey: 'a22.configuration',
        c9Domain: 'BUSINESS_INTELLIGENCE',
      });

      http.recorder.clear();
      const admitted = (await http.postIntent(token, submissionBody(asHandoff)))
        .body as Record<string, unknown>;
      expect({
        stop: admitted.stopped_at_gate,
        pastSix: !AT_OR_BEFORE_SIX.includes(String(admitted.stopped_at_gate)),
      }).toEqual({ stop: admitted.stopped_at_gate, pastSix: true });

      http.recorder.clear();
      const refused = (await http.postIntent(token, submissionBody(asRefine)))
        .body as Record<string, unknown>;
      expect({
        outcome: refused.outcome,
        code: refused.code,
        stop: refused.stopped_at_gate,
        ran: refused.gates_run,
      }).toEqual({
        outcome: 'refuse',
        code: 'insufficient_authority',
        stop: '6',
        ran: 6,
      });
      expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
    }, 240_000);

    it('SMOKE-G6-BODY [HTTP]: an `authority_hint` or a `role` in the body is refused at the shape stage, before any gate runs (F88, G6-2)', async () => {
      // E-HOSTILE in shape: the client's bytes cannot carry an authority input, and the proof is that
      // the request never reaches the pipeline rather than that Gate 6 ignores the field.
      //
      // Two different mechanisms, and the distinction matters. `authority_hint` is NOT one of F88's
      // twenty-eight keys; it is refused at depth 0 because `SubmitIntentDto` declares no such member
      // and the global pipe runs with `forbidNonWhitelisted` — §3.8's "the absence IS the guarantee".
      // `role`, `is_owner` and `permissions` ARE F88 keys, so the walk refuses them at any depth,
      // including inside `inputs`, where a closed-domain value would otherwise be admitted.
      const { actor, token } = await principalOf(
        UserRole.ADMINISTRATOR,
        'body',
      );
      const record = await mint(fx, tenant, actor, {
        effect: 'NAVIGATE',
        capabilitySpace: null,
        capabilityKey: null,
        targetJson: { class: 'w', route: '/x' },
      });
      for (const extra of [
        { authority_hint: 'owner' },
        { role: 'escape' },
        { inputs: { role: 'escape' } },
        { inputs: { is_owner: true } },
        { inputs: { permissions: 'all' } },
      ]) {
        http.recorder.clear();
        const res = await http.postIntent(token, {
          ...submissionBody(record),
          ...extra,
        });
        expect({ extra, status: res.status }).toEqual({ extra, status: 400 });
        expect({ extra, writes: http.recorder.writes(GATEWAY_SCOPE) }).toEqual({
          extra,
          writes: [],
        });
      }
    }, 180_000);

    it('FR14-VAR [HTTP]: the same subject under a client-, staff- and owner-class principal gives the SAME Gate 6 verdict (FR-14, C11:1798)', async () => {
      // The absence proof is `gate6.source.spec.ts` S-FR14, and it is the stronger of the two. This
      // is the behavioural half: the three presentation classes B-02 derives (`client`, `staff`,
      // `owner`) are varied over one subject and the verdict must not move. Each principal needs its
      // own record, because `principal_proof_hash` binds a record to one principal and a shared one
      // would stop at Gate 3 — so what is held constant is the SUBJECT, which is what FR-14 is about.
      //
      // The E-INDEP form the card names (neutraliser `NPM`, `ctx.principal.presentationMode`
      // overridden per request) is a MERGE-STEP exit: `ctx.principal` is null on every request until
      // the integrator's IR-P-GW lands P-PRINCIPAL's principal step, so there is nothing to override.
      const verdicts: Record<string, unknown>[] = [];
      for (const [marker, role] of [
        ['fr14-owner', UserRole.TENANT_OWNER],
        ['fr14-staff', UserRole.ADMINISTRATOR],
        ['fr14-client', UserRole.CLIENT],
      ] as const) {
        const { actor, token } = await principalOf(role, marker);
        const record = await mint(fx, tenant, actor, {
          effect: 'HANDOFF',
          capabilitySpace: null,
          capabilityKey: null,
          handoffSpace: 'C9',
          handoffKey: 'owner_report.download',
          targetJson: { class: 'w', route: '/r' },
        });
        http.recorder.clear();
        const body = (await http.postIntent(token, submissionBody(record)))
          .body as Record<string, unknown>;
        verdicts.push({
          role,
          outcome: body.outcome,
          code: body.code,
          stopped_at_gate: body.stopped_at_gate,
          gates_run: body.gates_run,
        });
        expect(http.recorder.writes(GATEWAY_SCOPE)).toEqual([]);
      }
      /** The verdict without the role that produced it: what FR-14 says must not move. */
      const answer = (v: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'role'));
      expect(verdicts.map(answer)).toEqual([
        answer(verdicts[0]),
        answer(verdicts[0]),
        answer(verdicts[0]),
      ]);
      expect(answer(verdicts[0])).toEqual({
        outcome: 'refuse',
        code: 'insufficient_authority',
        stopped_at_gate: '6',
        gates_run: 6,
      });
    }, 300_000);
  });
});
