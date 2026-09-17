// What `POST /api/widgets/intent` hands the gateway, pinned.
//
// U0 item 8 moved the controller's inline derivation into `intentSubmitArgs(dto, actor)` so the live
// harness derives submit arguments the way production does instead of hand-supplying them (G9
// §4.2). The move is held here: the controller is driven over a recording gateway, and the argument
// it passes (key order included) and the response it returns are compared against literals written
// from the pre-extraction controller. The controller half ran green on the pre-extraction tree too
// (U0 S3 log).
//
// Class U: a regression aid. The route itself is proved through the HTTP harness, not here.

import { UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { SubmitIntentDto } from './dto/submit-intent.dto';
import type { IntentGatewayService } from './intent-gateway.service';
import { intentSubmitArgs } from './intent-submit-args';
import { WidgetsController } from './widgets.controller';

type SubmitArgs = Parameters<IntentGatewayService['submit']>[0];

const actor = (over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  userId: 'u-1',
  sessionId: 's-1',
  tenantId: 't-1',
  role: UserRole.ADMINISTRATOR,
  email: 'u-1@example.test',
  branchId: null,
  membershipId: 'm-1',
  membershipStatus: 'active',
  ...over,
});

const dto = (): SubmitIntentDto => ({
  intent_token: 'tok-0123456789abcdef',
  inputs: { slot: 'a' },
  readback_ack: null,
});

const recordingGateway = () => {
  const calls: SubmitArgs[] = [];
  const gateway = {
    gateCount: 15,
    submit: (args: SubmitArgs) => {
      calls.push(args);
      return Promise.resolve({
        verdict: {
          outcome: 'refuse' as const,
          code: 'mechanism_absent' as const,
          detail: 'gate 8 is pending',
        },
        stoppedAt: '8',
        ran: 8,
      });
    },
  };
  return {
    controller: new WidgetsController(
      gateway as unknown as IntentGatewayService,
    ),
    calls,
  };
};

describe('WidgetsController.intent — the arguments it hands the gateway', () => {
  // P-PRINCIPAL (D-1, D-2) took `principalProofHash` and `verificationLevel` OUT of this derivation.
  // They were computed from the JWT's four fields; they are now properties of the live principal the
  // gateway resolves inside `T`, from `C9Authority.current` and the tenancy owner's role read. The
  // members that remain are the ones the ROUTE establishes: the token, the tenant (from the actor,
  // never the body), the actor itself, the submission and the carrier.
  it('a member of a tenant: the tenant from the actor, carrier pwa, the dto and actor as given', async () => {
    const { controller, calls } = recordingGateway();
    const a = actor();
    const d = dto();
    await controller.intent(d, a);
    expect(calls).toHaveLength(1);
    const args = calls[0];
    expect(Object.keys(args)).toEqual([
      'intentToken',
      'tenantId',
      'actor',
      'submission',
      'carrier',
    ]);
    expect(args.intentToken).toBe('tok-0123456789abcdef');
    expect(args.tenantId).toBe('t-1');
    expect(args.actor).toBe(a);
    expect(args.submission).toBe(d);
    expect(args.carrier).toBe('pwa');
    expect(args.now).toBeUndefined();
  });

  it('no tenant on the actor: the tenant is the empty string, never the body', async () => {
    const { controller, calls } = recordingGateway();
    const a = actor({ tenantId: null, membershipId: null });
    await controller.intent(dto(), a);
    expect(calls[0].tenantId).toBe('');
    expect(calls[0].actor).toBe(a);
  });

  it('no level and no proof hash are derived here any more: the live principal carries both (D-2)', async () => {
    const { controller, calls } = recordingGateway();
    await controller.intent(dto(), actor({ tenantId: null, userId: '' }));
    const derived = calls[0] as unknown as Record<string, unknown>;
    expect('verificationLevel' in derived).toBe(false);
    expect('principalProofHash' in derived).toBe(false);
  });

  it('a tenant without a user id still yields the actor tenant and nothing else', async () => {
    const { controller, calls } = recordingGateway();
    await controller.intent(dto(), actor({ userId: '' }));
    expect(calls[0].tenantId).toBe('t-1');
    expect(calls[0].carrier).toBe('pwa');
  });

  it('the response carries the verdict, the stop and the counts, and nothing else', async () => {
    const { controller } = recordingGateway();
    const response = await controller.intent(dto(), actor());
    expect(JSON.stringify(response)).toBe(
      JSON.stringify({
        contract: 'maya.widget.intent/1',
        outcome: 'refuse',
        code: 'mechanism_absent',
        stopped_at_gate: '8',
        gates_run: 8,
        gates_total: 15,
      }),
    );
  });
});

describe("intentSubmitArgs — the controller's derivation, callable by a harness", () => {
  const actors: ReadonlyArray<readonly [string, AuthenticatedUser]> = [
    ['a member of a tenant', actor()],
    ['no tenant', actor({ tenantId: null, membershipId: null })],
    ['no tenant and no user', actor({ tenantId: null, userId: '' })],
    ['a tenant without a user id', actor({ userId: '' })],
  ];

  it.each(actors)(
    '%s: identical, member by member and in order, to what the controller hands the gateway',
    async (_name, a) => {
      const { controller, calls } = recordingGateway();
      const d = dto();
      await controller.intent(d, a);
      const direct = intentSubmitArgs(d, a);
      expect(Object.keys(direct)).toEqual(Object.keys(calls[0]));
      for (const key of Object.keys(direct) as (keyof SubmitArgs)[])
        expect(direct[key]).toBe(calls[0][key]);
    },
  );

  it('a body that smuggles tenant, role or level fields changes nothing the gateway is handed', () => {
    const a = actor();
    const clean = intentSubmitArgs(dto(), a);
    const smuggled = {
      ...dto(),
      tenantId: 'foreign-tenant',
      tenant_id: 'foreign-tenant',
      role: 'OWNER',
      verificationLevel: 'SESSION_VERIFIED',
      carrier: 'telegram-bot',
    } as unknown as SubmitIntentDto;
    const derived = intentSubmitArgs(smuggled, a);
    expect(derived.tenantId).toBe(clean.tenantId);
    expect(derived.carrier).toBe('pwa');
    expect(derived.actor).toBe(a);
    // The two members a body could once have hoped to influence are no longer derived here at all.
    expect(Object.keys(derived)).toEqual(Object.keys(clean));
  });
});
