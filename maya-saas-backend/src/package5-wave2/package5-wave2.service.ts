import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  PACKAGE5_WAVE2_POLICY_VERSION,
  PACKAGE5_WAVE2_REGISTRATIONS,
  type Package5Wave2ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Mode = 'shadow' | 'execute';
type Tx = Prisma.TransactionClient;

const ADMIN_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);
const OWNER_ROLES = new Set(['tenant_owner', 'business_owner']);
const BUSINESS_ROLES = new Set([
  ...ADMIN_ROLES,
  'manager',
  'branch_manager',
  'provider',
  'employee',
  'staff',
]);
const PLATFORM_ROLES = new Set(['platform_owner', 'platform_admin']);
const ASSIGNABLE_ROLES = new Set([
  'tenant_owner',
  'tenant_admin',
  'branch_manager',
  'staff',
]);
const STAFF_ACCESS_ROLES = new Set(['administrator', 'staff']);
const BRANDING_FIELDS = new Set([
  'logoUrl',
  'iconUrl',
  'faviconUrl',
  'appName',
  'primaryColor',
  'secondaryColor',
  'accentColor',
  'backgroundColor',
  'surfaceColor',
  'textPrimaryColor',
  'textSecondaryColor',
  'backgroundImageUrl',
  'fontFamily',
  'headingFontFamily',
  'buttonRadius',
  'buttonStyle',
  'themeMode',
  'borderRadiusJson',
  'contactDetailsJson',
  'socialLinksJson',
  'mapLinksJson',
  'legalLinksJson',
  'splashScreenJson',
  'onboardingJson',
  'storeListingJson',
  'emailBrandingJson',
  'telegramBrandingJson',
  'themeJson',
]);
const TENANT_CONFIG_FIELDS = new Set([
  'name',
  'slug',
  'industryPresetId',
  'calendarSource',
  'defaultCurrency',
  'defaultTimezone',
  'defaultLocale',
  'customDomain',
  'subdomain',
  'trialEndsAt',
  'allowSelfRegistration',
  'bookingMode',
]);

export type Package5Wave2Command =
  | {
      operation: 'configure_staff_access';
      sourceIntentRef: string;
      accessId: string;
      role: 'administrator' | 'staff';
      login?: {
        userId: string;
        email: string;
        phone?: string | null;
        passwordHash: string;
      };
    }
  | {
      operation: 'claim_team_owner';
      sourceIntentRef: string;
      accessId: string;
    }
  | {
      operation: 'revoke_other_session';
      sourceIntentRef: string;
      sessionId: string;
      currentSessionId: string;
    }
  | {
      operation: 'revoke_all_sessions';
      sourceIntentRef: string;
      currentSessionId: string;
    }
  | {
      operation: 'link_social_identity';
      sourceIntentRef: string;
      assertion: {
        verified: true;
        provider: 'yandex' | 'telegram';
        providerUserId: string;
        email?: string | null;
        phone?: string | null;
        profileJson?: Record<string, unknown> | null;
      };
    }
  | {
      operation: 'update_tenant_configuration';
      sourceIntentRef: string;
      changes: Record<string, unknown>;
    }
  | {
      operation: 'update_tenant_branding';
      sourceIntentRef: string;
      changes: Record<string, unknown>;
    }
  | {
      operation: 'upload_tenant_logo';
      sourceIntentRef: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
      bytes: Buffer;
    }
  | {
      operation: 'create_tenant_user';
      sourceIntentRef: string;
      userId: string;
      email: string;
      phone?: string | null;
      encryptedName?: string | null;
      passwordHash: string;
      role: 'tenant_owner' | 'tenant_admin' | 'branch_manager' | 'staff';
      branchId?: string | null;
    }
  | {
      operation: 'create_provider_user';
      sourceIntentRef: string;
      providerId: string;
      userId: string;
      email: string;
      phone?: string | null;
      encryptedName?: string | null;
      passwordHash: string;
    }
  | {
      operation: 'suspend_tenant';
      sourceIntentRef: string;
    }
  | {
      operation: 'reactivate_tenant';
      sourceIntentRef: string;
    }
  | {
      operation: 'create_tenant_branch';
      sourceIntentRef: string;
      branchId: string;
      name: string;
      address?: string | null;
      phone?: string | null;
      timezone?: string | null;
    };

export interface Package5Wave2Actor {
  userId: string;
}

export interface Package5Wave2Prepared {
  request: TrustedActionExecutionRequestV1;
  command: Package5Wave2Command;
  actor: Package5Wave2Actor;
  existingExecution: ActionExecution | null;
}

export interface Package5Wave2ShadowResult {
  actionClass: Package5Wave2ActionClass;
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  businessMutations: 0;
  providerWrites: 0;
}

export interface Package5Wave2ExecutionValue {
  actionClass: Package5Wave2ActionClass;
  actionExecutionId: string;
  targetRef: string;
  targetGeneration: number;
  businessMutations: 0 | 1;
  providerWrites: 0 | 1;
  unknownApplicable: boolean;
}

export interface Package5Wave2StoredObject {
  url: string;
  contentHash: string;
}

export interface Package5Wave2ObjectStore {
  put(input: {
    requestIdentityHash: string;
    contentHash: string;
    mimeType: string;
    bytes: Buffer;
  }): Promise<Package5Wave2StoredObject>;
  head(requestIdentityHash: string): Promise<Package5Wave2StoredObject | null>;
}

export class Package5Wave2Error extends Error {}

export class Package5Wave2AmbiguousDispatchError extends Error {}

function canonical(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return { sha256: wave2Hash(value), byteLength: value.length };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value;
}

export function wave2Hash(value: unknown): string {
  const data = Buffer.isBuffer(value)
    ? value
    : Buffer.from(JSON.stringify(canonical(value)));
  return createHash('sha256').update(data).digest('hex');
}

