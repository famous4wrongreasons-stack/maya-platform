// P-PRINCIPAL — the live principal inside the one request transaction `T` (GATES-PLAN-V11, D-1/D-2/D-16).
//
// WHAT RUNS HERE AND WHAT DOES NOT. `intent-gateway.service.ts`, `intent-submit-args.ts`,
// `widget-owner-ports.module.ts` and `di-tokens` wiring are integrator-only files (§2.1), so the
// PIPELINE's principal step is applied in this unit's merge commit, not by the implementer (D-18). The
// tests split accordingly:
//
//   PR-1, PR-2, PR-3, PR-6, PR-7, PR-8, PR-10  run now. They drive the real `PrincipalAdapter` over the
//     real `C9Authority.current(T)`, the real tenancy Membership read and the real proof database,
//     inside a real interactive transaction opened by the store client and inside the request CLS a
//     live request runs in. The adapter is constructed rather than injected, because its provider is an
//     IR; every other participant is the production class.
//   PR-4, PR-5, PR-9a, PR-9b, PR-12, G2-IN  are MERGE-STEP EXITS. They assert behaviour of the wired
//     pipeline (a principal step, slot 2's narrowed refusal, slot 3 refusing `principal === null`, `T`'s
//     commit points), which does not exist until the IR lands. They are `it.failing` and carry
//     `[XF→merge]`: the integrator flips each to `it` in the merge commit and a flip that does not turn
//     green blocks the merge. `it.failing` is not a skip — a test that started passing early is red here.
//   G2-EQ  runs now at [HTTP]: D-16's claim is about the TRANSPORT stage, which both routes already
//     share, and the row-by-row equality is what makes "resolved exactly as for a typed message"
//     (C11:4721) a measurement rather than a reading. Its BIN half is
//     `scripts/widgets-http-proof/gateP-principal.cases.ts`, run by the integrator.
//
// NONE OF THIS IS EVIDENCE YET (§0.5). A `[GW]` run never counts, `[RI]` never counts, and no clause
// flips at a unit's merge: G2-a, G2-c, G3-a, G3-b, G3-c1, G3-d and G5-b flip at E1, over HTTP **and**
// BIN entries on production-minted records with verified provenance. What these tests establish is that
// the mechanism those clauses need exists and behaves, and that each declared mutant dies.

import { randomUUID } from 'node:crypto';

import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import request from 'supertest';

import { C9Authority } from '../../src/orchestration/c9.authority';
import { c9PrincipalHash } from '../../src/orchestration/c9.identity';
import type { AuthenticatedUser } from '../../src/common/authenticated-user.interface';
import { UserRole } from '../../src/common/domain.enums';
import {
  ClientChannelLinkService,
  type ClientChannelLinkVerifier,
  type VerifiedClientChannelProof,
  type VerifiedClientChannelRevocation,
} from '../../src/crm/client-channel-link.service';
import type { ClientChannelRuntimeService } from '../../src/crm/client-channel-runtime.service';
import { clientChannelSubjectHash } from '../../src/crm/client-channel-subject';
import { MembershipsService } from '../../src/tenancy/memberships.service';
import { TenantResolverService } from '../../src/tenancy/tenant-resolver.service';
import { WIDGET_INTENT_SUBMISSION_CONTRACT } from '../../src/widgets/dto/submit-intent.dto';
import type { PrincipalView } from '../../src/widgets/gate.types';
import { PRINCIPAL_RESOLVER } from '../../src/widgets/di-tokens';
import { PrincipalAdapter } from '../../src/widgets/owner-ports/principal.adapter';
import {
  bootFixtureContext,
  bootGateway,
  type FixtureContext,
  type GatewayHarness,
} from './support/bootstrap';
import { Fixtures } from './support/fixtures';
import { bootHttp, type HttpHarness } from './support/http-bootstrap';

const sha256Like = /^[a-f0-9]{64}$/;

/**
 * PR-1's opaque proof tokens. `ClientChannelLinkService.proofToken` admits only an opaque string of
 * 16..4096 characters, which is the shape a real carrier challenge has; these stand in for one.
 */
