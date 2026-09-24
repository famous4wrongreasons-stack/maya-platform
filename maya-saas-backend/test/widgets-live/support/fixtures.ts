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
//   syntheticDeliveryChannel
//                `[synthetic record]`: a proof-only emission/receipt channel rewrite for contract
//                channels which have no physical K6 carrier profile yet. It preserves the sealed
//                profile and changes no production minter behavior. A synthetic record is never
//                evidence (D-5).
//
// Teardown deletes the tenant's rows children-first (widget FKs are RESTRICT), then the tenant. It deletes
// only tenants this builder created, by id, and refuses any other slug. A tenant holding a verified link
// is kept, cancelled, with only its link and `Client` (the link is append-only evidence; see `teardown`).
// With `WIDGETS_EVIDENCE=1` it first appends the tenant's record hashes to the evidence directory, so the
// verifier can check a manifest line against the database as it was BEFORE teardown (D-17 (4)).
//
// The BIN runner (`scripts/widgets-intent-http-proof.ts`) builds a `Fixtures` with no widget writers: a BIN
// case is given only `tenant`, `user`, `staff`, `client`, `grantFeature` and `teardown` (I-HAR), and
// `widget`/`synthetic` refuse on a builder without writers.

import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../../../src/common/authenticated-user.interface';
import type {
  CalendarSource,
  UserRole,
} from '../../../src/common/domain.enums';
import { C9_REGISTRY_HASH } from '../../../src/orchestration/c9.registry';
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
import type {
  IntentRecordRow,
  PrincipalView,
} from '../../../src/widgets/gate.types';
import type { WidgetComposerInput } from '../../../src/widget-contract/envelope';
import {
  WidgetEmitterService,
  type K3EmittableKind,
  type SealedEmission,
} from '../../../src/widgets/emission/emitter.service';
import { recomputeFloor } from '../../../src/widgets/gates/gate5';
import { C9Authority } from '../../../src/orchestration/c9.authority';
import type { ClientChannelRuntimeService } from '../../../src/crm/client-channel-runtime.service';
import { MembershipsService } from '../../../src/tenancy/memberships.service';
import { TenantResolverService } from '../../../src/tenancy/tenant-resolver.service';
import { PrincipalAdapter } from '../../../src/widgets/owner-ports/principal.adapter';
import { WidgetStoresService } from '../../../src/widgets/stores/widget-stores.service';
import type { FixtureContext } from './bootstrap';
import { EvidenceWriter } from './evidence';
import { assertProofDatabase } from './proof-db-guard';

export const SYNTHETIC = '[synthetic record]';
const SLUG_PREFIX = 'widgets-live-';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const FIXTURE_CAPABILITY: Readonly<Record<K3EmittableKind, string>> =
  Object.freeze({
    METRIC: 'c7.measurement.read',
    SCHEDULE: 'staff.schedule.read',
    SOURCE_STATUS: 'support.integration-status.read',
    PROGRESS: 'owner_report.status',
    LIMITATION: 'c9.no_action',
  });

/** Closed canonical input for the five pre-trigger fixture kinds; no authority member is accepted. */
export const closedFixtureComposerInput = (args: {
  readonly kind: K3EmittableKind;
  readonly turnId: string;
  readonly executionId: string;
}): WidgetComposerInput => ({
  kind_proposal: args.kind,
  capability: FIXTURE_CAPABILITY[args.kind],
  capability_version: C9_REGISTRY_HASH,
  source: { from: 'action_execution', execution_id: args.executionId },
  correlation_refs: { turn_id: args.turnId },
  origin: {
    trigger: 'system_reply',
    emitter: 'capability_read',
    moment_key: null,
    proactive_provenance: null,
  },
  facts: [],
  facts_origin: [],
  slots: {},
  limitation_codes: [],
  intent_proposals: [
    {
      intent_template_key: 'control.dismiss@1',
      capability: { space: 'CONTROL', key: 'control.widget.dismiss' },
      role: 'escape',
    },
  ],
  locale: 'en',
});

/**
 * The JWT widget route carries no channel proof, so `C9Authority.current`'s CLIENT_CHANNEL branch is
 * unreachable when a fixture resolves a principal. A rejection rather than a stub answer, so a fixture
 * that somehow reached it would fail loudly instead of minting for a principal nobody resolved.
 */
const UNREACHABLE_CHANNELS: Pick<ClientChannelRuntimeService, 'resolve'> = {
  resolve: () =>
    Promise.reject(
      new Error(
        'widgets-live fixtures resolve the USER branch only: no channel proof exists on this route',
      ),
    ),
};

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

