// Fixture builders (plan §4.2). Every persisted fixture is written through its owner where an owner
// exists, and each test owns exactly the tenant it created.
//
//   tenant       unique slug `widgets-live-…`, status `active`, `trialFullAccess` false (so no trial
//                expansion grants anything)
//   user         a `User` with a bcrypt password (the HTTP level logs in with it)
//   membership   `Membership` with the role the test names, `active`
//   staff        an optional `Staff` row
//   actor        the principal a live request carries: a session issued by `AuthSessionService`, its
//                access token verified by the application's `JwtService`, and `JwtStrategy.validate`
//                over that payload — the exact value `@CurrentUser()` delivers. Never hand-built.
//   client       G12's client setup: a `Client` for the user and exactly one unrevoked `maya_user`
//                `ClientChannelLink`, created by `ClientChannelLinkService.link` with A18's synthetic
//                verifier (`scripts/package5-a18-client-channel-link-proof.ts`), never raw-inserted
//   feature      a `TenantEntitlement` for the test's tenant — the ONLY way `widgets.runtime` reaches a
//                tenant here, and only after the proof-database guard admits the database again
//   widget       the turn → emission → record chain, through `WidgetStoresService.appendTurn` and
//                `WidgetEmitterService.emit`, the writers that exist
//   synthetic    `[synthetic record]`: the one update that sets columns no writer produces, with
//                `verificationFloor = recomputeFloor(row)` unless the test is about the floor itself
//                (G6 §7.2 recipe). A synthetic record is never evidence (D-5).
//
// Teardown deletes the tenant's rows children-first (widget FKs are RESTRICT), then the tenant. It deletes
// only tenants this builder created, by id, and refuses any other slug. A tenant holding a verified link
// is kept, cancelled, with only its link and `Client` (the link is append-only evidence; see `teardown`).

import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../../../src/common/authenticated-user.interface';
import type { UserRole } from '../../../src/common/domain.enums';
import {
  MAYA_FEATURE_REGISTRY,
  type MayaFeatureKey,
} from '../../../src/common/feature-catalog';
import {
  ClientChannelLinkService,
  type ClientChannelLinkVerifier,
  type VerifiedClientChannelProof,
} from '../../../src/crm/client-channel-link.service';
import { clientChannelSubjectHash } from '../../../src/crm/client-channel-subject';
import type { IntentRecordRow } from '../../../src/widgets/gate.types';
import {
  WidgetEmitterService,
  type K3EmittableKind,
  type SealedEmission,
} from '../../../src/widgets/emission/emitter.service';
import { recomputeFloor } from '../../../src/widgets/gates/gate5';
import { principalProofHash } from '../../../src/widgets/principal.util';
import { WidgetStoresService } from '../../../src/widgets/stores/widget-stores.service';
import type { FixtureContext } from './bootstrap';
import { assertProofDatabase } from './proof-db-guard';

export const SYNTHETIC = '[synthetic record]';
const SLUG_PREFIX = 'widgets-live-';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export interface TenantFixture {
  readonly id: string;
  readonly slug: string;
}

export interface UserFixture {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly role: UserRole;
}

export interface WidgetFixture extends SealedEmission {
  readonly tenantId: string;
  readonly kind: K3EmittableKind;
  readonly conversationId: string;
  readonly turnId: string;
}

/** Writers for the widget chain: the real providers of the module under test. */
export interface WidgetWriters {
  readonly stores: WidgetStoresService;
  readonly emitter: WidgetEmitterService;
}

export class Fixtures {
  private readonly tenants: string[] = [];

  constructor(
    private readonly ctx: FixtureContext,
    private readonly writers: WidgetWriters,
  ) {}

  async tenant(label: string): Promise<TenantFixture> {
    const slug = `${SLUG_PREFIX}${randomUUID().replaceAll('-', '')}`;
    const row = await this.ctx.prisma.tenant.create({
      data: {
        name: `widgets-live ${label}`,
        slug,
        status: 'active',
        trialFullAccess: false,
      },
      select: { id: true, slug: true },
    });
    this.tenants.push(row.id);
    return row;
  }

