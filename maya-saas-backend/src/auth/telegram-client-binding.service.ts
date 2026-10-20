import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { normalizePhoneE164 } from '../common/phone.util';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from '../crm/client-channel-link.service';
import { clientChannelSubjectHash } from '../crm/client-channel-subject';
import { ClientIdentityService } from '../crm/client-identity.service';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

export const TELEGRAM_CLIENT_RESOLVER = 'a18.telegram-oidc-phone.initial.v1';
const TELEGRAM_BINDING_OPERATION = 'a18.telegram-oidc-phone.operation.v1';
const TELEGRAM_BINDING_OPERATION_MS = 120_000;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Server-only result of SocialAuthService's signature/issuer/audience check.
 * Never accepted from an HTTP body, stored AuthIdentity profile, or User.phone.
 */
export type VerifiedTelegramClientLogin = Readonly<{
  tenantId: string;
  userId: string;
  sessionId: string;
  flowId: string;
  providerUserId: string;
  phone: string;
  tokenHash: string;
  issuedAt: number;
  expiresAt: number;
}>;

/** In-process only, minted once by this coordinator after the incoming token
 * and current login pass verification. Never supplied by an HTTP caller. */
type AdmittedTelegramLogin = Readonly<{
  login: VerifiedTelegramClientLogin;
  acceptedAt: number;
  expiresAt: number;
  proofHash: string;
}>;

class BindingPending extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Owner decision 2026-10-11: fresh Telegram verified phone + unique current
 * tenant CRM card can establish an INITIAL personal Client link. This does not
 * merge Clients, revive revoked episodes, or grant consent/booking authority.
 */