@Injectable()
export class Package5Wave2ShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly kernel: ActionEngineKernel,
  ) {}

  async plan(
    tenantId: string,
    actor: Package5Wave2Actor,
    command: Package5Wave2Command,
  ): Promise<Package5Wave2ShadowResult> {
    const prepared = await this.build(tenantId, actor, command, 'shadow');
    const execution =
      prepared.existingExecution ??
      (await this.actionEngine.planShadow(prepared.request));
    if (
      !execution.dryRun ||
      execution.state !== ActionExecutionState.NOT_EXECUTED ||
      execution.notExecutedReasonCode !== 'shadow_only'
    ) {
      throw new Package5Wave2Error(
        'Existing Shadow execution does not preserve non-execution',
      );
    }
    return {
      actionClass: execution.actionClass as Package5Wave2ActionClass,
      actionExecutionId: execution.id,
      outcome: 'planned',
      shadowDivergences: 0,
      businessMutations: 0,
      providerWrites: 0,
    };
  }

  async build(
    tenantId: string,
    actor: Package5Wave2Actor,
    command: Package5Wave2Command,
    mode: Mode,
  ): Promise<Package5Wave2Prepared> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const registration = PACKAGE5_WAVE2_REGISTRATIONS.find(
      (candidate) => candidate.operation === command.operation,
    );
    if (!registration)
      throw new BadRequestException('Wave 2 operation unknown');
    const authority = await this.resolveActor(scoped, actor.userId, command);
    const sourceRef = `p5w2:${wave2Hash({ sourceIntentRef: this.bounded(command.sourceIntentRef, 240) })}`;
    const requestMaterialHash = this.requestMaterialHash(command);
    const capability =
      mode === 'shadow'
        ? registration.shadowCapability
        : registration.executableCapability;
    const prior = await this.prisma.actionExecution.findMany({
      where: { tenantId: scoped, capability, sourceRef },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (prior.length > 1)
      throw new Package5Wave2Error(
        'Source identity resolved to multiple Wave 2 executions',
      );
    if (prior[0]) {
      const input = await this.kernel.readTrustedNormalizedInput(
        scoped,
        prior[0].id,
      );
      if (
        input.operation !== command.operation ||
        input.requestMaterialHash !== requestMaterialHash ||
        input.actorIdentityHash !== authority.actorIdentityHash ||
        input.actorMembershipId !== authority.membershipId
      ) {
        throw new Package5Wave2Error(
          'Source identity was reused with changed action material',
        );
      }
      const request: TrustedActionExecutionRequestV1 = {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: scoped,
        capability,
        source: {
          type: authority.membershipId
            ? mode === 'shadow'
              ? 'synthetic_shadow'
              : 'authenticated_request'
            : 'legacy_bridge',
          occurrenceScope: `package5-wave2:${command.operation}:${prior[0].targetRef}:g${this.integer(input.targetGeneration)}`,
          sourceRef,
          ...(authority.membershipId ? { actorUserId: actor.userId } : {}),
        },
        targetRef: prior[0].targetRef,
        input,
        evidenceRefs: [`package5-wave2-retry:${prior[0].id}`],
        callerIdempotency: {
          scope: `package5.wave2.${mode}.${command.operation}`,
          key: sourceRef,
        },
      };
      return {
        request,
        command,
        actor,
        existingExecution: prior[0],
      };
    }
    const facts = await this.resolveFacts(scoped, actor.userId, command);
    const targetGeneration = await this.nextGeneration(
      scoped,
      registration.targetKind,
      facts.targetRef,
    );
    const beforeStateHash =
      facts.before === null ? null : wave2Hash(facts.before);
    const desiredStateHash = wave2Hash(facts.desired);
    const policySnapshotHash = wave2Hash({
      contract: PACKAGE5_WAVE2_POLICY_VERSION,
      tenantId: scoped,
      operation: command.operation,
      targetKind: registration.targetKind,
      targetRef: facts.targetRef,
      targetGeneration,
      actorIdentityHash: authority.actorIdentityHash,
      actorRole: authority.role,
      oneTargetCount: 1,
      bulkMutation: false,
    });
    const providerRequestIdentityHash =
      command.operation === 'upload_tenant_logo'
        ? wave2Hash({
            contract: 'package5.wave2.object-request/1',
            tenantId: scoped,
            targetRef: facts.targetRef,
            contentHash: desiredStateHash,
          })
        : null;
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: scoped,
      capability,
      source: {
        type: authority.membershipId
          ? mode === 'shadow'
            ? 'synthetic_shadow'
            : 'authenticated_request'
          : 'legacy_bridge',
        occurrenceScope: `package5-wave2:${command.operation}:${facts.targetRef}:g${targetGeneration}`,
        sourceRef,
        ...(authority.membershipId ? { actorUserId: actor.userId } : {}),
      },
      targetRef: facts.targetRef,
      input: {
        operation: command.operation,
        targetKind: registration.targetKind,
        targetRef: facts.targetRef,
        mutationKey: `g${targetGeneration}:${command.operation}`,
        targetGeneration,
        beforeStateHash,
        afterStateHash: desiredStateHash,
        desiredStateHash,
        requestMaterialHash,
        actorMembershipId: authority.membershipId,
        actorRole: authority.role,
        actorIdentityHash: authority.actorIdentityHash,
        policyVersion: PACKAGE5_WAVE2_POLICY_VERSION,
        policySnapshotHash,
        approvalRequirement: 'SERVER_DERIVED_AUTHORITY',
        oneTargetCount: 1,
        bulkMutation: false,
        changedFields: facts.changedFields,
        intendedMutation: command.operation,
        mutationPerformed: false,
        providerOperation:
          command.operation === 'upload_tenant_logo'
            ? 'object_store_put'
            : null,
        providerRequestIdentityHash,
        providerObjectContentHash:
          command.operation === 'upload_tenant_logo'
            ? wave2Hash(command.bytes)
            : null,
      },
      evidenceRefs: [
        `package5-wave2-policy:${policySnapshotHash}`,
        `package5-wave2-desired:${desiredStateHash}`,
      ],
      callerIdempotency: {
        scope: `package5.wave2.${mode}.${command.operation}`,
        key: sourceRef,
      },
    };
    return { request, command, actor, existingExecution: null };
  }

  private requestMaterialHash(command: Package5Wave2Command) {
    return wave2Hash(
      Object.fromEntries(
        Object.entries(command).filter(([key]) => key !== 'sourceIntentRef'),
      ),
    );
  }

  async safeDesired(
    tenantId: string,
    actorUserId: string,
    command: Package5Wave2Command,
  ) {
    return (await this.resolveFacts(tenantId, actorUserId, command)).desired;
  }

  private async resolveActor(
    tenantId: string,
    userId: string,
    command: Package5Wave2Command,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { status: true } },
      },
    });
    let role: string;
    let membershipId: string | null;
    if (membership) {
      if (
        membership.status !== 'active' ||
        membership.user.status !== 'active'
      ) {
        throw new ForbiddenException('Active tenant actor is required');
      }
      role = membership.role;
      membershipId = membership.id;
    } else {
      const platform = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, tenantId: true },
      });
      if (
        !platform ||
        platform.status !== 'active' ||
        platform.tenantId !== null ||
        !PLATFORM_ROLES.has(platform.role)
      ) {
        throw new ForbiddenException('Actor has no authority in this tenant');
      }
      role = platform.role;
      membershipId = null;
    }
    this.assertRole(command, role);
    return {
      role,
      membershipId,
      actorIdentityHash: wave2Hash({ tenantId, userId, role }),
    };
  }

  private assertRole(command: Package5Wave2Command, role: string) {
    if (
      command.operation === 'revoke_other_session' ||
      command.operation === 'revoke_all_sessions'
    ) {
      return;
    }
    if (command.operation === 'link_social_identity') {
      if (!BUSINESS_ROLES.has(role))
        throw new ForbiddenException('Business role required');
      return;
    }
    if (command.operation === 'claim_team_owner') {
      if (!OWNER_ROLES.has(role))
        throw new ForbiddenException('Owner role required');
      return;
    }
    if (
      command.operation === 'suspend_tenant' ||
      command.operation === 'reactivate_tenant'
    ) {
      if (!PLATFORM_ROLES.has(role))
        throw new ForbiddenException('Platform authority required');
      return;
    }
    if (!ADMIN_ROLES.has(role) && !PLATFORM_ROLES.has(role)) {
      throw new ForbiddenException('Administrative authority required');
    }
  }

  private async resolveFacts(
    tenantId: string,
    actorUserId: string,
    command: Package5Wave2Command,
  ): Promise<{
    targetRef: string;
    before: unknown;
    desired: unknown;
    changedFields: string[];
  }> {
    switch (command.operation) {
      case 'configure_staff_access': {
        if (!STAFF_ACCESS_ROLES.has(command.role))
          throw new BadRequestException('Staff role invalid');
        const access = await this.prisma.crmStaffAccess.findUnique({
          where: { id: command.accessId },
          select: {
            id: true,
            tenantId: true,
            staffId: true,
            userId: true,
            role: true,
            status: true,
          },
        });
        if (!access || access.tenantId !== tenantId)
          throw new NotFoundException('Exact staff access missing');
        if (access.status === 'disabled')
          throw new ConflictException(
            'CRM-disabled access is projection-owned',
          );
        if (OWNER_ROLES.has(access.role) || access.userId === actorUserId) {
          throw new ForbiddenException('Owner access is read-only here');
        }
        if (command.login) {
          const conflict = await this.prisma.user.findFirst({
            where: {
              id: { not: command.login.userId },
              memberships: { some: { tenantId } },
              OR: [
                { email: command.login.email.trim().toLowerCase() },
                ...(command.login.phone
                  ? [{ phone: command.login.phone.trim() }]
                  : []),
              ],
            },
            select: { id: true },
          });
          if (conflict)
            throw new ConflictException('Staff login identity conflicts');
        }
        const desired = {
          role: command.role,
          status: command.login || access.userId ? 'active' : 'pending_contact',
          userId: command.login?.userId ?? access.userId,
          loginFingerprint: command.login
            ? wave2Hash({
                email: command.login.email.trim().toLowerCase(),
                phone: command.login.phone?.trim() ?? null,
                passwordHash: command.login.passwordHash,
              })
            : null,
        };
        return {
          targetRef: access.id,
          before: access,
          desired,
          changedFields: ['role', 'status', 'userId'],
        };
      }
      case 'claim_team_owner': {
        const access = await this.prisma.crmStaffAccess.findUnique({
          where: { id: command.accessId },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            role: true,
            status: true,
          },
        });
        if (!access || access.tenantId !== tenantId)
          throw new NotFoundException('Exact staff access missing');
        if (access.status === 'disabled')
          throw new ConflictException('Disabled access cannot be claimed');
        if (access.userId && access.userId !== actorUserId)
          throw new ConflictException('Access already claimed');
        const other = await this.prisma.crmStaffAccess.findFirst({
          where: {
            tenantId,
            id: { not: access.id },
            OR: [
              { userId: actorUserId },
              { role: { in: ['tenant_owner', 'business_owner'] } },
            ],
          },
          select: { id: true },
        });
        if (other)
          throw new ConflictException('Owner already has an access identity');
        const membership = await this.prisma.membership.findUniqueOrThrow({
          where: { userId_tenantId: { userId: actorUserId, tenantId } },
          select: { role: true },
        });
        return {
          targetRef: access.id,
          before: access,
          desired: {
            userId: actorUserId,
            role: membership.role,
            status: 'active',
          },
          changedFields: ['userId', 'role', 'status'],
        };
      }
      case 'revoke_other_session': {
        if (command.sessionId === command.currentSessionId)
          throw new BadRequestException(
            'Current logout is an auth protocol action',
          );
        const session = await this.prisma.authSession.findUnique({
          where: { id: command.sessionId },
        });
        if (
          !session ||
          session.tenantId !== tenantId ||
          session.userId !== actorUserId
        )
          throw new NotFoundException('Owned session missing');
        if (session.revokedAt)
          throw new ConflictException('Session already revoked');
        return {
          targetRef: session.id,
          before: this.sessionState(session),
          desired: {
            ...this.sessionState(session),
            revoked: true,
            reason: 'user_revoked',
          },
          changedFields: ['revokedAt', 'revokeReason'],
        };
      }
      case 'revoke_all_sessions': {
        const sessions = await this.prisma.authSession.findMany({
          where: { tenantId, userId: actorUserId, revokedAt: null },
          orderBy: { id: 'asc' },
          select: { id: true },
        });
        if (!sessions.length)
          throw new ConflictException('No active sessions remain');
        return {
          targetRef: `${actorUserId}:sessions`,
          before: { activeSessionIds: sessions.map((row) => row.id) },
          desired: { activeSessionIds: [], revokeReason: 'user_revoked_all' },
          changedFields: ['revokedAt', 'revokeReason'],
        };
      }
      case 'link_social_identity': {
        if (command.assertion.verified !== true)
          throw new ForbiddenException('Verified provider assertion required');
        const provider = command.assertion.provider;
        const providerUserId = this.bounded(
          command.assertion.providerUserId,
          240,
        );
        const existing = await this.prisma.authIdentity.findUnique({
          where: {
            tenantId_provider_providerUserId: {
              tenantId,
              provider,
              providerUserId,
            },
          },
          include: { user: { select: { role: true } } },
        });
        if (
          existing &&
          existing.userId !== actorUserId &&
          !['client', 'customer'].includes(existing.user.role)
        ) {
          throw new ConflictException('Social identity belongs to staff');
        }
        const refHash = wave2Hash({ tenantId, provider, providerUserId });
        return {
          targetRef: `auth-identity:${refHash}`,
          before: existing
            ? {
                id: existing.id,
                userId: existing.userId,
                provider,
                providerRef: refHash,
              }
            : null,
          desired: {
            userId: actorUserId,
            provider,
            providerRef: refHash,
            assertionHash: wave2Hash(command.assertion),
          },
          changedFields: ['userId', 'providerAssertion'],
        };
      }
      case 'update_tenant_configuration': {
        this.assertFields(
          command.changes,
          TENANT_CONFIG_FIELDS,
          'tenant configuration',
        );
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { brandingSettings: { select: { themeJson: true } } },
        });
        if (!tenant) throw new NotFoundException('Tenant missing');
        return {
          targetRef: tenantId,
          before: this.tenantState(tenant),
          desired: {
            ...this.tenantState(tenant),
            ...(canonical(command.changes) as object),
          },
          changedFields: Object.keys(command.changes).sort(),
        };
      }
      case 'update_tenant_branding': {
        this.assertFields(command.changes, BRANDING_FIELDS, 'branding');
        const branding = await this.prisma.brandingSettings.findUnique({
          where: { tenantId },
        });
        return {
          targetRef: tenantId,
          before: branding,
          desired: {
            ...(branding ?? {}),
            ...(canonical(command.changes) as object),
          },
          changedFields: Object.keys(command.changes).sort(),
        };
      }
      case 'upload_tenant_logo': {
        if (!command.bytes.length || command.bytes.length > 2 * 1024 * 1024)
          throw new BadRequestException('Logo size invalid');
        const branding = await this.prisma.brandingSettings.findUnique({
          where: { tenantId },
          select: { logoUrl: true },
        });
        const contentHash = wave2Hash(command.bytes);
        return {
          targetRef: tenantId,
          before: branding,
          desired: { contentHash, mimeType: command.mimeType },
          changedFields: ['logoUrl'],
        };
      }
      case 'create_tenant_user': {
        if (!ASSIGNABLE_ROLES.has(command.role))
          throw new BadRequestException('User role invalid');
        if (command.role === 'tenant_owner') {
          const actor = await this.prisma.user.findUnique({
            where: { id: actorUserId },
            select: { role: true },
          });
          if (!actor || !PLATFORM_ROLES.has(actor.role))
            throw new ForbiddenException('Only platform can create owner');
        }
        await this.assertUserCreateFacts(
          tenantId,
          command.userId,
          command.email,
          command.phone,
          command.branchId,
        );
        return {
          targetRef: command.userId,
          before: null,
          desired: this.userDesired(command),
          changedFields: ['user', 'membership'],
        };
      }
      case 'create_provider_user': {
        const provider = await this.prisma.internalProvider.findUnique({
          where: { id_tenantId: { id: command.providerId, tenantId } },
        });
        if (!provider) throw new NotFoundException('Exact provider missing');
        if (provider.userId)
          throw new ConflictException('Provider already has a user');
        await this.assertUserCreateFacts(
          tenantId,
          command.userId,
          command.email,
          command.phone,
          provider.branchId,
        );
        return {
          targetRef: command.providerId,
          before: { providerId: provider.id, userId: null },
          desired: {
            ...this.userDesired(command),
            providerId: provider.id,
            branchId: provider.branchId,
          },
          changedFields: ['user', 'membership', 'providerUserId'],
        };
      }
      case 'suspend_tenant':
      case 'reactivate_tenant': {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
        });
        if (!tenant) throw new NotFoundException('Tenant missing');
        if (
          command.operation === 'suspend_tenant' &&
          tenant.status === 'suspended'
        )
          throw new ConflictException('Tenant already suspended');
        if (command.operation === 'reactivate_tenant') {
          const activeUntil = tenant.currentPeriodEnd ?? tenant.trialEndsAt;
          if (!activeUntil || activeUntil <= new Date())
            throw new ForbiddenException(
              'Current entitlement evidence required',
            );
        }
        return {
          targetRef: tenantId,
          before: this.tenantState(tenant),
          desired: {
            ...this.tenantState(tenant),
            status:
              command.operation === 'suspend_tenant' ? 'suspended' : 'active',
          },
          changedFields: ['status'],
        };
      }
      case 'create_tenant_branch': {
        const existing = await this.prisma.branch.findUnique({
          where: { id_tenantId: { id: command.branchId, tenantId } },
        });
        if (existing)
          throw new ConflictException('Branch identity already exists');
        return {
          targetRef: command.branchId,
          before: null,
          desired: {
            name: this.bounded(command.name, 120),
            address: command.address?.trim() || null,
            phone: command.phone?.trim() || null,
            timezone: command.timezone?.trim() || null,
          },
          changedFields: ['branch'],
        };
      }
    }
  }

  private async assertUserCreateFacts(
    tenantId: string,
    userId: string,
    emailValue: string,
    phoneValue?: string | null,
    branchId?: string | null,
  ) {
    this.bounded(userId, 240);
    const email = this.bounded(emailValue, 320).toLowerCase();
    if (branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id_tenantId: { id: branchId, tenantId } },
        select: { id: true },
      });
      if (!branch) throw new NotFoundException('Tenant branch missing');
    }
    const conflict = await this.prisma.user.findFirst({
      where: {
        memberships: { some: { tenantId } },
        OR: [
          { id: userId },
          { email },
          ...(phoneValue ? [{ phone: phoneValue.trim() }] : []),
        ],
      },
      select: { id: true },
    });
    if (conflict) throw new ConflictException('User identity already exists');
  }

  private userDesired(
    command: Extract<
      Package5Wave2Command,
      { operation: 'create_tenant_user' | 'create_provider_user' }
    >,
  ) {
    return {
      userId: command.userId,
      emailFingerprint: wave2Hash(command.email.trim().toLowerCase()),
      phoneFingerprint: command.phone ? wave2Hash(command.phone.trim()) : null,
      credentialFingerprint: wave2Hash({
        passwordHash: command.passwordHash,
        encryptedName: command.encryptedName ?? null,
      }),
      role:
        command.operation === 'create_provider_user'
          ? 'provider'
          : command.role,
      branchId:
        command.operation === 'create_tenant_user'
          ? (command.branchId ?? null)
          : null,
    };
  }

  private tenantState(tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    industryPresetId: string | null;
    calendarSource: string;
    defaultCurrency: string;
    defaultTimezone: string;
    defaultLocale: string;
    customDomain: string | null;
    subdomain: string | null;
    trialEndsAt: Date | null;
    allowSelfRegistration: boolean;
    brandingSettings?: { themeJson: unknown } | null;
  }) {
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      industryPresetId: tenant.industryPresetId,
      calendarSource: tenant.calendarSource,
      defaultCurrency: tenant.defaultCurrency,
      defaultTimezone: tenant.defaultTimezone,
      defaultLocale: tenant.defaultLocale,
      customDomain: tenant.customDomain,
      subdomain: tenant.subdomain,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      allowSelfRegistration: tenant.allowSelfRegistration,
      bookingMode:
        tenant.brandingSettings?.themeJson &&
        typeof tenant.brandingSettings.themeJson === 'object' &&
        !Array.isArray(tenant.brandingSettings.themeJson)
          ? ((tenant.brandingSettings.themeJson as Record<string, unknown>)
              .booking_mode ?? null)
          : null,
    };
  }

  private sessionState(session: {
    id: string;
    userId: string;
    tenantId: string | null;
    revokedAt: Date | null;
    revokeReason: string | null;
  }) {
    return {
      id: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      revoked: Boolean(session.revokedAt),
      reason: session.revokeReason,
    };
  }

  private assertFields(
    changes: Record<string, unknown>,
    allowed: ReadonlySet<string>,
    label: string,
  ) {
    const fields = Object.keys(changes);
    if (
      !fields.length ||
      fields.length > 24 ||
      fields.some((field) => !allowed.has(field))
    ) {
      throw new BadRequestException(`${label} fields are not allowlisted`);
    }
  }

  private async nextGeneration(
    tenantId: string,
    targetKind: string,
    targetRef: string,
  ) {
    const latest = await this.prisma.actionTargetMutation.findFirst({
      where: { tenantId, targetKind, targetRef },
      orderBy: { targetGeneration: 'desc' },
      select: { targetGeneration: true },
    });
    return (latest?.targetGeneration ?? -1) + 1;
  }

  private integer(value: unknown) {
    if (!Number.isInteger(value) || (value as number) < 0)
      throw new Package5Wave2Error('Target generation is invalid');
    return value as number;
  }

  private bounded(value: string, max: number) {
    const normalized = value.trim();
    if (!normalized || normalized.length > max)
      throw new BadRequestException('Required value is invalid');
    return normalized;
  }
}

