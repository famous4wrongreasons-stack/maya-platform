import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  GOVERNED_STAFF_ROLES,
  governedConfigurationContent,
  governedHash,
  governedNamespace,
  type TenantConfigurationNamespace,
} from './governed-settings.contract';

/** Read/normalization support only. A22 remains the sole configuration writer. */
@Injectable()
export class GovernedSettingsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}
  encrypt(content: unknown) {
    return this.encryption.encrypt(JSON.stringify(content));
  }
  providerAvailable(provider: unknown) {
    const catalog = (
      this.config.get<string>('STAFF_AI_AVAILABLE_PROVIDERS') ?? ''
    )
      .split(',')
      .map((value) => value.trim())
      .filter((value) => ['claude', 'openai'].includes(value));
    if (typeof provider !== 'string' || !catalog.includes(provider))
      throw new ServiceUnavailableException(
        'Tenant staff AI provider is unavailable in the deployment catalogue',
      );
  }
  async actor(tx: Prisma.TransactionClient, tenantId: string, userId: string) {
    const member = await tx.membership.findUnique({
      where: { userId_tenantId: { tenantId, userId } },
      include: {
        user: { select: { status: true } },
        tenant: { select: { status: true } },
      },
    });
    if (
      !member ||
      member.status !== 'active' ||
      member.user.status !== 'active' ||
      member.tenant.status !== 'active' ||
      !GOVERNED_STAFF_ROLES.has(member.role)
    )
      throw new ForbiddenException('Exact active staff membership required');
    return member;
  }
  async configuration(
    tx: Prisma.TransactionClient,
    tenantId: string,
    namespace: TenantConfigurationNamespace,
  ) {
    const row = await tx.tenantBusinessConfigurationRevision.findFirst({
      where: { tenantId, namespace },
      orderBy: { revision: 'desc' },
    });
    const content = row
      ? row.encryptedContent
        ? governedConfigurationContent(
            namespace,
            JSON.parse(this.encryption.decrypt(row.encryptedContent)),
          )
        : null
      : namespace === 'business_rules'
        ? { rules: [] }
        : namespace === 'client_capabilities'
          ? { client_self_visit_history: false }
          : null;
    if (
      row &&
      (!content ||
        governedHash(
          `maya.tenant-configuration-content/1/${namespace}`,
          content,
        ) !== row.contentHash)
    )
      throw new ServiceUnavailableException(
        'Canonical tenant configuration payload unavailable',
      );
    return {
      namespace,
      revision: row?.revision ?? 0,
      previousRevisionId: row?.id ?? null,
      content,
    };
  }
  async personal(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    const member = await this.actor(tx, tenantId, userId);
    const row = await tx.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          tenantId,
          userId,
          section: 'staff_notifications',
        },
      },
    });
    const config = row?.configJson;
    // An old membership has no authority over its successor's preferences.
    const applicable =
      config &&
      typeof config === 'object' &&
      !Array.isArray(config) &&
      config.membershipId === member.id;
    if (applicable) {
      if (
        Object.keys(config).sort().join(',') !==
          'membershipId,schema_version,telegramMutedUntil' ||
        config.schema_version !== 1 ||
        (config.telegramMutedUntil !== null &&
          (typeof config.telegramMutedUntil !== 'string' ||
            !Number.isFinite(Date.parse(config.telegramMutedUntil)) ||
            new Date(config.telegramMutedUntil).toISOString() !==
              config.telegramMutedUntil))
      )
        throw new ServiceUnavailableException(
          'Applicable staff notification preference is invalid',
        );
      return config as Record<string, unknown>;
    }
    if (
      row &&
      (!config ||
        typeof config !== 'object' ||
        Array.isArray(config) ||
        typeof config.membershipId !== 'string')
    )
      throw new ServiceUnavailableException(
        'Staff notification preference authority is unreadable',
      );
    return {
      schema_version: 1,
      membershipId: member.id,
      telegramMutedUntil: null,
    };
  }
  async ownHistoryEnabled(tenantId: string) {
    this.context.assertTenantId(tenantId);
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const current = await this.configuration(
          tx,
          tenantId,
          'client_capabilities',
        );
        return current.content?.client_self_visit_history === true;
      },
      { readOnly: true },
    );
  }
  async read(tenantId: string, userId: string, namespaceValue: unknown) {
    this.context.assertTenantId(tenantId);
    const namespace = governedNamespace(namespaceValue);
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        await this.actor(tx, tenantId, userId);
        return this.configuration(tx, tenantId, namespace);
      },
      { readOnly: true },
    );
  }
  async readPersonal(tenantId: string, userId: string) {
    this.context.assertTenantId(tenantId);
    return canonicalUtcTransaction(
      this.prisma,
      async (tx) => {
        const config = await this.personal(tx, tenantId, userId);
        const generation = await tx.actionTargetMutation.findFirst({
          where: {
            tenantId,
            targetKind: 'setting',
            targetRef: `staff-notifications:${userId}`,
          },
          orderBy: { targetGeneration: 'desc' },
        });
        return {
          tenantId,
          userId,
          config,
          expectedGeneration: (generation?.targetGeneration ?? -1) + 1,
        };
      },
      { readOnly: true },
    );
  }
}

/** Called for a known non-mandatory staff Telegram slot, never for another
 * channel. Unknown/terminal outcomes must be resolved before considering a send. */
export async function staffTelegramEligible(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  expectedMembershipId?: string,
  now = new Date(),
): Promise<boolean> {
  const member = await tx.membership.findUnique({
    where: { userId_tenantId: { tenantId, userId } },
    include: { user: { select: { status: true } } },
  });
  if (
    !member ||
    member.status !== 'active' ||
    member.user.status !== 'active' ||
    !GOVERNED_STAFF_ROLES.has(member.role) ||
    (expectedMembershipId && member.id !== expectedMembershipId)
  )
    return false;
  const row = await tx.dashboardPreference.findUnique({
    where: {
      userId_tenantId_section: {
        tenantId,
        userId,
        section: 'staff_notifications',
      },
    },
  });
  if (!row) return true;
  const value = row.configJson;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.membershipId !== 'string'
  )
    return false;
  if (value.membershipId !== member.id) return true;
  if (
    Object.keys(value).sort().join(',') !==
      'membershipId,schema_version,telegramMutedUntil' ||
    value.schema_version !== 1
  )
    return false;
  if (value.telegramMutedUntil === null) return true;
  return (
    typeof value.telegramMutedUntil === 'string' &&
    Number.isFinite(Date.parse(value.telegramMutedUntil)) &&
    new Date(value.telegramMutedUntil).toISOString() ===
      value.telegramMutedUntil &&
    Date.parse(value.telegramMutedUntil) <= now.getTime()
  );
}
