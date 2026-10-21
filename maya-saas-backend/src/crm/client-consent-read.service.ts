import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelRuntimeService } from './client-channel-runtime.service';
import {
  effectiveClientConsents,
  lockClientConsent,
} from './client-effective-consent';
import { parseConsentRegisterRange } from './consent-register-source';

/** Registered first-party UI read; not a consent write, AI tool or export grant. */
export const OWN_CONSENT_READ = Object.freeze({
  key: 'consent.own.read',
  route: 'GET /privacy/consents',
  shell: 'shell.privacy',
  owner: 'ClientConsentReadService',
  verification: 'SESSION_VERIFIED',
  maxAgeSeconds: 300,
});

@Injectable()
export class ClientConsentReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelRuntimeService,
  ) {}

  private async own<T>(
    proof: string,
    project: (
      tx: Prisma.TransactionClient,
      scope: { tenantId: string; clientId: string },
      now: Date,
      expiresAt: Date,
    ) => Promise<T>,
  ) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(proof) as Record<string, unknown>;
    } catch {
      throw new ForbiddenException('First-party Maya session required');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'credential,type' ||
      parsed.type !== 'maya_jwt' ||
      typeof parsed.credential !== 'string' ||
      !parsed.credential
    )
      throw new ForbiddenException('First-party Maya session required');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // Existing resolver locks the source identity and re-authenticates the live
        // session under that lock. No User/Profile/phone/role-to-Client inference.
        const identity = await this.channels.resolve(proof, tx);
        this.context.assertTenantId(identity.tenantId);
        await lockClientConsent(tx, identity.tenantId, identity.clientId);
        const [clock] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
        if (
          !clock ||
          !(clock.now instanceof Date) ||
          !Number.isFinite(clock.now.getTime()) ||
          !(identity.validUntil instanceof Date) ||
          identity.validUntil <= clock.now
        )
          throw new ForbiddenException('Current verified subject required');
        const scope = {
          tenantId: identity.tenantId,
          clientId: identity.clientId,
        };
        const client = await tx.client.findUnique({
          where: {
            id_tenantId: { id: scope.clientId, tenantId: scope.tenantId },
          },
          select: {
            mergedIntoClientId: true,
            crmLinks: {
              where: { unlinkedAt: null },
              select: { provider: true, externalId: true },
            },
          },
        });
        if (
          !client ||
          client.mergedIntoClientId ||
          (client.crmLinks.length &&
            (await tx.unresolvedClientIdentityHold.findFirst({
              where: {
                tenantId: scope.tenantId,
                resolvedAt: null,
                OR: client.crmLinks,
              },
              select: { id: true },
            })))
        )
          throw new ForbiddenException('client_identity_unresolved');
        return project(
          tx,
          scope,
          clock.now,
          new Date(
            Math.min(
              identity.validUntil.getTime(),
              clock.now.getTime() + OWN_CONSENT_READ.maxAgeSeconds * 1000,
            ),
          ),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  readOwn(proof: string) {
    return this.own(proof, async (tx, scope, now, expiresAt) => {
      const effective = await effectiveClientConsents(
        tx,
        scope.tenantId,
        scope.clientId,
        now,
      );
      const consents = await Promise.all(
        (['privacy', 'marketing'] as const).map(async (kind) => {
          const current = effective[kind];
          const source = current.factId
            ? await tx.clientConsentFact.findUnique({
                where: {
                  id_tenantId: { id: current.factId, tenantId: scope.tenantId },
                },
              })
            : null;
          if (
            current.factId &&
            (!source ||
              source.tenantId !== scope.tenantId ||
              source.clientId !== scope.clientId ||
              source.kind !== kind)
          )
            throw new ForbiddenException('Consent source mismatch');
          return {
            kind,
            state: current.effective
              ? ('GRANTED' as const)
              : current.decided
                ? ('NOT_GRANTED' as const)
                : ('NEVER_ASKED' as const),
            invalidated: current.invalidated,
            recordedAt: source?.occurredAt.toISOString() ?? null,
            effectiveAt: current.effectiveAt?.toISOString() ?? null,
          };
        }),
      );
      return {
        contract: 'maya.privacy.own-consents/1' as const,
        asOf: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        consents,
        registerExport: {
          available: false as const,
          reason: 'STEP_UP_UNAVAILABLE' as const,
        },
      };
    });
  }

  /** K6/P12: ordinary session is never promoted to step-up. A qualification is
   * not a grant, replay token, snapshot, export artifact or completion receipt. */
  async qualifyExport(proof: string, value: unknown) {
    const range = parseConsentRegisterRange(value);
    return this.own(proof, () =>
      Promise.resolve({
        capability: 'consent.register.export' as const,
        available: false as const,
        reason: 'STEP_UP_UNAVAILABLE' as const,
        requiredVerification: 'STEP_UP_VERIFIED' as const,
        range,
      }),
    );
  }
}