export class Package5Wave2ExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly runtime: ActionEngineRuntimeService,
    private readonly planner: Package5Wave2ShadowService,
    private readonly objectStore?: Package5Wave2ObjectStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    prepared: Package5Wave2Prepared,
  ): Promise<Package5Wave2ExecutionValue> {
    const registration = PACKAGE5_WAVE2_REGISTRATIONS.find(
      (candidate) =>
        candidate.executableCapability === prepared.request.capability,
    );
    if (!registration)
      throw new Package5Wave2Error('Wave 2 capability is not executable');
    if (registration.authorityClass === 'AC2')
      return this.executeExternal(prepared);
    const execution = await this.ingress.createExecution(prepared.request);
    return this.executeLocal(execution, registration, prepared);
  }

  async resume(
    prepared: Package5Wave2Prepared,
  ): Promise<Package5Wave2ExecutionValue> {
    return this.execute(prepared);
  }

  private async executeLocal(
    execution: ActionExecution,
    registration: (typeof PACKAGE5_WAVE2_REGISTRATIONS)[number],
    prepared: Package5Wave2Prepared,
  ): Promise<Package5Wave2ExecutionValue> {
    if (execution.state === ActionExecutionState.SUCCEEDED)
      return this.restore(execution);
    if (execution.state !== ActionExecutionState.READY)
      throw new Package5Wave2Error(
        `Execution cannot run from ${execution.state}`,
      );
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    await this.assertMaterial(execution.tenantId, prepared, input);
    return this.serializable(async (tx) => {
      const targetKind = this.text(input.targetKind);
      const targetRef = this.text(input.targetRef);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${execution.tenantId}:p5-wave2:${targetKind}:${targetRef}`}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "ActionExecution" WHERE id = ${execution.id} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED)
        return this.restore(locked);
      this.assertExecutable(locked, registration.actionClass);
      await this.assertActor(tx, locked, prepared, input);
      await this.assertCurrent(tx, locked, prepared.command, input);
      const attemptId = await this.begin(
        tx,
        locked,
        'package5.wave2.local-command',
        false,
      );
      await this.mutate(tx, locked, prepared.command);
      await this.recordMutation(tx, locked, input);
      const value = this.value(locked, input, 1, 0, false);
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  private async executeExternal(
    prepared: Package5Wave2Prepared,
  ): Promise<Package5Wave2ExecutionValue> {
    if (!this.objectStore)
      throw new Package5Wave2Error('Object store executor is not configured');
    const command = prepared.command;
    if (command.operation !== 'upload_tenant_logo')
      throw new Package5Wave2Error('External operation mismatch');
    const runtimeValue = await this.runtime.execute(prepared.request, {
      prepare: async (input, context) => {
        const execution = await this.prisma.actionExecution.findUniqueOrThrow({
          where: {
            id_tenantId: {
              id: context.executionId,
              tenantId: context.tenantId,
            },
          },
        });
        await this.assertMaterial(context.tenantId, prepared, input);
        await this.assertActor(this.prisma, execution, prepared, input);
        return {
          providerRequestIdentityHash: this.text(
            input.providerRequestIdentityHash,
          ),
          contentHash: wave2Hash(command.bytes),
        };
      },
      dispatch: async (input, _transportKey, context) => {
        const stored = await this.objectStore!.put({
          requestIdentityHash: this.text(input.providerRequestIdentityHash),
          contentHash: wave2Hash(command.bytes),
          mimeType: command.mimeType,
          bytes: command.bytes,
        });
        const value = await this.commitLogo(
          context.tenantId,
          context.executionId,
          input,
          stored,
        );
        return {
          value,
          safeResult: value as unknown as Record<string, unknown>,
        };
      },
      reconcile: async (input, _pre, context) => {
        if (!context) return { outcome: 'STILL_UNKNOWN' };
        const stored = await this.objectStore!.head(
          this.text(input.providerRequestIdentityHash),
        );
        if (!stored) return { outcome: 'PROVEN_NOT_EXECUTED' };
        const value = await this.applyLogoDuringReconciliation(
          context.tenantId,
          context.executionId,
          input,
          stored,
        );
        return {
          outcome: 'PROVEN_SUCCEEDED',
          safeResult: value as unknown as Record<string, unknown>,
        };
      },
      restore: (safe) => safe as unknown as Package5Wave2ExecutionValue,
      classifyError: (error, phase) => ({
        kind:
          phase === 'dispatch' ||
          error instanceof Package5Wave2AmbiguousDispatchError
            ? 'unknown'
            : 'definitive',
        outcomeCode:
          phase === 'dispatch'
            ? 'object_dispatch_ambiguous'
            : 'object_prepare_failed',
        errorClass:
          error instanceof Error
            ? error.constructor.name
            : 'ObjectCommandError',
      }),
    });
    const input = await this.kernel.readTrustedNormalizedInput(
      prepared.request.tenantId,
      runtimeValue.actionExecutionId,
    );
    const stored = await this.objectStore.head(
      this.text(input.providerRequestIdentityHash),
    );
    if (!stored)
      throw new Package5Wave2Error(
        'Successful logo execution is missing its provider object',
      );
    await this.commitLogo(
      prepared.request.tenantId,
      runtimeValue.actionExecutionId,
      input,
      stored,
    );
    return runtimeValue;
  }

  private async applyLogoDuringReconciliation(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    stored: Package5Wave2StoredObject,
  ) {
    if (stored.contentHash !== this.text(input.providerObjectContentHash))
      throw new Package5Wave2Error('Stored object hash mismatch');
    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave2:tenant_branding:${tenantId}`}, 0))`,
      );
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: { id_tenantId: { id: executionId, tenantId } },
      });
      const existing = await tx.actionTargetMutation.findUnique({
        where: {
          tenantId_actionExecutionId_mutationKey: {
            tenantId,
            actionExecutionId: executionId,
            mutationKey: this.text(input.mutationKey),
          },
        },
      });
      if (!existing) {
        const current = await tx.brandingSettings.findUnique({
          where: { tenantId },
          select: { logoUrl: true },
        });
        if (current?.logoUrl !== stored.url) {
          const currentHash = current === null ? null : wave2Hash(current);
          if (currentHash !== input.beforeStateHash) {
            throw new Package5Wave2Error(
              'Branding state changed during object dispatch',
            );
          }
          await tx.brandingSettings.upsert({
            where: { tenantId },
            create: { tenantId, logoUrl: stored.url },
            update: { logoUrl: stored.url },
          });
        }
      }
      return this.value(execution, input, 1, 1, true);
    });
  }

  private async commitLogo(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
    stored: Package5Wave2StoredObject,
  ) {
    if (stored.contentHash !== this.text(input.providerObjectContentHash))
      throw new Package5Wave2Error('Stored object hash mismatch');
    return this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave2:tenant_branding:${tenantId}`}, 0))`,
      );
      const existing = await tx.actionTargetMutation.findUnique({
        where: {
          tenantId_actionExecutionId_mutationKey: {
            tenantId,
            actionExecutionId: executionId,
            mutationKey: this.text(input.mutationKey),
          },
        },
      });
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: { id_tenantId: { id: executionId, tenantId } },
      });
      if (!existing) {
        const current = await tx.brandingSettings.findUnique({
          where: { tenantId },
          select: { logoUrl: true },
        });
        if (current?.logoUrl !== stored.url) {
          const currentHash = current === null ? null : wave2Hash(current);
          if (currentHash !== input.beforeStateHash) {
            throw new Package5Wave2Error(
              'Branding state changed during object dispatch',
            );
          }
          await tx.brandingSettings.upsert({
            where: { tenantId },
            create: { tenantId, logoUrl: stored.url },
            update: { logoUrl: stored.url },
          });
        }
        await this.recordMutation(tx, execution, input);
      }
      return this.value(execution, input, existing ? 0 : 1, 1, true);
    });
  }

  private async assertMaterial(
    tenantId: string,
    prepared: Package5Wave2Prepared,
    input: Record<string, unknown>,
  ) {
    const desired = await this.planner.safeDesired(
      tenantId,
      prepared.actor.userId,
      prepared.command,
    );
    if (wave2Hash(desired) !== input.desiredStateHash)
      throw new Package5Wave2Error(
        'Transient material no longer matches canonical plan',
      );
  }

  private async assertActor(
    tx: Tx,
    execution: ActionExecution,
    prepared: Package5Wave2Prepared,
    input: Record<string, unknown>,
  ) {
    if (execution.actorUserId) {
      const membership = await tx.membership.findUnique({
        where: {
          userId_tenantId: {
            userId: execution.actorUserId,
            tenantId: execution.tenantId,
          },
        },
        include: { user: { select: { status: true } } },
      });
      if (
        !membership ||
        membership.status !== 'active' ||
        membership.user.status !== 'active' ||
        membership.id !== input.actorMembershipId ||
        membership.role !== input.actorRole
      ) {
        throw new Package5Wave2Error('Actor authority changed after planning');
      }
    } else {
      const actor = await tx.user.findUnique({
        where: { id: prepared.actor.userId },
        select: { tenantId: true, role: true, status: true },
      });
      if (
        !actor ||
        actor.tenantId !== null ||
        actor.status !== 'active' ||
        actor.role !== input.actorRole ||
        !PLATFORM_ROLES.has(actor.role) ||
        wave2Hash({
          tenantId: execution.tenantId,
          userId: prepared.actor.userId,
          role: actor.role,
        }) !== input.actorIdentityHash
      ) {
        throw new Package5Wave2Error(
          'Platform authority changed after planning',
        );
      }
    }
  }

  private async assertCurrent(
    tx: Tx,
    execution: ActionExecution,
    command: Package5Wave2Command,
    input: Record<string, unknown>,
  ) {
    const current = await this.currentInTransaction(
      tx,
      execution.tenantId,
      execution.actorUserId ?? '',
      command,
    );
    const currentHash = current === null ? null : wave2Hash(current);
    if (currentHash !== input.beforeStateHash)
      throw new Package5Wave2Error(
        'Target state changed after canonical planning',
      );
  }

  private async currentInTransaction(
    tx: Tx,
    tenantId: string,
    actorUserId: string,
    command: Package5Wave2Command,
  ): Promise<unknown> {
    switch (command.operation) {
      case 'configure_staff_access':
        return tx.crmStaffAccess.findUnique({
          where: { id: command.accessId },
          select: {
            id: true,
            tenantId: true,
            staffId: true,
            userId: true,
            role: true,
            status: true,
          },
        });
      case 'claim_team_owner':
        return tx.crmStaffAccess.findUnique({
          where: { id: command.accessId },
          select: {
            id: true,
            tenantId: true,
            userId: true,
            role: true,
            status: true,
          },
        });
      case 'revoke_other_session': {
        const session = await tx.authSession.findUnique({
          where: { id: command.sessionId },
        });
        return session
          ? {
              id: session.id,
              userId: session.userId,
              tenantId: session.tenantId,
              revoked: Boolean(session.revokedAt),
              reason: session.revokeReason,
            }
          : null;
      }
      case 'revoke_all_sessions': {
        const sessions = await tx.authSession.findMany({
          where: { tenantId, userId: actorUserId, revokedAt: null },
          orderBy: { id: 'asc' },
          select: { id: true },
        });
        return { activeSessionIds: sessions.map((row) => row.id) };
      }
      case 'link_social_identity': {
        const row = await tx.authIdentity.findUnique({
          where: {
            tenantId_provider_providerUserId: {
              tenantId,
              provider: command.assertion.provider,
              providerUserId: command.assertion.providerUserId.trim(),
            },
          },
          include: { user: { select: { role: true } } },
        });
        return row
          ? {
              id: row.id,
              userId: row.userId,
              provider: row.provider,
              providerRef: wave2Hash({
                tenantId,
                provider: row.provider,
                providerUserId: row.providerUserId,
              }),
            }
          : null;
      }
      case 'update_tenant_configuration': {
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          include: { brandingSettings: { select: { themeJson: true } } },
        });
        if (!tenant) return null;
        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          industryPresetId: tenant.industryPresetId,
          calendarSource: tenant.calendarSource,
          defaultCurrency: tenant.defaultCurrency,
          defaultTimezone: tenant.defaultTimezone,
          defaultLocale: tenant.defaultLocale,
          customDomain: tenant.customDomain,
          subdomain: tenant.subdomain,
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
          allowSelfRegistration: tenant.allowSelfRegistration,
          bookingMode:
            tenant.brandingSettings?.themeJson &&
            typeof tenant.brandingSettings.themeJson === 'object' &&
            !Array.isArray(tenant.brandingSettings.themeJson)
              ? ((tenant.brandingSettings.themeJson as Record<string, unknown>)
                  .booking_mode ?? null)
              : null,
        };
      }
      case 'update_tenant_branding':
        return tx.brandingSettings.findUnique({ where: { tenantId } });
      case 'upload_tenant_logo':
        return tx.brandingSettings.findUnique({
          where: { tenantId },
          select: { logoUrl: true },
        });
      case 'create_tenant_user':
        return tx.user.findUnique({
          where: { id: command.userId },
          select: { id: true, tenantId: true },
        });
      case 'create_tenant_branch':
        return tx.branch.findUnique({
          where: {
            id_tenantId: { id: command.branchId, tenantId },
          },
          select: { id: true, tenantId: true },
        });
      case 'create_provider_user': {
        const provider = await tx.internalProvider.findUnique({
          where: { id_tenantId: { id: command.providerId, tenantId } },
          select: { id: true, userId: true },
        });
        return provider
          ? { providerId: provider.id, userId: provider.userId }
          : null;
      }
      case 'suspend_tenant':
      case 'reactivate_tenant': {
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          include: {
            brandingSettings: { select: { themeJson: true } },
          },
        });
        if (!tenant) return null;
        const theme = tenant.brandingSettings?.themeJson;
        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          industryPresetId: tenant.industryPresetId,
          calendarSource: tenant.calendarSource,
          defaultCurrency: tenant.defaultCurrency,
          defaultTimezone: tenant.defaultTimezone,
          defaultLocale: tenant.defaultLocale,
          customDomain: tenant.customDomain,
          subdomain: tenant.subdomain,
          trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
          allowSelfRegistration: tenant.allowSelfRegistration,
          bookingMode:
            theme && typeof theme === 'object' && !Array.isArray(theme)
              ? ((theme as Record<string, unknown>).booking_mode ?? null)
              : null,
        };
      }
    }
  }

  private async mutate(
    tx: Tx,
    execution: ActionExecution,
    command: Package5Wave2Command,
  ) {
    switch (command.operation) {
      case 'configure_staff_access': {
        const access = await tx.crmStaffAccess.findUniqueOrThrow({
          where: { id: command.accessId },
        });
        let userId = access.userId;
        if (command.login) {
          const existing = await tx.user.findUnique({
            where: { id: command.login.userId },
          });
          if (!existing) {
            await tx.user.create({
              data: {
                id: command.login.userId,
                tenantId: execution.tenantId,
                email: command.login.email.trim().toLowerCase(),
                phone: command.login.phone?.trim() ?? null,
                encryptedName: access.encryptedDisplayName,
                passwordHash: command.login.passwordHash,
                role: command.role,
                status: 'active',
                memberships: {
                  create: {
                    tenantId: execution.tenantId,
                    role: command.role,
                    status: 'active',
                    joinedAt: this.now(),
                  },
                },
              },
            });
          } else {
            await tx.user.update({
              where: { id: existing.id },
              data: {
                role: command.role,
                status: 'active',
                email: command.login.email.trim().toLowerCase(),
                phone: command.login.phone?.trim() ?? null,
              },
            });
            await tx.membership.update({
              where: {
                userId_tenantId: {
                  userId: existing.id,
                  tenantId: execution.tenantId,
                },
              },
              data: { role: command.role, status: 'active' },
            });
          }
          userId = command.login.userId;
        }
        await tx.crmStaffAccess.update({
          where: { id: access.id },
          data: {
            role: command.role,
            userId,
            status: userId ? 'active' : 'pending_contact',
          },
        });
        if (userId)
          await tx.authSession.updateMany({
            where: { tenantId: execution.tenantId, userId, revokedAt: null },
            data: {
              revokedAt: this.now(),
              revokeReason: 'crm_staff_access_changed',
            },
          });
        return;
      }
      case 'claim_team_owner': {
        const membership = await tx.membership.findUniqueOrThrow({
          where: {
            userId_tenantId: {
              userId: execution.actorUserId!,
              tenantId: execution.tenantId,
            },
          },
        });
        await tx.crmStaffAccess.update({
          where: { id: command.accessId },
          data: {
            userId: execution.actorUserId,
            role: membership.role,
            status: 'active',
          },
        });
        return;
      }
      case 'revoke_other_session': {
        await tx.authSession.update({
          where: { id: command.sessionId },
          data: { revokedAt: this.now(), revokeReason: 'user_revoked' },
        });
        await tx.authRefreshToken.updateMany({
          where: { sessionId: command.sessionId, revokedAt: null },
          data: { revokedAt: this.now() },
        });
        return;
      }
      case 'revoke_all_sessions': {
        const ids = (
          await tx.authSession.findMany({
            where: {
              tenantId: execution.tenantId,
              userId: execution.actorUserId!,
              revokedAt: null,
            },
            select: { id: true },
          })
        ).map((row) => row.id);
        await tx.authSession.updateMany({
          where: { id: { in: ids } },
          data: { revokedAt: this.now(), revokeReason: 'user_revoked_all' },
        });
        await tx.authRefreshToken.updateMany({
          where: { sessionId: { in: ids }, revokedAt: null },
          data: { revokedAt: this.now() },
        });
        return;
      }
      case 'link_social_identity': {
        const assertion = command.assertion;
        const existing = await tx.authIdentity.findUnique({
          where: {
            tenantId_provider_providerUserId: {
              tenantId: execution.tenantId,
              provider: assertion.provider,
              providerUserId: assertion.providerUserId.trim(),
            },
          },
        });
        const data = {
          userId: execution.actorUserId!,
          email: assertion.email?.trim() ?? null,
          phone: assertion.phone?.trim() ?? null,
          profileJson: (assertion.profileJson ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
        };
        if (existing)
          await tx.authIdentity.update({ where: { id: existing.id }, data });
        else
          await tx.authIdentity.create({
            data: {
              tenantId: execution.tenantId,
              provider: assertion.provider,
              providerUserId: assertion.providerUserId.trim(),
              ...data,
            },
          });
        return;
      }
      case 'update_tenant_configuration': {
        const changes = { ...command.changes };
        const bookingMode = changes.bookingMode;
        delete changes.bookingMode;
        if (changes.trialEndsAt !== undefined) {
          const trialEndsAt = this.stringChange(
            changes.trialEndsAt,
            'trialEndsAt',
          );
          const parsed = trialEndsAt ? new Date(trialEndsAt) : null;
          if (parsed && Number.isNaN(parsed.getTime()))
            throw new Package5Wave2Error('trialEndsAt is invalid');
          changes.trialEndsAt = parsed;
        }
        if (changes.slug)
          changes.slug = this.stringChange(changes.slug, 'slug').toLowerCase();
        if (changes.subdomain)
          changes.subdomain = this.stringChange(
            changes.subdomain,
            'subdomain',
          ).toLowerCase();
        if (changes.customDomain)
          changes.customDomain = this.stringChange(
            changes.customDomain,
            'customDomain',
          ).toLowerCase();
        await tx.tenant.update({
          where: { id: execution.tenantId },
          data: changes,
        });
        if (bookingMode !== undefined) {
          const current = await tx.brandingSettings.findUnique({
            where: { tenantId: execution.tenantId },
            select: { themeJson: true },
          });
          const theme =
            current?.themeJson &&
            typeof current.themeJson === 'object' &&
            !Array.isArray(current.themeJson)
              ? (current.themeJson as Record<string, unknown>)
              : {};
          await tx.brandingSettings.upsert({
            where: { tenantId: execution.tenantId },
            create: {
              tenantId: execution.tenantId,
              themeJson: {
                ...theme,
                booking_mode: bookingMode,
              },
            },
            update: {
              themeJson: {
                ...theme,
                booking_mode: bookingMode,
              },
            },
          });
        }
        return;
      }
      case 'update_tenant_branding':
        await tx.brandingSettings.upsert({
          where: { tenantId: execution.tenantId },
          create: {
            ...command.changes,
            tenantId: execution.tenantId,
          },
          update: command.changes,
        });
        return;
      case 'create_tenant_user':
        await tx.user.create({
          data: {
            id: command.userId,
            tenantId: execution.tenantId,
            branchId: command.branchId ?? null,
            email: command.email.trim().toLowerCase(),
            phone: command.phone?.trim() ?? null,
            encryptedName: command.encryptedName ?? null,
            passwordHash: command.passwordHash,
            role: command.role,
            status: 'active',
            memberships: {
              create: {
                tenantId: execution.tenantId,
                branchId: command.branchId ?? null,
                role: command.role,
                status: 'active',
                joinedAt: this.now(),
              },
            },
          },
        });
        return;
      case 'create_provider_user': {
        const provider = await tx.internalProvider.findUniqueOrThrow({
          where: {
            id_tenantId: {
              id: command.providerId,
              tenantId: execution.tenantId,
            },
          },
        });
        await tx.user.create({
          data: {
            id: command.userId,
            tenantId: execution.tenantId,
            branchId: provider.branchId,
            email: command.email.trim().toLowerCase(),
            phone: command.phone?.trim() ?? null,
            encryptedName: command.encryptedName ?? null,
            passwordHash: command.passwordHash,
            role: 'provider',
            status: 'active',
            memberships: {
              create: {
                tenantId: execution.tenantId,
                branchId: provider.branchId,
                role: 'provider',
                status: 'active',
                joinedAt: this.now(),
              },
            },
          },
        });
        await tx.internalProvider.update({
          where: {
            id_tenantId: { id: provider.id, tenantId: execution.tenantId },
          },
          data: { userId: command.userId },
        });
        return;
      }
      case 'suspend_tenant':
        await tx.tenant.update({
          where: { id: execution.tenantId },
          data: { status: 'suspended' },
        });
        return;
      case 'reactivate_tenant':
        await tx.tenant.update({
          where: { id: execution.tenantId },
          data: { status: 'active' },
        });
        return;
      case 'create_tenant_branch':
        await tx.branch.create({
          data: {
            id: command.branchId,
            tenantId: execution.tenantId,
            name: command.name.trim(),
            address: command.address?.trim() || null,
            phone: command.phone?.trim() || null,
            timezone: command.timezone?.trim() || null,
          },
        });
        return;
      case 'upload_tenant_logo':
        throw new Package5Wave2Error(
          'Logo mutation uses the external executor',
        );
    }
  }

  private async recordMutation(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    await tx.actionTargetMutation.create({
      data: {
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        mutationKey: this.text(input.mutationKey),
        targetKind: this.text(input.targetKind),
        targetRef: this.text(input.targetRef),
        mutationKind: this.text(input.operation),
        targetGeneration: this.integer(input.targetGeneration),
        beforeStateHash:
          input.beforeStateHash === null
            ? null
            : this.text(input.beforeStateHash),
        afterStateHash: this.text(input.afterStateHash),
      },
    });
  }

  private assertExecutable(
    execution: ActionExecution,
    actionClass: Package5Wave2ActionClass,
  ) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.dryRun ||
      execution.actionClass !== actionClass ||
      !execution.capability.endsWith('.execute.v1')
    )
      throw new Package5Wave2Error(
        'Execution is not a canonical Wave 2 action',
      );
  }

  private async begin(
    tx: Tx,
    execution: ActionExecution,
    executorKey: string,
    reconciliationRequired: boolean,
  ) {
    const attemptId = randomUUID();
    const attemptNumber = execution.executionAttemptCount + 1;
    await tx.actionAttempt.create({
      data: {
        id: attemptId,
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        attemptNumber,
        kind: ActionAttemptKind.EXECUTION,
        state: ActionAttemptState.STARTED,
        executorKey,
        executorVersion: 1,
        externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        reconciliationRequired,
        startedAt: this.now(),
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.EXECUTING,
        executionAttemptCount: attemptNumber,
        firstAttemptedAt: execution.firstAttemptedAt ?? this.now(),
        leaseOwner: `package5-wave2:${execution.id}`,
        leaseTokenHash: `local:${execution.id}`,
        leaseExpiresAt: new Date(this.now().getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async finalize(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: Package5Wave2ExecutionValue,
  ) {
    const safe = value as unknown as Prisma.InputJsonValue;
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: safe,
        reconciliationRequired: false,
        finishedAt: this.now(),
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: 'local_transaction_committed',
        safeResultSummaryJson: safe,
        finalizedAt: this.now(),
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private value(
    execution: ActionExecution,
    input: Record<string, unknown>,
    businessMutations: 0 | 1,
    providerWrites: 0 | 1,
    unknownApplicable: boolean,
  ): Package5Wave2ExecutionValue {
    return {
      actionClass: execution.actionClass as Package5Wave2ActionClass,
      actionExecutionId: execution.id,
      targetRef: this.text(input.targetRef),
      targetGeneration: this.integer(input.targetGeneration),
      businessMutations,
      providerWrites,
      unknownApplicable,
    };
  }

  private restore(execution: ActionExecution) {
    if (
      !execution.safeResultSummaryJson ||
      typeof execution.safeResultSummaryJson !== 'object' ||
      Array.isArray(execution.safeResultSummaryJson)
    )
      throw new Package5Wave2Error('Safe result missing');
    return execution.safeResultSummaryJson as unknown as Package5Wave2ExecutionValue;
  }

  private stringChange(value: unknown, label: string) {
    if (typeof value !== 'string')
      throw new Package5Wave2Error(`${label} must be a string`);
    return value;
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : '';
        const message = error instanceof Error ? error.message : '';
        if (
          (code === 'P2034' ||
            /40001|serializ|write conflict/i.test(message)) &&
          attempt < 3
        )
          continue;
        throw error;
      }
    }
    throw new Package5Wave2Error('Wave 2 transaction could not serialize');
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value)
      throw new Package5Wave2Error('Canonical string missing');
    return value;
  }

  private integer(value: unknown): number {
    if (!Number.isSafeInteger(value))
      throw new Package5Wave2Error('Canonical integer missing');
    return value as number;
  }
}