@Injectable()
export class TelegramClientBindingService {
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly crm: CrmService,
    private readonly identities: ClientIdentityService,
  ) {
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: () =>
        Promise.reject(
          new ForbiddenException('Server login coordinator required'),
        ),
      verifyRevocation: () =>
        Promise.reject(new ForbiddenException('Explicit revocation required')),
    });
  }

  async afterLogin(proof: VerifiedTelegramClientLogin) {
    // Login remains available if CRM is unavailable. No error text/PII escapes.
    try {
      return await this.bind(Object.freeze({ ...proof }));
    } catch (error) {
      return {
        status: 'unlinked' as const,
        reason:
          error instanceof BindingPending
            ? error.code
            : 'client_binding_unavailable',
      };
    }
  }

  private async bind(p: VerifiedTelegramClientLogin) {
    this.context.assertAuthPrincipal(p.userId, p.tenantId);
    if (
      !/^\+[1-9]\d{7,14}$/.test(p.phone) ||
      !/^[a-f0-9]{64}$/.test(p.tokenHash)
    )
      throw new BindingPending('verified_telegram_phone_required');
    const subject = clientChannelSubjectHash(
      this.encryption,
      'maya_user',
      p.userId,
    );
    const telegramSubject = clientChannelSubjectHash(
      this.encryption,
      'telegram',
      p.providerUserId,
    );
    const before = await this.prisma.$transaction(async (tx) => {
      const { now, sessionExpiresAt, flowExpiresAt } = await this.assertLogin(
        tx,
        p,
      );
      const acceptedAt = now.getTime();
      const expiresAt = Math.min(
        acceptedAt + TELEGRAM_BINDING_OPERATION_MS,
        p.issuedAt + 600_000,
        sessionExpiresAt,
        flowExpiresAt,
      );
      const admission: AdmittedTelegramLogin = Object.freeze({
        login: p,
        acceptedAt,
        expiresAt,
        proofHash: this.encryption.opaqueReference(
          TELEGRAM_BINDING_OPERATION,
          JSON.stringify({ login: p, acceptedAt, expiresAt }),
        ),
      });
      return {
        admission,
        existing: await this.existing(tx, p, subject, telegramSubject),
      };
    });
    if (before.existing) return { status: 'already_linked' as const };
    const source = await this.prisma.$transaction((tx) =>
      this.source(tx, p.tenantId),
    );

    const startedAt = Date.now();
    const registry = await this.crm.getClientRegistry(p.tenantId);
    const observedAt = Date.parse(registry.generated_at);
    if (
      registry.complete !== true ||
      registry.provider !== source.provider ||
      !Number.isFinite(observedAt) ||
      observedAt < startedAt - 1000 ||
      observedAt > Date.now() + 30_000
    )
      throw new BindingPending('current_complete_client_registry_required');
    const matches = registry.clients.filter(
      (c) => normalizePhoneE164(c.phone) === p.phone,
    );
    if (matches.length !== 1 || !matches[0].external_id)
      throw new BindingPending(
        matches.length ? 'client_phone_ambiguous' : 'client_not_found',
      );
    const externalId = matches[0].external_id;
    // This is the existing CRM-card registrar, not creation of a person by phone.
    // Registration grants no authority and receives no caller-selected Client id.
    const registered = await this.registerCard(
      {
        tenantId: p.tenantId,
        provider: registry.provider,
        externalId,
      },
      before.admission,
    );
    if (!registered) throw new BindingPending('client_identity_unresolved');

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await lockClientChannelIdentity(
              tx,
              p.tenantId,
              'maya_user',
              subject,
            );
            await lockClientChannelIdentity(
              tx,
              p.tenantId,
              'telegram',
              telegramSubject,
            );
            await lockClientChannelIdentity(
              tx,
              p.tenantId,
              'initial_client',
              registered.clientId,
            );
            const { now } = await this.assertLogin(tx, p, before.admission);
            if (
              now.getTime() - observedAt > 60_000 ||
              hash(await this.source(tx, p.tenantId)) !== hash(source)
            )
              throw new BindingPending('client_source_changed');
            if (await this.existing(tx, p, subject, telegramSubject))
              return { status: 'already_linked' as const };
            const telegramLink = await tx.clientChannelLink.findFirst({
              where: {
                tenantId: p.tenantId,
                provider: 'telegram',
                providerSubjectHash: telegramSubject,
                revokedAt: null,
              },
              select: { clientId: true },
            });
            if (telegramLink && telegramLink.clientId !== registered.clientId)
              throw new BindingPending('client_identity_unresolved');
            const mapping = await tx.crmClientLink.findUnique({
              where: {
                tenantId_provider_externalId: {
                  tenantId: p.tenantId,
                  provider: registry.provider,
                  externalId,
                },
              },
              include: { client: true },
            });
            if (
              !mapping ||
              mapping.unlinkedAt ||
              mapping.clientId !== registered.clientId ||
              mapping.client.tenantId !== p.tenantId ||
              mapping.client.mergedIntoClientId ||
              (mapping.client.userId && mapping.client.userId !== p.userId)
            )
              throw new BindingPending('client_identity_unresolved');
            // A new account must not inherit a previously bound person's history.
            const other = await tx.clientChannelLink.findFirst({
              where: {
                tenantId: p.tenantId,
                clientId: registered.clientId,
                NOT: {
                  provider: 'telegram',
                  providerSubjectHash: telegramSubject,
                  revokedAt: null,
                },
              },
              select: { id: true },
            });
            if (other) throw new BindingPending('client_already_bound');
            const authorityHash = this.encryption.opaqueReference(
              TELEGRAM_CLIENT_RESOLVER,
              JSON.stringify({
                tenantId: p.tenantId,
                clientId: registered.clientId,
                crmLinkId: mapping.id,
                provider: registry.provider,
                externalId,
                phone: p.phone,
                observedAt,
                source: hash(source),
              }),
            );
            const result = await this.links.bindTelegramLoginInTransaction(tx, {
              tenantId: p.tenantId,
              clientId: registered.clientId,
              provider: 'maya_user',
              providerSubjectHash: subject,
              method: 'proven_user_client_link',
              verifier: TELEGRAM_CLIENT_RESOLVER,
              verificationIdentityHash: hash([
                TELEGRAM_CLIENT_RESOLVER,
                p.tenantId,
                p.flowId,
                p.userId,
              ]),
              channelControlProofHash: hash([
                p.tokenHash,
                p.sessionId,
                p.flowId,
                telegramSubject,
                subject,
                before.admission.proofHash,
              ]),
              clientAuthorityProofHash: authorityHash,
              validUntil: new Date(
                Math.min(before.admission.expiresAt, now.getTime() + 60_000),
              ),
            });
            await tx.auditLog.create({
              data: {
                scope: 'tenant',
                tenantId: p.tenantId,
                userId: p.userId,
                action: 'client.telegram_initial_link',
                entityType: 'ClientChannelLink',
                entityId: result.link.id,
                metadataJson: {
                  contract: TELEGRAM_CLIENT_RESOLVER,
                  actorContext: 'authenticated_telegram_login',
                  actorSessionId: p.sessionId,
                  actorRole: this.context.get()!.role,
                  verificationIdentityHash:
                    result.link.verificationIdentityHash,
                  verificationEvidenceHash:
                    result.link.verificationEvidenceHash,
                  clientAuthorityProofHash: authorityHash,
                  operation: {
                    contract: TELEGRAM_BINDING_OPERATION,
                    acceptedAt: before.admission.acceptedAt,
                    expiresAt: before.admission.expiresAt,
                    originalTokenExpiresAt: p.expiresAt,
                    proofHash: before.admission.proofHash,
                  },
                },
              },
            });
            return { status: 'linked' as const };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (attempt < 4 && this.retryable(error, true)) continue;
        throw error;
      }
    }
  }

  private retryable(error: unknown, linkCollision = false) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2034' ||
        (error.code === 'P2010' && String(error.meta?.code) === '40001') ||
        (linkCollision &&
          error.code === 'P2002' &&
          error.meta?.modelName === 'ClientChannelLink'))
    );
  }

  private async registerCard(
    input: {
      tenantId: string;
      provider: string;
      externalId: string;
    },
    admission: AdmittedTelegramLogin,
  ) {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0)
        await this.prisma.$transaction((tx) =>
          this.assertLogin(tx, admission.login, admission),
        );
      try {
        return await this.identities.registerCrmClient(input);
      } catch (error) {
        if (attempt >= 4 || !this.retryable(error)) throw error;
        // Immediate retries can all lose before the competing registration
        // commits. Keep five attempts, with 25/50/100/200 ms outside a DB
        // transaction; never extend the server-admitted operation deadline.
        const delayMs = 25 * 2 ** attempt;
        const { now } = await this.prisma.$transaction((tx) =>
          this.assertLogin(tx, admission.login, admission),
        );
        if (now.getTime() + delayMs >= admission.expiresAt)
          throw new BindingPending('fresh_telegram_verification_required');
        await wait(delayMs);
      }
    }
  }

  private async assertLogin(
    tx: Prisma.TransactionClient,
    p: VerifiedTelegramClientLogin,
    admission?: AdmittedTelegramLogin,
  ) {
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>(
      Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`,
    );
    const now = clock.now;
    if (
      !Number.isFinite(p.issuedAt) ||
      !Number.isFinite(p.expiresAt) ||
      p.issuedAt > now.getTime() + 30_000 ||
      p.issuedAt < now.getTime() - 600_000 ||
      (!admission && p.expiresAt <= now.getTime()) ||
      (admission &&
        (admission.login !== p ||
          admission.acceptedAt > now.getTime() ||
          admission.acceptedAt >= p.expiresAt ||
          admission.expiresAt >
            admission.acceptedAt + TELEGRAM_BINDING_OPERATION_MS ||
          admission.expiresAt <= now.getTime()))
    )
      throw new BindingPending('fresh_telegram_verification_required');
    const session = await tx.authSession.findUnique({
      where: { id: p.sessionId },
      include: { user: true, membership: true },
    });
    const flow = await tx.authFlowState.findUnique({
      where: { id_tenantId: { id: p.flowId, tenantId: p.tenantId } },
    });
    const identity = await tx.authIdentity.findUnique({
      where: {
        tenantId_provider_providerUserId: {
          tenantId: p.tenantId,
          provider: 'telegram',
          providerUserId: p.providerUserId,
        },
      },
    });
    if (
      !session ||
      session.userId !== p.userId ||
      session.tenantId !== p.tenantId ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'active' ||
      !session.membership ||
      session.membership.status !== 'active' ||
      session.membership.userId !== p.userId ||
      session.membership.tenantId !== p.tenantId ||
      session.membership.role !== this.context.get()?.role ||
      !identity ||
      identity.userId !== p.userId ||
      identity.phone !== p.phone ||
      !flow ||
      flow.provider !== 'telegram' ||
      !flow.consumedAt ||
      flow.expiresAt <= now ||
      flow.consumedAt > now ||
      p.issuedAt < flow.createdAt.getTime() - 30_000
    )
      throw new BindingPending('current_telegram_login_required');
    return {
      now,
      sessionExpiresAt: session.expiresAt.getTime(),
      flowExpiresAt: flow.expiresAt.getTime(),
    };
  }

  private async source(tx: Prisma.TransactionClient, tenantId: string) {
    const integration = await tx.crmIntegration.findUnique({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        status: true,
        settingsJson: true,
        baseUrl: true,
        updatedAt: true,
      },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { calendarSource: true, status: true },
    });
    if (
      !integration ||
      integration.status !== 'active' ||
      !['yclients', 'altegio'].includes(integration.provider) ||
      tenant?.calendarSource !== 'external' ||
      !['active', 'trial'].includes(tenant.status)
    )
      throw new BindingPending('client_source_unavailable');
    return integration;
  }

  private async existing(
    tx: Prisma.TransactionClient,
    p: VerifiedTelegramClientLogin,
    subject: string,
    telegramSubject: string,
  ) {
    const history = await tx.clientChannelLink.findMany({
      where: {
        tenantId: p.tenantId,
        OR: [
          { provider: 'maya_user', providerSubjectHash: subject },
          { provider: 'telegram', providerSubjectHash: telegramSubject },
        ],
      },
      include: { successors: { select: { id: true } } },
    });
    const tips = history.filter((l) => l.successors.length === 0);
    if (tips.some((l) => l.revokedAt))
      throw new BindingPending('client_reverification_required');
    const maya = tips.filter((l) => l.provider === 'maya_user');
    if (
      maya.length > 1 ||
      tips.filter((l) => l.provider === 'telegram').length > 1 ||
      tips.some(
        (l) => l.verificationVersion !== 1 || l.subjectHashVersion !== 1,
      ) ||
      (maya.length === 1 && tips.some((l) => l.clientId !== maya[0].clientId))
    )
      throw new BindingPending('client_identity_unresolved');
    if (maya.length === 1) {
      await this.links.assertClientEligible(tx, p.tenantId, maya[0].clientId);
      return true;
    }
    return false;
  }
}