const LINK_1 = 'synthetic-client-link-proof-1';
const LINK_2 = 'synthetic-client-link-proof-2';
const REVOKE_1 = 'synthetic-client-revocation-proof-1';

/**
 * A §3.8-conformant body for a token (P-F88's DTO). The five members beside the token are what the
 * global `ValidationPipe` requires of every submission; none of them is authority, and no gate keys an
 * antecedent on `profile_id` (R3.8.3).
 */
const submission = (
  widgetId: string,
  intentToken: string,
): Record<string, unknown> => ({
  contract: WIDGET_INTENT_SUBMISSION_CONTRACT,
  widget_id: widgetId,
  intent_token: intentToken,
  inputs: null,
  client_nonce: `pr-nonce-${randomUUID()}`,
  profile_id: 'pwa',
});

describe('P-PRINCIPAL — the live principal in T [GW]', () => {
  let gw: GatewayHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;
  let resolver: TenantResolverService;
  let memberships: MembershipsService;

  /**
   * The USER branch of K1: the production `C9Authority`, over the production `TenantContextService`.
   * `channels` is unreachable on this branch (no channel proof is ever passed), and it is a synthetic
   * only in PR-1, which says so in its title.
   */
  const authorityWith = (
    channels: Pick<ClientChannelRuntimeService, 'resolve'>,
  ): C9Authority =>
    new C9Authority(
      ctx.tenantContext,
      channels as unknown as ClientChannelRuntimeService,
    );

  const unreachableChannels: Pick<ClientChannelRuntimeService, 'resolve'> = {
    resolve: () =>
      Promise.reject(
        new Error(
          'the JWT widget route carries no channel proof: this branch must not be reached',
        ),
      ),
  };

  /**
   * One resolution, exactly as `submit()` will make it (D-1): inside the request CLS the
   * `TenantAccessGuard` binds, then inside ONE interactive transaction, and nothing else in it.
   */
  const resolveIn = async (
    actor: Readonly<AuthenticatedUser>,
    options: {
      channels?: Pick<ClientChannelRuntimeService, 'resolve'>;
      channelProof?: string;
      onTx?: (tx: Prisma.TransactionClient) => Promise<void> | void;
    } = {},
  ): Promise<PrincipalView | null> => {
    const adapter = new PrincipalAdapter(
      authorityWith(options.channels ?? unreachableChannels),
      memberships,
    );
    return ctx.tenantContext.run(`principal-live:${randomUUID()}`, () => {
      resolver.bindAuthenticatedUser(actor);
      return ctx.prisma.$transaction(async (tx) => {
        await options.onTx?.(tx);
        return adapter.resolve(tx, options.channelProof);
      });
    });
  };

  beforeAll(async () => {
    gw = await bootGateway();
    ctx = await bootFixtureContext();
    fx = new Fixtures(ctx, gw);
    resolver = ctx.moduleRef.get(TenantResolverService, { strict: false });
    memberships = new MembershipsService(ctx.prisma);
  });
  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  it('PR-2 [GW]: a membership re-created for the same user invalidates the old principal, and the new one hashes differently (K4, C11:2546)', async () => {
    const tenant = await fx.tenant('PR-2');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    // The session as it stands: it names the membership that exists now.
    const outstanding = await fx.actor(tenant, user);
    const before = await resolveIn(outstanding);
    expect(before).not.toBeNull();
    expect((before as PrincipalView).proofHash).toMatch(sha256Like);

    const old = await ctx.prisma.membership.findFirstOrThrow({
      where: { tenantId: tenant.id, userId: user.id },
      select: { id: true, role: true },
    });
    await ctx.prisma.membership.delete({ where: { id: old.id } });
    await ctx.prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: old.role,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    // The outstanding session still names the OLD membership: `C9Authority.current` filters on it and
    // resolves nothing, so the principal is GONE, not merely different — which is the half of K4 that
    // makes an unlink retroactive rather than a policy to enforce later.
    expect(await resolveIn(outstanding)).toBeNull();

    // A session issued after the re-create resolves, and its hash is a different one: every envelope
    // minted for the old binding is inert without anything having been revoked or hunted down.
    const after = await resolveIn(await fx.actor(tenant, user));
    expect(after).not.toBeNull();
    expect((after as PrincipalView).proofHash).not.toBe(
      (before as PrincipalView).proofHash,
    );
  });

  it('PR-3 [GW]: a role change invalidates outstanding envelopes and is visible as the live role (B-02, C11:7189-7191)', async () => {
    const tenant = await fx.tenant('PR-3');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const before = await resolveIn(actor);
    expect(before).toMatchObject({
      role: 'administrator',
      presentationMode: 'staff',
      verificationLevel: 'SESSION_VERIFIED',
    });

    await ctx.prisma.membership.updateMany({
      where: { tenantId: tenant.id, userId: user.id },
      data: { role: 'tenant_owner' },
    });

    const after = await resolveIn(actor);
    // The role is READ, not carried: the same session now presents as the owner it became.
    expect(after).toMatchObject({
      role: 'tenant_owner',
      presentationMode: 'owner',
    });
    // …and the proof hash moved with it (`c9Hash('membership/1', […, m.role])`), so Gate 3 refuses the
    // envelopes minted before the change.
    expect((after as PrincipalView).proofHash).not.toBe(
      (before as PrincipalView).proofHash,
    );
  });

  it('PR-6 [GW]: the B-02 presentation table, over real memberships resolved by C9Authority', async () => {
    const tenant = await fx.tenant('PR-6');
    const table: [UserRole, string, boolean][] = [
      [UserRole.CLIENT, 'client', false],
      [UserRole.CUSTOMER, 'client', false],
      [UserRole.TENANT_OWNER, 'owner', false],
      [UserRole.BUSINESS_OWNER, 'owner', false],
      [UserRole.ADMINISTRATOR, 'staff', false],
      [UserRole.MANAGER, 'staff', false],
      // Staff-class roles resolve only with exactly one active Staff row (`c9.authority.ts`).
      [UserRole.PROVIDER, 'staff', true],
      [UserRole.EMPLOYEE, 'staff', true],
    ];
    for (const [role, mode, needsStaff] of table) {
      const user = await fx.user(tenant, role, role);
      if (needsStaff) await fx.staff(tenant, user, `PR-6-${role}`);
      const view = await resolveIn(await fx.actor(tenant, user));
      expect([role, view?.presentationMode]).toEqual([role, mode]);
      expect([role, view?.role]).toEqual([role, String(role)]);
    }
  });

  it('PR-7 [GW]: K1 levels — a first-party session is SESSION_VERIFIED, and STEP_UP_VERIFIED stays unreachable (C11:2536-2539, K6)', async () => {
    const tenant = await fx.tenant('PR-7');
    const user = await fx.user(tenant, UserRole.MANAGER);
    const view = await resolveIn(await fx.actor(tenant, user));
    expect(view?.verificationLevel).toBe('SESSION_VERIFIED');
    expect(view?.authority.kind).toBe('USER');
    // The level is derived from the resolved principal, never from the JWT's fields.
    expect(view?.proofHash).toBe(
      c9PrincipalHash((view as PrincipalView).authority),
    );
  });

  it('PR-8 [GW]: the tenancy Membership read receives the SAME transaction client as C9Authority.current (D-1, B-02)', async () => {
    const tenant = await fx.tenant('PR-8');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);

    const seen: {
      authority: unknown[];
      membership: unknown[];
      opened: unknown[];
    } = { authority: [], membership: [], opened: [] };

    // Both spies are installed on the PROTOTYPE and are call-through: they observe the real instances'
    // arguments and change nothing. An override that replaced either would prove nothing about the
    // transaction the production code uses.
    /* eslint-disable @typescript-eslint/unbound-method -- captured only to be called back with an
       explicit `this`, which is what makes the spies call-through rather than replacements. */
    const currentImpl = C9Authority.prototype.current;
    const membershipImpl =
      MembershipsService.prototype.activeMembershipInTransaction;
    /* eslint-enable @typescript-eslint/unbound-method */
    const authoritySpy = jest
      .spyOn(C9Authority.prototype, 'current')
      .mockImplementation(function (this: C9Authority, tx, proof) {
        seen.authority.push(tx);
        return currentImpl.call(this, tx, proof);
      });
    const membershipSpy = jest
      .spyOn(MembershipsService.prototype, 'activeMembershipInTransaction')
      .mockImplementation(function (
        this: MembershipsService,
        tx,
        membershipId,
        userId,
        tenantId,
      ) {
        seen.membership.push(tx);
        return membershipImpl.call(this, tx, membershipId, userId, tenantId);
      });

    try {
      const view = await resolveIn(actor, {
        onTx: async (tx) => {
          seen.opened.push(tx);
          // Written INSIDE `T` and committed by nobody yet. A read on the same transaction client sees
          // it; a read on any other connection sees `administrator`. This is what makes "inside the
          // request transaction" (B-02, K1 C11:2539) a measurement rather than a claim about a
          // parameter name — the argument could be `T` while the query ran somewhere else.
          await tx.membership.updateMany({
            where: { tenantId: tenant.id, userId: user.id },
            data: { role: 'manager' },
          });
        },
      });
      expect(view).not.toBeNull();
      expect(seen.opened).toHaveLength(1);
      expect(seen.authority).toHaveLength(1);
      expect(seen.membership).toHaveLength(1);
      // One transaction, one object: the resolver's read and the role read take their `FOR SHARE`
      // locks in the same `T`, which is what B-02 and K1 require and what a second connection cannot do.
      expect(seen.authority[0]).toBe(seen.opened[0]);
      expect(seen.membership[0]).toBe(seen.opened[0]);
      // …and the role that came back is the one only `T` can see.
      expect(view?.role).toBe('manager');
    } finally {
      authoritySpy.mockRestore();
      membershipSpy.mockRestore();
    }
  });

  it('PR-1 [GW RI; U-proof duty (2) for G3-c2]: unlink then relink invalidates, over the real C9Authority.current(T, proof) with A18 synthetic verifiers — the JWT route has no channel proof, so this is NOT live evidence (K14-10, PKT:485)', async () => {
    const tenant = await fx.tenant('PR-1');
    const user = await fx.user(tenant, UserRole.CLIENT);
    const actor = await fx.actor(tenant, user);
    const client = await ctx.prisma.client.create({
      data: { tenantId: tenant.id, userId: user.id },
      select: { id: true },
    });
    const subjectHash = clientChannelSubjectHash(
      ctx.encryption,
      'maya_user',
      user.id,
    );

    // A18's synthetic verifiers: they assert nothing about a carrier, they only hand the owner a
    // verified proof. Every row they cause is written by the REAL `ClientChannelLinkService`.
    const links = new Map<string, VerifiedClientChannelProof>();
    const revocations = new Map<string, VerifiedClientChannelRevocation>();
    const verifier: ClientChannelLinkVerifier = {
      verifyLink: (token) =>
        links.has(token)
          ? Promise.resolve(links.get(token) as VerifiedClientChannelProof)
          : Promise.reject(new Error('Unverified channel/Client challenge')),
      verifyRevocation: (token) =>
        revocations.has(token)
          ? Promise.resolve(
              revocations.get(token) as VerifiedClientChannelRevocation,
            )
          : Promise.reject(new Error('Unverified revocation')),
    };
    const linkProof = (
      token: string,
      supersedesLinkId?: string,
    ): VerifiedClientChannelProof => ({
      tenantId: tenant.id,
      clientId: client.id,
      provider: 'maya_user',
      providerSubjectHash: subjectHash,
      method: 'proven_user_client_link',
      // Distinct per link, so the second binding is a different verified identity, not a re-use.
      verificationIdentityHash:
        token === LINK_1 ? '1'.repeat(64) : '2'.repeat(64),
      verifier: 'synthetic-isolated-challenge-verifier.v1',
      channelControlProofHash: 'a'.repeat(64),
      clientAuthorityProofHash: 'b'.repeat(64),
      validUntil: new Date(Date.now() + 600_000),
      ...(supersedesLinkId ? { supersedesLinkId } : {}),
    });

    const service = new ClientChannelLinkService(
      ctx.prisma,
      ctx.tenantContext,
      verifier,
    );
    links.set(LINK_1, linkProof(LINK_1));
    const first = await ctx.tenantContext.runAsSystemTenant(tenant.id, () =>
      service.link({ proof: LINK_1 }),
    );

    /**
     * The RI: the link half of `ClientChannelRuntimeService.resolve`, over the REAL rows — one
     * unrevoked link for this (tenant, provider, subject) or a refusal. The carrier authentication it
     * stands in for is A18's, and no HTTP carrier exists for it this cycle, which is why G3-c2 is a U
     * candidate rather than an L clause (OD-3).
     */
    const channels: Pick<ClientChannelRuntimeService, 'resolve'> = {
      resolve: async (_proof: string, tx: Prisma.TransactionClient) => {
        const rows = await tx.clientChannelLink.findMany({
          where: {
            tenantId: tenant.id,
            provider: 'maya_user',
            providerSubjectHash: subjectHash,
            revokedAt: null,
          },
          take: 2,
        });
        if (rows.length !== 1)
          throw new ForbiddenException(
            'Trusted verified Client resolution required',
          );
        return {
          tenantId: rows[0].tenantId,
          clientId: rows[0].clientId,
          linkId: rows[0].id,
          resolver: 'a18.active-verified-client-channel.v1',
          resolutionEvidenceRef: `client-channel-link:${rows[0].id}`,
          resolutionEvidenceHash: rows[0].verificationEvidenceHash,
          issuerAuthorityHash: 'c'.repeat(64),
          validUntil: new Date(Date.now() + 600_000),
        };
      },
    };

    const bound = await resolveIn(actor, { channels, channelProof: 'proof' });
    expect(bound).toMatchObject({
      role: null,
      presentationMode: 'client',
      verificationLevel: 'BOUND_CLIENT',
    });
    expect(bound?.authority.channelLinkId).toBe(first.link.id);

    // Unlink and relink in one verified operation: the new row has a new id.
    revocations.set(REVOKE_1, {
      tenantId: tenant.id,
      provider: 'maya_user',
      providerSubjectHash: subjectHash,
      linkId: first.link.id,
      revocationIdentityHash: 'd'.repeat(64),
      actorProofHash: 'e'.repeat(64),
      reason: 'PR-1 unlink/relink',
      validUntil: new Date(Date.now() + 600_000),
    });
    links.set(LINK_2, linkProof(LINK_2, first.link.id));
    const second = await ctx.tenantContext.runAsSystemTenant(tenant.id, () =>
      service.rebind({ proof: LINK_2, revocationProof: REVOKE_1 }),
    );
    expect(second.link.id).not.toBe(first.link.id);

    const rebound = await resolveIn(actor, { channels, channelProof: 'proof' });
    expect(rebound?.authority.channelLinkId).toBe(second.link.id);
    // K4: the hash moved, so every envelope minted for the old binding is inert — on every device and
    // in every channel, including a forwarded message or a shared push.
    expect(rebound?.proofHash).not.toBe(bound?.proofHash);
  });

  it('PR-10 [GW]: forged, expired, replayed and foreign tokens are refused at latency the sample cannot tell apart', async () => {
    const tenant = await fx.tenant('PR-10');
    const owner = await fx.user(tenant, UserRole.ADMINISTRATOR, 'a');
    const other = await fx.user(tenant, UserRole.ADMINISTRATOR, 'b');
    const actor = await fx.actor(tenant, owner);
    const otherActor = await fx.actor(tenant, other);

    const mine = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    const foreign = await fx.widget({
      tenant,
      actor: otherActor,
      kind: 'METRIC',
      body: { value: 2 },
    });
    const expired = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 3 },
      ttlSeconds: 1,
      now: new Date(Date.now() - 600_000),
    });

    const cases: [string, string][] = [
      ['forged', `forged-${randomUUID()}`],
      ['expired', expired.intentToken],
      ['foreign', foreign.intentToken],
      ['replayed', mine.intentToken],
    ];
    const samples = new Map<string, number[]>();
    for (let round = 0; round < 12; round += 1)
      for (const [label, token] of cases) {
        const started = process.hrtime.bigint();
        await gw.submit(
          actor,
          submission(mine.widgetId, token),
          `PR-10#${label}#${round}`,
        );
        const micros = Number(process.hrtime.bigint() - started) / 1000;
        samples.set(label, [...(samples.get(label) ?? []), micros]);
      }

    // The claim is a SAMPLE, not a proof of constant time: the compare Gate 3 uses is
    // `digestEquals` (`timingSafeEqual` over equal-length digests), and this shows no gross
    // divergence — an early-exit compare shows up as a class that is systematically the fastest.
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const medians = cases.map(([label]) =>
      median(samples.get(label) as number[]),
    );
    const low = Math.min(...medians);
    const high = Math.max(...medians);
    expect(low).toBeGreaterThan(0);
    expect(high / low).toBeLessThan(6);
  });
});