export interface WidgetFixture extends Omit<
  SealedEmission,
  'intentToken' | 'intentTokenHash'
> {
  readonly intentToken: string;
  readonly intentTokenHash: string;
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

export interface FixturesOptions {
  /** The evidence writer teardown reports record hashes through (default: one over `process.env`). */
  readonly evidence?: EvidenceWriter;
}

/** What a BIN case may use: no widget writer (I-HAR). */
export type BinFixtures = Pick<
  Fixtures,
  'tenant' | 'user' | 'staff' | 'client' | 'grantFeature' | 'teardown'
>;

export class Fixtures {
  private readonly tenants: string[] = [];
  private readonly evidence: EvidenceWriter;

  constructor(
    private readonly ctx: FixtureContext,
    private readonly writers: WidgetWriters | null,
    options: FixturesOptions = {},
  ) {
    this.evidence = options.evidence ?? new EvidenceWriter();
  }

  /** The BIN view: the six members a BIN case may call, bound to this builder, and nothing else. */
  binView(): BinFixtures {
    return Object.freeze({
      tenant: this.tenant.bind(this),
      user: this.user.bind(this),
      staff: this.staff.bind(this),
      client: this.client.bind(this),
      grantFeature: this.grantFeature.bind(this),
      teardown: this.teardown.bind(this),
    });
  }

  private requireWriters(member: string): WidgetWriters {
    if (this.writers === null)
      throw new Error(
        `widgets-live fixtures: ${member} needs the widget writers, and this builder has none (a BIN case never writes a widget record)`,
      );
    return this.writers;
  }

  async tenant(
    label: string,
    calendarSource?: CalendarSource,
  ): Promise<TenantFixture> {
    const slug = `${SLUG_PREFIX}${randomUUID().replaceAll('-', '')}`;
    const row = await this.ctx.prisma.tenant.create({
      data: {
        name: `widgets-live ${label}`,
        slug,
        status: 'active',
        trialFullAccess: false,
        ...(calendarSource === undefined ? {} : { calendarSource }),
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

  /**
   * The LIVE principal's proof hash for this actor — the digest Gate 3 will compare (K3/K4, C11:2544-2546).
   *
   * P-PRINCIPAL replaced the layer's old `principalProofHash(actor)` (a sha256 over four JWT fields) with
   * the owner's own `c9PrincipalHash`, computed over the principal `C9Authority.current(T)` resolves. A
   * fixture must therefore mint for the RESOLVED principal, not for the token's claims, or every Gate 3
   * positive in every live spec would refuse. It runs the production resolver, in the request CLS the
   * `TenantAccessGuard` binds and inside one interactive transaction — the same two reads the gateway makes.
   *
   * A principal the owner DENIES (a staff-class role with no Staff row; an inactive tenant, membership or
   * user) has no live hash. The record is then minted with an unmatchable digest, which is honest: the
   * submission is refused at slot 3, which is what the live path does for it (D-16).
   */
  private async resolvedPrincipal(
    actor: Readonly<AuthenticatedUser>,
  ): Promise<PrincipalView | null> {
    const resolver = this.ctx.moduleRef.get(TenantResolverService, {
      strict: false,
    });
    const adapter = new PrincipalAdapter(
      new C9Authority(
        this.ctx.tenantContext,
        UNREACHABLE_CHANNELS as unknown as ClientChannelRuntimeService,
      ),
      new MembershipsService(this.ctx.prisma),
    );
    const view = await this.ctx.tenantContext.run(
      `widgets-live-principal:${randomUUID()}`,
      () => {
        resolver.bindAuthenticatedUser(actor);
        return this.ctx.prisma.$transaction((tx) => adapter.resolve(tx));
      },
    );
    return view;
  }

  async principalView(
    actor: Readonly<AuthenticatedUser>,
  ): Promise<PrincipalView> {
    const resolved = await this.resolvedPrincipal(actor);
    if (resolved !== null) return resolved;
    if (actor.tenantId === null)
      throw new Error('a widget fixture requires a tenant-qualified actor');
    const proofHash = sha256(`no-live-principal:${randomUUID()}`);
    return {
      authority: {
        kind: 'USER',
        tenantId: actor.tenantId,
        userId: actor.userId,
        membershipId: actor.membershipId,
        clientId: null,
        channelLinkId: null,
        branchRefs: actor.branchId === null ? [] : [actor.branchId],
        staffRef: null,
        proofHash,
      },
      role: actor.role,
      presentationMode: 'staff',
      verificationLevel: 'SESSION_VERIFIED',
      proofHash,
    };
  }

  async principalProofHash(
    actor: Readonly<AuthenticatedUser>,
  ): Promise<string> {
    return (await this.principalView(actor)).proofHash;
  }

  /**
   * The turn → emission → record chain through the real writers, normalised to the historical
   * G-SYNTH passive record used by the pre-E1 gate suites. P-MINT itself correctly gives `NONE` no
   * token, so the harness first mints a closed CONTROL token and then rewrites only the record's
   * synthetic gate columns. Production mint proofs call the emitter directly and never use this
   * compatibility fixture.
   */
  async widget(input: {
    tenant: TenantFixture;
    actor: Readonly<AuthenticatedUser>;
    kind: K3EmittableKind;
    body: Record<string, unknown>;
    ttlSeconds?: number;
    now?: Date;
  }): Promise<WidgetFixture> {
    const writers = this.requireWriters('widget');
    const conversationId = randomUUID();
    const principal = await this.principalView(input.actor);
    const proof = principal.proofHash;
    const now = input.now ?? new Date();
    const turn = await writers.stores.appendTurn(
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
    const sealed = await writers.emitter.emit(
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
        composerInput: closedFixtureComposerInput({
          kind: input.kind,
          turnId: turn.id,
          executionId: conversationId,
        }),
        principal,
      },
      now,
    );
    if (sealed.intentToken === null || sealed.intentTokenHash === null)
      throw new Error(
        'widgets-live fixture expected its closed CONTROL template to mint a token',
      );
    const fixture: WidgetFixture = {
      ...sealed,
      intentToken: sealed.intentToken,
      intentTokenHash: sealed.intentTokenHash,
      tenantId: input.tenant.id,
      kind: input.kind,
      conversationId,
      turnId: turn.id,
    };
    await this.synthetic(fixture, {
      effect: 'NONE',
      capabilitySpace: null,
      capabilityKey: null,
      handoffSpace: null,
      handoffKey: null,
      targetJson: null,
      priority: 1,
      singleUse: false,
      utteranceTemplate: null,
    });
    return fixture;
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
      singleUse?: boolean;
      utteranceTemplate?: string | null;
    },
    floor?: string,
  ): Promise<void> {
    this.requireWriters('synthetic');
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
   * `[synthetic record]`: move an already sealed proof row to a contract channel for a gate test.
   *
   * K6 intentionally has six physical carrier profiles, while Gate 7's contract table also contains
   * tier-only channels such as `guest-chat` and `web-public`. P-MINT must fail closed rather than
   * inventing a physical profile for those channels. A Gate 7 synthetic test can still exercise the
   * persisted-channel rule by moving both selectors together. The receipt keeps the original
   * `profileId`, which is the term the seal covers, so this neither re-seals nor introduces a second
   * minter. No production caller has access to this test fixture method.
   */
  async syntheticDeliveryChannel(
    widget: WidgetFixture,
    deliveryChannel: string,
  ): Promise<void> {
    this.requireWriters('syntheticDeliveryChannel');
    await this.ctx.prisma.$transaction([
      this.ctx.prisma.widgetEmission.update({
        where: {
          widgetId_tenantId: {
            widgetId: widget.widgetId,
            tenantId: widget.tenantId,
          },
        },
        data: { deliveryChannel },
      }),
      this.ctx.prisma.widgetRenderReceipt.update({
        where: {
          tenantId_widgetId_deliveryChannel: {
            tenantId: widget.tenantId,
            widgetId: widget.widgetId,
            deliveryChannel: 'pwa',
          },
        },
        data: { deliveryChannel },
      }),
    ]);
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
      if (this.evidence.enabled)
        this.evidence.databaseBeforeTeardown(
          tenantId,
          (
            await db.widgetIntentRecord.findMany({
              where,
              select: { intentTokenHash: true },
              orderBy: { intentTokenHash: 'asc' },
            })
          ).map((r) => r.intentTokenHash),
        );
      await db.widgetFreeInputLedger.deleteMany({ where });
      await db.widgetIntentReceipt.deleteMany({ where });
      await db.widgetIntentSubmissionAudit.deleteMany({ where });
      await db.widgetRenderReceipt.deleteMany({ where });
      // I-MIG2 / MIG-7: the divergence row has a RESTRICT FK to WidgetIntentRecord.
      await db.widgetIntentDivergenceAudit.deleteMany({ where });
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