  async user(
    tenant: TenantFixture,
    role: UserRole,
    marker = '',
  ): Promise<UserFixture> {
    const password = `wl-${randomUUID()}`;
    const email = `wl-${randomUUID().slice(0, 8)}${marker ? `-${marker}` : ''}@widgets-live.test`;
    const row = await this.ctx.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role,
        status: 'active',
      },
      select: { id: true },
    });
    await this.ctx.prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: row.id,
        role,
        status: 'active',
        joinedAt: new Date(),
      },
    });
    return { id: row.id, email, password, role };
  }

  async staff(
    tenant: TenantFixture,
    user: UserFixture,
    marker: string,
  ): Promise<{ id: string }> {
    return this.ctx.prisma.staff.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        title: marker,
        encryptedDisplayName: this.ctx.encryption.encrypt(marker),
      },
      select: { id: true },
    });
  }

  /** `@CurrentUser()`'s value for this user: a real session, a real token, `JwtStrategy.validate`. */
  async actor(
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<Readonly<AuthenticatedUser>> {
    const issued = await this.ctx.sessions.issueSession(
      { id: user.id, role: user.role, status: 'active' },
      {},
      tenant.id,
    );
    return this.actorFromAccessToken(issued.access_token);
  }

  /**
   * The actor an access token carries, as `JwtAuthGuard` derives it: the token verified with the
   * application's JWT secret, then `JwtStrategy.validate` over its payload (session, user, membership).
   * The HTTP level uses it for a token from the login route, so a record is minted for the principal the
   * route will see.
   */
  async actorFromAccessToken(
    accessToken: string,
  ): Promise<Readonly<AuthenticatedUser>> {
    const payload =
      await this.ctx.jwt.verifyAsync<
        Parameters<FixtureContext['jwtStrategy']['validate']>[0]
      >(accessToken);
    return Object.freeze(await this.ctx.jwtStrategy.validate(payload));
  }

  /** G12 §6.2 client setup: one `Client` and exactly one verified `maya_user` link, through the owner. */
  async client(
    tenant: TenantFixture,
    user: UserFixture,
  ): Promise<{ clientId: string; linkId: string }> {
    const client = await this.ctx.prisma.client.create({
      data: { tenantId: tenant.id, userId: user.id },
      select: { id: true },
    });
    const proofs = new Map<string, VerifiedClientChannelProof>();
    // A18's synthetic verifier fixture: not a production verifier and not an authentication shortcut.
    const verifier: ClientChannelLinkVerifier = {
      verifyLink: (token) => {
        const proof = proofs.get(token);
        return proof
          ? Promise.resolve(proof)
          : Promise.reject(new Error('Unverified channel/Client challenge'));
      },
      verifyRevocation: () =>
        Promise.reject(new Error('widgets-live issues no revocation proof')),
    };
    const token = `synthetic-link-${randomUUID()}`;
    proofs.set(token, {
      tenantId: tenant.id,
      clientId: client.id,
      provider: 'maya_user',
      providerSubjectHash: clientChannelSubjectHash(
        this.ctx.encryption,
        'maya_user',
        user.id,
      ),
      method: 'proven_user_client_link',
      verificationIdentityHash: sha256(token),
      verifier: 'synthetic-isolated-challenge-verifier.v1',
      channelControlProofHash: sha256(`channel:${token}`),
      clientAuthorityProofHash: sha256(`client:${token}`),
      validUntil: new Date(Date.now() + 600_000),
    });
    const service = new ClientChannelLinkService(
      this.ctx.prisma,
      this.ctx.tenantContext,
      verifier,
    );
    const linked = await this.ctx.tenantContext.runAsSystemTenant(
      tenant.id,
      () => service.link({ proof: token }),
    );
    return { clientId: client.id, linkId: linked.link.id };
  }

  /**
   * A tenant entitlement, for this test's tenant only. The feature's catalogue row is upserted from the
   * code registry first when the proof database lacks it (the seed that would create it is not run
   * here); that row grants nothing by itself.
   */
  async grantFeature(
    tenant: TenantFixture,
    featureKey: MayaFeatureKey,
  ): Promise<void> {
    assertProofDatabase(process.env);
    if (!this.tenants.includes(tenant.id))
      throw new Error(
        'widgets-live grants a feature only to a tenant it created',
      );
    const definition = MAYA_FEATURE_REGISTRY[featureKey];
    await this.ctx.prisma.feature.upsert({
      where: { key: featureKey },
      update: {},
      create: {
        key: featureKey,
        name: definition.name,
        description: definition.description,
        module: definition.module,
        status: definition.status,
      },
    });
    await this.ctx.prisma.tenantEntitlement.create({
      data: {
        tenantId: tenant.id,
        featureKey,
        enabled: true,
        reason: 'widgets-live proof-database fixture',
      },
    });
  }

  /** The turn → emission → record chain through the real writers. */
  async widget(input: {
    tenant: TenantFixture;
    actor: Readonly<AuthenticatedUser>;
    kind: K3EmittableKind;
    body: Record<string, unknown>;
    ttlSeconds?: number;
    now?: Date;
  }): Promise<WidgetFixture> {
    const conversationId = randomUUID();
    const proof = principalProofHash(input.actor);
    const now = input.now ?? new Date();
    const turn = await this.writers.stores.appendTurn(
      {
        tenantId: input.tenant.id,
        conversationId,
        turnIndex: 0,
        role: 'assistant',
        principalProofHash: proof,
        channel: 'pwa',
      },
      now,
    );
    const sealed = await this.writers.emitter.emit(
      {
        tenantId: input.tenant.id,
        conversationId,
        turnId: turn.id,
        kind: input.kind,
        principalProofHash: proof,
        deliveryChannel: 'pwa',
        body: input.body,
        ttlSeconds: input.ttlSeconds ?? 600,
        freshnessClass: 'live',
      },
      now,
    );
    return {
      ...sealed,
      tenantId: input.tenant.id,
      kind: input.kind,
      conversationId,
      turnId: turn.id,
    };
  }

  /**
   * `[synthetic record]`: set columns no writer produces today. `verificationFloor` is recomputed from the
   * updated row (G6 §7.2) unless `floor` is given, which only a test about Gate 5's comparison does.
   */
  async synthetic(
    widget: WidgetFixture,
    columns: {
      effect?: string;
      capabilitySpace?: string | null;
      capabilityKey?: string | null;
      handoffSpace?: string | null;
      handoffKey?: string | null;
      targetJson?: Record<string, unknown> | null;
      priority?: number;
    },
    floor?: string,
  ): Promise<void> {
    const where = {
      intentTokenHash_tenantId: {
        intentTokenHash: widget.intentTokenHash,
        tenantId: widget.tenantId,
      },
    };
    const { targetJson, ...plain } = columns;
    const updated = await this.ctx.prisma.widgetIntentRecord.update({
      where,
      data: {
        ...plain,
        ...(targetJson === undefined
          ? {}
          : {
              targetJson:
                targetJson === null
                  ? Prisma.DbNull
                  : (targetJson as Prisma.InputJsonObject),
            }),
      },
    });
    await this.ctx.prisma.widgetIntentRecord.update({
      where,
      data: {
        verificationFloor:
          floor ?? recomputeFloor(updated as unknown as IntentRecordRow),
      },
    });
  }

  /**
   * Children first, then the tenant. Only tenants this builder created.
   *
   * `ClientChannelLink` is append-only evidence: a database trigger refuses every DELETE
   * (`guard_client_channel_link_v1`), and the link's RESTRICT foreign keys then hold its `Client` and its
   * `Tenant`. A tenant with a link therefore keeps exactly those three kinds of row; everything else is
   * deleted and the tenant is set to `cancelled`, so nothing can sign in to it or be granted through it.
   * Returns the ids of the tenants retained that way.
   */
  async teardown(): Promise<string[]> {
    const db = this.ctx.prisma;
    const retained: string[] = [];
    for (const tenantId of this.tenants.splice(0)) {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      if (!tenant) continue;
      if (!tenant.slug.startsWith(SLUG_PREFIX))
        throw new Error(
          `widgets-live teardown refuses tenant ${tenantId}: not a harness tenant`,
        );
      const where = { tenantId };
      await db.widgetFreeInputLedger.deleteMany({ where });
      await db.widgetIntentReceipt.deleteMany({ where });
      await db.widgetIntentSubmissionAudit.deleteMany({ where });
      await db.widgetRenderReceipt.deleteMany({ where });
      await db.widgetIntentRecord.deleteMany({ where });
      await db.widgetSuppressedEmission.deleteMany({ where });
      await db.widgetDraft.deleteMany({ where });
      await db.widgetErasureTombstone.deleteMany({ where });
      await db.widgetEmission.deleteMany({ where });
      await db.widgetTimelineTurn.deleteMany({ where });
      await db.staff.deleteMany({ where });
      await db.tenantEntitlement.deleteMany({ where });
      await db.authSession.deleteMany({ where });
      await db.membership.deleteMany({ where });
      await db.user.deleteMany({ where });
      if ((await db.clientChannelLink.count({ where })) > 0) {
        await db.tenant.update({
          where: { id: tenantId },
          data: { status: 'cancelled' },
        });
        retained.push(tenantId);
        continue;
      }
      await db.client.deleteMany({ where });
      await db.tenant.delete({ where: { id: tenantId } });
    }
    return retained;
  }
}