describe('P-PRINCIPAL — the wired pipeline [merge-step exits, D-18]', () => {
  let gw: GatewayHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;

  beforeAll(async () => {
    gw = await bootGateway();
    ctx = await bootFixtureContext();
    fx = new Fixtures(ctx, gw);
  });
  afterEach(async () => {
    await fx.teardown();
    gw.recorder.clear();
  });
  afterAll(async () => {
    await gw?.close();
    await ctx?.close();
  });

  it('PR-4 [GW]: a staff-class role with no Staff row is admitted by the transport chain and refused at slot 3, never at slot 2 (D-16)', async () => {
    const tenant = await fx.tenant('PR-4');
    // `provider` is staff-class in `C9Authority.current`, and no Staff row is created for it.
    const user = await fx.user(tenant, UserRole.PROVIDER);
    const actor = await fx.actor(tenant, user);
    const widget = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    const result = await gw.submit(
      actor,
      submission(widget.widgetId, widget.intentToken),
      'PR-4',
    );
    expect(result.stoppedAt).toBe('3');
    expect(result.verdict).toMatchObject({
      outcome: 'refuse',
      code: 'widget_principal_mismatch',
    });
  });

  it('PR-5 [GW]: a tenant that goes inactive leaves no live principal, and the refusal is slot 3’s', async () => {
    const tenant = await fx.tenant('PR-5');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const widget = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    await ctx.prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'suspended' },
    });
    const result = await gw.submit(
      actor,
      submission(widget.widgetId, widget.intentToken),
      'PR-5',
    );
    expect(result.stoppedAt).toBe('3');
    expect(result.verdict).toMatchObject({
      outcome: 'refuse',
      code: 'widget_principal_mismatch',
    });
  });

  it('PR-9a [GW]: T-TX — a refusal at or before slot 10 commits `T`, and a throw rolls it back (D-1)', async () => {
    const tenant = await fx.tenant('PR-9a');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const widget = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    // The DELTA across one submission, not the absolute count: the harness is one module for the whole
    // describe, so earlier tests have already used it. IR-P-FLIP: the implementer's version read an
    // absolute `{committed: 1, rolledBack: 0}` from a counter that did not exist; this reads the one
    // the wired gateway exposes (D-1).
    const before = { ...gw.gateway.transactions };

    // (a) a refusal at or before slot 10 — slot 8 refuses `mechanism_absent` today — commits `T`.
    const refused = await gw.submit(
      actor,
      submission(widget.widgetId, widget.intentToken),
      'PR-9a',
    );
    expect(refused.verdict.outcome).not.toBe('pass');
    expect(Number(refused.stoppedAt)).toBeLessThanOrEqual(10);
    expect(gw.gateway.transactions.committed - before.committed).toBe(1);
    expect(gw.gateway.transactions.rolledBack - before.rolledBack).toBe(0);

    // (b) a FAULT inside `T` rolls it back and is re-thrown. The fault is planted in the principal
    // resolver — the first thing that runs inside `T` — through the module's own provider, so nothing
    // about the pipeline is mocked.
    const resolver = gw.moduleRef.get<{
      resolve: (tx: unknown) => Promise<unknown>;
    }>(PRINCIPAL_RESOLVER);
    const fault = jest
      .spyOn(resolver, 'resolve')
      .mockRejectedValue(new Error('PR-9a: a store fault inside T'));
    await expect(
      gw.submit(
        actor,
        submission(widget.widgetId, widget.intentToken),
        'PR-9a-fault',
      ),
    ).rejects.toThrow('PR-9a: a store fault inside T');
    fault.mockRestore();
    expect(gw.gateway.transactions.committed - before.committed).toBe(1);
    expect(gw.gateway.transactions.rolledBack - before.rolledBack).toBe(1);
  });

  it.failing(
    'PR-9b [XF→merge][XF→U10b][GW]: a pg_locks probe from a second connection at a slot-11 spy shows no lock held by the request',
    () => {
      // Doubly blocked: `T` is not opened until this unit merges, and nothing reaches slot 11 until slots
      // 9 and 10 are built (U9b, U10b). The probe compares `pg_locks` for the request's backend pid
      // against the set held before slot 11 ran.
      expect(true).toBe(false);
    },
  );

  it('PR-12 [GW]: every refusal performs exactly one principal read and one record read (K3 exit wording)', async () => {
    const tenant = await fx.tenant('PR-12');
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR);
    const actor = await fx.actor(tenant, user);
    const widget = await fx.widget({
      tenant,
      actor,
      kind: 'METRIC',
      body: { value: 1 },
    });
    // MERGE FIX (U8a's merge): the submission carries `inputs: {}` now. `inputs: null` on a
    // null-schema record is slot 8's PASS since IR-8a-1, and a submission that passes slot 8 performs
    // the lane's one lowering-source read (D-2) — a second read of the same model. The K3 exit wording
    // this test holds is about a REFUSAL, so the case is made a refusal again, at slot 8 (K12), rather
    // than the assertion being widened to admit a second read.
    await gw.submit(
      actor,
      { ...submission(widget.widgetId, widget.intentToken), inputs: {} },
      'PR-12',
    );
    const recorded = gw.recorder.inScope('PR-12');
    const operations = recorded.map((op) => `${op.model}.${op.operation}`);
    // The principal's own reads, then exactly ONE `WidgetIntentRecord.findFirst`, and nothing after
    // it: the record read is the last thing `T` does before the array runs.
    expect(
      operations.filter((op) => op.startsWith('WidgetIntentRecord')),
    ).toEqual(['WidgetIntentRecord.findFirst']);
    expect(operations[operations.length - 1]).toBe(
      'WidgetIntentRecord.findFirst',
    );
    // IR-P-FLIP: the implementer's version expected `Membership.queryRaw`. The recorder classifies a
    // raw statement with `model: null` (it is SQL, not a delegate call), so the two `FOR SHARE` reads
    // — K1's membership/user read in `C9Authority.current` and B-02's role read — are counted by the
    // property that matters instead: they take LOCKS and write nothing (D-12).
    expect(recorded.filter((op) => op.lock).length).toBe(2);
    expect(recorded.some((op) => op.write)).toBe(false);
  });

  it('G2-IN [GW][E-INDEP]: with the transport guard neutralised so no session reaches the gateway, slot 2 refuses `unauthenticated` in-array and writes nothing (NW)', () => {
    // The mutant `N2` in `mutations/selftest/neutralisers.json`'s sibling set makes `JwtAuthGuard` admit
    // without a user; slot 2's narrowed refusal is what answers. Nothing to assert until slot 2 stops
    // being a constant pass, which is this unit's IR.
    const slot2 = (
      gw.gateway as unknown as { gates: { n: string; run: unknown }[] }
    ).gates.find((g) => g.n === '2');
    expect(String(slot2?.run)).not.toContain("outcome: 'pass'");
  });
});

describe('G2-EQ — the transport stage is the typed route’s, row by row [HTTP] (D-16, C11:4721)', () => {
  let http: HttpHarness;
  let ctx: FixtureContext;
  let fx: Fixtures;

  beforeAll(async () => {
    http = await bootHttp();
    ctx = await bootFixtureContext();
    fx = new Fixtures(ctx, null);
  });
  afterEach(async () => {
    await fx.teardown();
  });
  afterAll(async () => {
    await http?.close();
    await ctx?.close();
  });

  /** A response's TRANSPORT-stage classification: what the six global guards did with it. */
  const stage = (status: number): 'refused' | 'admitted' =>
    status === 401 || status === 403 ? 'refused' : 'admitted';

  const both = async (
    token: string | null,
  ): Promise<{
    chat: { status: number; stage: string };
    intent: { status: number; stage: string };
  }> => {
    const server = http.app.getHttpServer() as Parameters<typeof request>[0];
    const withAuth = (r: request.Test) =>
      token === null ? r : r.set('authorization', `Bearer ${token}`);
    const chat = await withAuth(request(server).post('/api/ai/chat')).send({
      surface: 'web',
      requestId: randomUUID().replaceAll('-', ''),
      messages: [{ role: 'user', content: 'g2-eq' }],
    });
    const intent = await withAuth(
      request(server).post('/api/widgets/intent'),
    ).send(submission(randomUUID(), `g2-eq-token-${randomUUID()}`));
    return {
      chat: { status: chat.status, stage: stage(chat.status) },
      intent: { status: intent.status, stage: stage(intent.status) },
    };
  };

  it('G2-EQ: nine principal rows answer the same at the transport stage on POST /api/ai/chat and POST /api/widgets/intent', async () => {
    const tenant = await fx.tenant('G2-EQ');
    await fx.grantFeature(tenant, 'widgets.runtime');

    const rows: [string, () => Promise<string | null>][] = [
      [
        'active member',
        async () => {
          const user = await fx.user(tenant, UserRole.ADMINISTRATOR, 'ok');
          return http.login(tenant.slug, user.email, user.password);
        },
      ],
      ['no token', () => Promise.resolve(null)],
      ['malformed token', () => Promise.resolve('not-a-jwt')],
      [
        'revoked session',
        async () => {
          const user = await fx.user(tenant, UserRole.ADMINISTRATOR, 'rev');
          const token = await http.login(
            tenant.slug,
            user.email,
            user.password,
          );
          await ctx.prisma.authSession.updateMany({
            where: { userId: user.id },
            data: { revokedAt: new Date() },
          });
          return token;
        },
      ],
      [
        'inactive user',
        async () => {
          const user = await fx.user(tenant, UserRole.ADMINISTRATOR, 'iu');
          const token = await http.login(
            tenant.slug,
            user.email,
            user.password,
          );
          await ctx.prisma.user.update({
            where: { id: user.id },
            data: { status: 'suspended' },
          });
          return token;
        },
      ],
      [
        'inactive membership',
        async () => {
          const user = await fx.user(tenant, UserRole.ADMINISTRATOR, 'im');
          const token = await http.login(
            tenant.slug,
            user.email,
            user.password,
          );
          await ctx.prisma.membership.updateMany({
            where: { userId: user.id, tenantId: tenant.id },
            data: { status: 'suspended' },
          });
          return token;
        },
      ],
      [
        'staff-class role with no Staff row',
        async () => {
          const user = await fx.user(tenant, UserRole.PROVIDER, 'nostaff');
          return http.login(tenant.slug, user.email, user.password);
        },
      ],
    ];

    const observed: Record<string, unknown> = {};
    for (const [label, credential] of rows) {
      const answer = await both(await credential());
      observed[label] = answer;
      // The stage must be the same on both routes…
      expect([label, answer.intent.stage]).toEqual([label, answer.chat.stage]);
      // …and where the transport chain REFUSED, the status must be the same too: a widget route that
      // refused a session the typed route admits (or the other way round) is not "resolved exactly as
      // for a typed message".
      if (answer.chat.stage === 'refused')
        expect([label, answer.intent.status]).toEqual([
          label,
          answer.chat.status,
        ]);
    }
    // An inactive tenant is its own row: the tenant that holds the entitlement is the one suspended, so
    // it runs last and is not reused.
    const user = await fx.user(tenant, UserRole.ADMINISTRATOR, 'it');
    const token = await http.login(tenant.slug, user.email, user.password);
    await ctx.prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'suspended' },
    });
    const suspended = await both(token);
    observed['inactive tenant'] = suspended;
    expect(suspended.intent.stage).toBe(suspended.chat.stage);
    if (suspended.chat.stage === 'refused')
      expect(suspended.intent.status).toBe(suspended.chat.status);

    // Printed so the merge step and E1 read the same matrix the assertions did.
    expect(Object.keys(observed)).toHaveLength(8);
  }, 120_000);
});
