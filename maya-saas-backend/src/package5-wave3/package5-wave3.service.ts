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
  UserRole,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
  PACKAGE5_WAVE3_POLICY_VERSION,
  PACKAGE5_WAVE3_REGISTRATIONS,
  type Package5Wave3ActionClass,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { lockClientChannelIdentity } from '../crm/client-channel-link.service';
import {
  assertConsentChannelBinding,
  type ConsentChannelBinding,
} from '../crm/client-consent-authority';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

type Tx = Prisma.TransactionClient;
type Mode = 'shadow' | 'execute';

const ADMIN_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
  'manager',
  'branch_manager',
]);
const OWNER_ROLE_VALUES: UserRole[] = [
  UserRole.tenant_owner,
  UserRole.business_owner,
  UserRole.tenant_admin,
  UserRole.administrator,
];
const OWNER_ROLES = new Set<string>(OWNER_ROLE_VALUES);
const NOTE_ROLES = new Set([...ADMIN_ROLES, 'provider', 'employee', 'staff']);
export const PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN = 50;

export type StaffDaySlot = { from: string; to: string };

export type Package5Wave3Command =
  | {
      operation: 'update_staff_schedule_day';
      sourceIntentRef: string;
      staffId: string;
      localDate: string;
      expectedProviderRevision: string;
      slots: StaffDaySlot[];
    }
  | {
      operation: 'install_crm_credentials';
      sourceIntentRef: string;
      provider: string;
      encryptedApiToken: string;
      credentialFingerprint: string;
      baseUrl?: string | null;
      settingsJson?: Record<string, unknown>;
    }
  | { operation: 'activate_crm_integration'; sourceIntentRef: string }
  | { operation: 'confirm_crm_import'; sourceIntentRef: string }
  | { operation: 'disconnect_crm_integration'; sourceIntentRef: string }
  | {
      operation: 'update_client_profile';
      sourceIntentRef: string;
      clientId: string;
      preferredLocale: string | null;
    }
  | {
      operation: 'record_client_consent';
      sourceIntentRef: string;
      clientId: string;
      kind: 'privacy' | 'marketing';
      decision: 'grant' | 'revoke';
      occurredAt: Date;
      effectiveAt: Date;
      sourceIdentityHash: string;
    }
  | {
      operation: 'update_client_notes';
      sourceIntentRef: string;
      clientId: string;
      encryptedNotes: string | null;
      notesFingerprint: string;
    };

export interface Package5Wave3Actor {
  userId: string | null;
  consentChannel?: ConsentChannelBinding;
  recheckChannel?: (tx: Tx) => Promise<void>;
}

export interface Package5Wave3ProviderGateway {
  readStaffDay(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    localDate: string;
  }): Promise<{ revision: string; stateHash: string }>;
  replaceStaffDay(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    localDate: string;
    slots: StaffDaySlot[];
    expectedProviderRevision: string;
    requestIdentityHash: string;
  }): Promise<{ stateHash: string }>;
  reconcileStaffDay(input: {
    tenantId: string;
    provider: string;
    staffId: string;
    branchId: string;
    externalStaffId: string;
    localDate: string;
    desiredStateHash: string;
    expectedProviderRevision: string;
    requestIdentityHash: string;
  }): Promise<'PROVEN_SUCCEEDED' | 'PROVEN_NOT_EXECUTED' | 'STILL_UNKNOWN'>;
  verifyCrm(input: {
    tenantId: string;
    provider: string;
  }): Promise<{ snapshotHash: string }>;
  readCrmImport(input: {
    tenantId: string;
    provider: string;
  }): Promise<{ snapshotHash: string; teamChildHashes: string[] }>;
  fingerprintEncryptedValue(input: {
    namespace: string;
    encryptedValue: string;
  }): string;
}

interface Facts {
  targetRef: string;
  before: unknown;
  desired: unknown;
  changedFields: string[];
  providerRequestIdentityHash: string | null;
  expectedProviderRevision: string | null;
  credentialFingerprint: string | null;
  providerSnapshotHash: string | null;
  notesFingerprint: string | null;
  clientId: string | null;
  consentKind: string | null;
  consentDecision: string | null;
  consentOccurredAt: string | null;
  consentEffectiveAt: string | null;
  sourceIdentityHash: string | null;
}

export interface Package5Wave3Prepared {
  request: TrustedActionExecutionRequestV1;
  command: Package5Wave3Command;
  actor: Package5Wave3Actor;
  existingExecution: ActionExecution | null;
}

export interface Package5Wave3ShadowResult {
  actionClass: Package5Wave3ActionClass;
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  businessMutations: 0;
  providerWrites: 0;
}

export interface Package5Wave3ExecutionValue {
  actionClass: Package5Wave3ActionClass;
  actionExecutionId: string;
  targetRef: string;
  targetGeneration: number;
  businessMutations: 1;
  providerWrites: 0 | 1;
  unknownApplicable: boolean;
}

export class Package5Wave3Error extends Error {}
export class Package5Wave3AmbiguousDispatchError extends Error {}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function wave3Hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

@Injectable()
export class Package5Wave3ShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly kernel: ActionEngineKernel,
    private readonly provider: Package5Wave3ProviderGateway,
  ) {}

  async plan(
    tenantId: string,
    actor: Package5Wave3Actor,
    command: Package5Wave3Command,
  ): Promise<Package5Wave3ShadowResult> {
    const prepared = await this.build(tenantId, actor, command, 'shadow');
    const execution =
      prepared.existingExecution ??
      (await this.actionEngine.planShadow(prepared.request));
    if (
      !execution.dryRun ||
      execution.state !== ActionExecutionState.NOT_EXECUTED ||
      execution.notExecutedReasonCode !== 'shadow_only'
    )
      throw new Package5Wave3Error(
        'Wave 3 Shadow did not stop before mutation',
      );
    return {
      actionClass: execution.actionClass as Package5Wave3ActionClass,
      actionExecutionId: execution.id,
      outcome: 'planned',
      shadowDivergences: 0,
      businessMutations: 0,
      providerWrites: 0,
    };
  }

  async build(
    tenantId: string,
    actor: Package5Wave3Actor,
    command: Package5Wave3Command,
    mode: Mode,
  ): Promise<Package5Wave3Prepared> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const registration = PACKAGE5_WAVE3_REGISTRATIONS.find(
      (row) => row.operation === command.operation,
    );
    if (!registration)
      throw new BadRequestException('Unknown Wave 3 operation');
    const authority = await this.resolveActor(scoped, actor, command);
    const sourceIntentRef = this.bounded(command.sourceIntentRef);
    const sourceRef = `p5w3:${wave3Hash(
      command.operation === 'update_staff_schedule_day'
        ? {
            operation: command.operation,
            tenantId: scoped,
            staffId: command.staffId,
            localDate: command.localDate,
            expectedProviderRevision: command.expectedProviderRevision,
          }
        : { sourceIntentRef },
    )}`;
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
      throw new Package5Wave3Error('Source identity has multiple executions');
    if (prior[0]) {
      const input = await this.kernel.readTrustedNormalizedInput(
        scoped,
        prior[0].id,
      );
      const replayCommand =
        command.operation === 'record_client_consent'
          ? {
              ...command,
              occurredAt: new Date(this.inputText(input.consentOccurredAt)),
              effectiveAt: new Date(this.inputText(input.consentEffectiveAt)),
            }
          : command;
      if (
        input.operation !== command.operation ||
        input.requestMaterialHash !== this.requestMaterialHash(replayCommand) ||
        input.actorIdentityHash !== authority.actorIdentityHash
      )
        throw new Package5Wave3Error(
          'Source identity reused with changed material',
        );
      return {
        request: this.retryRequest(
          scoped,
          capability,
          sourceRef,
          actor.userId,
          prior[0],
          input,
          mode,
        ),
        command: replayCommand,
        actor,
        existingExecution: prior[0],
      };
    }
    const facts = await this.resolveFacts(scoped, actor.userId, command);
    const requestMaterialHash = this.requestMaterialHash(command);
    const targetGeneration = await this.nextGeneration(
      scoped,
      registration.targetKind,
      facts.targetRef,
    );
    const beforeStateHash =
      facts.before === null ? null : wave3Hash(facts.before);
    const desiredStateHash = wave3Hash(facts.desired);
    const policySnapshotHash = wave3Hash({
      contract: PACKAGE5_WAVE3_POLICY_VERSION,
      tenantId: scoped,
      operation: command.operation,
      targetRef: facts.targetRef,
      targetGeneration,
      actorRole: authority.role,
      oneTargetCount: 1,
      bulkMutation: false,
    });
    const approvalRequirement =
      registration.family === 'A17'
        ? 'SERVER_DERIVED_OWNER_AUTHORITY'
        : 'SERVER_DERIVED_AUTHORITY';
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: scoped,
      capability,
      source: {
        type: mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
        occurrenceScope: `package5-wave3:${command.operation}:${facts.targetRef}:g${targetGeneration}`,
        sourceRef,
        actorUserId: actor.userId ?? undefined,
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
        ...(actor.consentChannel
          ? { consentChannel: actor.consentChannel }
          : {}),
        actorRole: authority.role,
        actorIdentityHash: authority.actorIdentityHash,
        policyVersion: PACKAGE5_WAVE3_POLICY_VERSION,
        policySnapshotHash,
        approvalRequirement,
        oneTargetCount: 1,
        bulkMutation: false,
        changedFields: facts.changedFields,
        intendedMutation: command.operation,
        mutationPerformed: false,
        providerOperation:
          registration.authorityClass === 'AC2' ? 'replace_staff_day' : null,
        providerRequestIdentityHash: facts.providerRequestIdentityHash,
        expectedProviderRevision: facts.expectedProviderRevision,
        credentialFingerprint: facts.credentialFingerprint,
        providerSnapshotHash: facts.providerSnapshotHash,
        notesFingerprint: facts.notesFingerprint,
        clientId: facts.clientId,
        consentKind: facts.consentKind,
        consentDecision: facts.consentDecision,
        consentOccurredAt: facts.consentOccurredAt,
        consentEffectiveAt: facts.consentEffectiveAt,
        sourceIdentityHash: facts.sourceIdentityHash,
      },
      evidenceRefs: [
        `package5-wave3-policy:${policySnapshotHash}`,
        `package5-wave3-desired:${desiredStateHash}`,
      ],
      callerIdempotency: {
        scope: `package5.wave3.${mode}.${command.operation}`,
        key: sourceRef,
      },
    };
    return { request, command, actor, existingExecution: null };
  }

  private retryRequest(
    tenantId: string,
    capability: string,
    sourceRef: string,
    actorUserId: string | null,
    execution: ActionExecution,
    input: Record<string, unknown>,
    mode: Mode,
  ): TrustedActionExecutionRequestV1 {
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId,
      capability,
      source: {
        type: mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
        occurrenceScope: `package5-wave3:${String(input.operation)}:${execution.targetRef}:g${String(input.targetGeneration)}`,
        sourceRef,
        actorUserId: actorUserId ?? undefined,
      },
      targetRef: execution.targetRef,
      input,
      evidenceRefs: [`package5-wave3-retry:${execution.id}`],
      callerIdempotency: {
        scope: `package5.wave3.${mode}.${String(input.operation)}`,
        key: sourceRef,
      },
    };
  }

  private requestMaterialHash(command: Package5Wave3Command) {
    const material = { ...command } as Record<string, unknown>;
    delete material.sourceIntentRef;
    if (command.operation === 'install_crm_credentials')
      delete material.encryptedApiToken;
    if (command.operation === 'update_client_notes') {
      delete material.encryptedNotes;
    }
    return wave3Hash(material);
  }

  async assertStillCurrent(
    tenantId: string,
    actor: Package5Wave3Actor,
    command: Package5Wave3Command,
    input: Record<string, unknown>,
    db: PrismaClient | Tx = this.prisma,
  ) {
    await this.resolveActor(tenantId, actor, command, db);
    const facts = await this.resolveFacts(tenantId, actor.userId, command, db);
    const beforeHash = facts.before === null ? null : wave3Hash(facts.before);
    if (
      beforeHash !== input.beforeStateHash ||
      wave3Hash(facts.desired) !== input.desiredStateHash ||
      facts.targetRef !== input.targetRef ||
      this.requestMaterialHash(command) !== input.requestMaterialHash
    ) {
      throw new ConflictException('Wave 3 target changed after planning');
    }
  }

  private async resolveActor(
    tenantId: string,
    actor: Package5Wave3Actor,
    command: Package5Wave3Command,
    db: PrismaClient | Tx = this.prisma,
  ) {
    if (command.operation === 'record_client_consent') {
      if (!actor.consentChannel)
        throw new ForbiddenException(
          'Verified Client channel binding required',
        );
      await assertConsentChannelBinding(
        db,
        tenantId,
        command.clientId,
        actor.consentChannel,
      );
      return {
        membershipId: null,
        role: 'client',
        actorIdentityHash: wave3Hash({
          tenantId,
          consentChannel: actor.consentChannel,
        }),
      };
    }
    if (actor.consentChannel || !actor.userId)
      throw new ForbiddenException(
        'Account authority required for this operation',
      );
    const userId = actor.userId;
    const membership = await db.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { status: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active'
    )
      throw new ForbiddenException('Active tenant membership required');
    const role = String(membership.role);
    if (
      command.operation === 'install_crm_credentials' ||
      command.operation === 'activate_crm_integration' ||
      command.operation === 'confirm_crm_import' ||
      command.operation === 'disconnect_crm_integration'
    ) {
      if (!OWNER_ROLES.has(role))
        throw new ForbiddenException('Owner authority required');
    } else if (command.operation === 'update_staff_schedule_day') {
      if (!ADMIN_ROLES.has(role))
        throw new ForbiddenException('Schedule authority required');
    } else if (command.operation === 'update_client_notes') {
      if (!NOTE_ROLES.has(role))
        throw new ForbiddenException('Staff notes authority required');
    } else {
      if (!['client', 'customer'].includes(role))
        throw new ForbiddenException('Exact Client self authority required');
    }
    return {
      membershipId: membership.id,
      role,
      actorIdentityHash: wave3Hash({ tenantId, userId, role }),
    };
  }

  private async resolveFacts(
    tenantId: string,
    actorUserId: string | null,
    command: Package5Wave3Command,
    db: PrismaClient | Tx = this.prisma,
  ): Promise<Facts> {
    const empty = {
      providerRequestIdentityHash: null,
      expectedProviderRevision: null,
      credentialFingerprint: null,
      providerSnapshotHash: null,
      notesFingerprint: null,
      clientId: null,
      consentKind: null,
      consentDecision: null,
      consentOccurredAt: null,
      consentEffectiveAt: null,
      sourceIdentityHash: null,
    };
    if (command.operation === 'update_staff_schedule_day') {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(command.localDate) ||
        command.slots.length > 24
      )
        throw new BadRequestException('Staff day is invalid or unbounded');
      const staff = await db.staff.findUnique({
        where: { id_tenantId: { id: command.staffId, tenantId } },
        include: { providerLinks: { where: { unlinkedAt: null } } },
      });
      if (!staff || !staff.active || !staff.branchId)
        throw new NotFoundException('Exact active staff/branch missing');
      if (staff.providerLinks.length !== 1)
        throw new ConflictException('Exact provider staff identity unresolved');
      const link = staff.providerLinks[0];
      const slots = this.normalizeSlots(command.slots);
      const current = await this.provider.readStaffDay({
        tenantId,
        provider: link.provider,
        staffId: staff.id,
        branchId: staff.branchId,
        externalStaffId: link.externalId,
        localDate: command.localDate,
      });
      if (current.revision !== command.expectedProviderRevision)
        throw new ConflictException('Provider staff day revision is stale');
      const desired = {
        staffId: staff.id,
        branchId: staff.branchId,
        localDate: command.localDate,
        slots,
      };
      const desiredStateHash = wave3Hash(desired);
      if (current.stateHash === desiredStateHash)
        throw new ConflictException(
          'Provider staff day already has desired state',
        );
      return {
        ...empty,
        targetRef: `${staff.id}:${command.localDate}`,
        before: { stateHash: current.stateHash, revision: current.revision },
        desired,
        changedFields: ['schedule_slots'],
        expectedProviderRevision: current.revision,
        providerRequestIdentityHash: wave3Hash({
          contract: 'package5.wave3.staff-day-request/1',
          tenantId,
          staffId: staff.id,
          provider: link.provider,
          localDate: command.localDate,
          expectedRevision: current.revision,
          desiredStateHash,
        }),
      };
    }
    if (command.operation === 'install_crm_credentials') {
      if (
        !/^[0-9a-f]{64}$/.test(command.credentialFingerprint) ||
        !command.encryptedApiToken.trim()
      )
        throw new BadRequestException('Credential boundary material invalid');
      const existing = await db.crmIntegration.findUnique({
        where: { tenantId },
      });
      const existingSettings =
        existing?.settingsJson &&
        typeof existing.settingsJson === 'object' &&
        !Array.isArray(existing.settingsJson)
          ? (existing.settingsJson as Record<string, unknown>)
          : {};
      if (
        existing?.provider === command.provider &&
        existing.status === 'pending_activation' &&
        existingSettings.canonicalCredentialFingerprint ===
          command.credentialFingerprint
      )
        throw new ConflictException('Credential version already installed');
      const desired = {
        provider: this.bounded(command.provider),
        baseUrl: command.baseUrl ?? null,
        settingsHash: wave3Hash(command.settingsJson ?? {}),
        credentialFingerprint: command.credentialFingerprint,
        status: 'pending_activation',
      };
      return {
        ...empty,
        targetRef: `crm:${tenantId}`,
        before: this.safeIntegration(existing),
        desired,
        changedFields: ['credential_version', 'provider', 'status'],
        credentialFingerprint: command.credentialFingerprint,
      };
    }
    if (command.operation === 'activate_crm_integration') {
      const integration = await this.requiredIntegration(tenantId);
      if (integration.status !== 'pending_activation')
        throw new ConflictException('Only pending integration can activate');
      const verification = await this.provider.verifyCrm({
        tenantId,
        provider: integration.provider,
      });
      return {
        ...empty,
        targetRef: `crm:${tenantId}`,
        before: this.safeIntegration(integration),
        desired: {
          ...this.safeIntegration(integration),
          status: 'active',
          verificationHash: verification.snapshotHash,
        },
        changedFields: ['status', 'verifiedAt'],
        providerSnapshotHash: verification.snapshotHash,
      };
    }
    if (command.operation === 'confirm_crm_import') {
      const integration = await this.requiredIntegration(tenantId);
      if (integration.status !== 'active')
        throw new ConflictException('Active CRM required for import');
      const snapshot = await this.provider.readCrmImport({
        tenantId,
        provider: integration.provider,
      });
      if (
        snapshot.teamChildHashes.length >
          PACKAGE5_WAVE3_MAX_CRM_TEAM_CHILDREN ||
        new Set(snapshot.teamChildHashes).size !==
          snapshot.teamChildHashes.length ||
        snapshot.teamChildHashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))
      )
        throw new BadRequestException(
          'CRM import envelope exceeds the production bound',
        );
      const currentSettings =
        integration.settingsJson &&
        typeof integration.settingsJson === 'object' &&
        !Array.isArray(integration.settingsJson)
          ? (integration.settingsJson as Record<string, unknown>)
          : {};
      if (currentSettings.acceptedImportSnapshotHash === snapshot.snapshotHash)
        throw new ConflictException('CRM import snapshot already confirmed');
      return {
        ...empty,
        targetRef: `crm:${tenantId}`,
        before: this.safeIntegration(integration),
        desired: {
          ...this.safeIntegration(integration),
          acceptedImportSnapshotHash: snapshot.snapshotHash,
          teamChildren: snapshot.teamChildHashes.length,
        },
        changedFields: ['accepted_import_snapshot'],
        providerSnapshotHash: snapshot.snapshotHash,
      };
    }
    if (command.operation === 'disconnect_crm_integration') {
      const integration = await this.requiredIntegration(tenantId);
      return {
        ...empty,
        targetRef: `crm:${tenantId}`,
        before: this.safeIntegration(integration),
        desired: { configured: false, provider: integration.provider },
        changedFields: [
          'credential_removed',
          'derived_access_revoked',
          'status',
        ],
      };
    }
    const client = await db.client.findUnique({
      where: { id_tenantId: { id: command.clientId, tenantId } },
      include: {
        crmLinks: {
          where: { unlinkedAt: null },
          select: { provider: true, externalId: true },
        },
      },
    });
    if (!client || client.mergedIntoClientId)
      throw new NotFoundException('Exact active Client missing');
    await this.assertNoClientHold(tenantId, client.crmLinks, db);
    if (
      command.operation === 'update_client_profile' &&
      client.userId !== actorUserId
    )
      throw new ForbiddenException('Client account does not own this profile');
    const profiles = await db.customerProfile.findMany({
      where: {
        tenantId,
        OR: [
          { clientId: client.id },
          ...(client.userId ? [{ userId: client.userId }] : []),
        ],
      },
      take: 2,
    });
    if (profiles.length > 1)
      throw new ConflictException('Client profile ownership conflicts');
    const profile = profiles[0] ?? null;
    if (command.operation === 'update_client_profile') {
      if (
        command.preferredLocale !== null &&
        !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(command.preferredLocale)
      )
        throw new BadRequestException('Locale invalid');
      if ((profile?.preferredLocale ?? null) === command.preferredLocale)
        throw new ConflictException('Client profile already has desired state');
      return {
        ...empty,
        targetRef: client.id,
        before: { preferredLocale: profile?.preferredLocale ?? null },
        desired: { preferredLocale: command.preferredLocale },
        changedFields: ['preferredLocale'],
        clientId: client.id,
      };
    }
    if (command.operation === 'update_client_notes') {
      const existingFingerprint = profile?.encryptedNotes
        ? this.provider.fingerprintEncryptedValue({
            namespace: 'package5.wave3.client-notes',
            encryptedValue: profile.encryptedNotes,
          })
        : null;
      if (existingFingerprint === command.notesFingerprint)
        throw new ConflictException('Client notes already have desired state');
      return {
        ...empty,
        targetRef: client.id,
        before: {
          notesFingerprint: existingFingerprint,
        },
        desired: { notesFingerprint: command.notesFingerprint },
        changedFields: ['encryptedNotes'],
        notesFingerprint: command.notesFingerprint,
        clientId: client.id,
      };
    }
    const existing = await db.clientConsentFact.findUnique({
      where: {
        tenantId_sourceType_sourceIdentityHash: {
          tenantId,
          sourceType: 'client_command',
          sourceIdentityHash: command.sourceIdentityHash,
        },
      },
    });
    if (
      existing &&
      (existing.clientId !== client.id ||
        existing.kind !== command.kind ||
        existing.decision !== command.decision)
    )
      throw new ConflictException('Consent source identity conflicts');
    return {
      ...empty,
      targetRef: client.id,
      before: existing
        ? {
            factId: existing.id,
            kind: existing.kind,
            decision: existing.decision,
          }
        : null,
      desired: {
        kind: command.kind,
        decision: command.decision,
        occurredAt: command.occurredAt,
        effectiveAt: command.effectiveAt,
        sourceIdentityHash: command.sourceIdentityHash,
      },
      changedFields: ['consent_fact'],
      clientId: client.id,
      consentKind: command.kind,
      consentDecision: command.decision,
      consentOccurredAt: command.occurredAt.toISOString(),
      consentEffectiveAt: command.effectiveAt.toISOString(),
      sourceIdentityHash: command.sourceIdentityHash,
    };
  }

  private safeIntegration(
    value: {
      provider: string;
      baseUrl: string | null;
      status: string;
      settingsJson: Prisma.JsonValue | null;
      verifiedAt: Date | null;
      lastCheckedAt: Date | null;
    } | null,
  ) {
    if (!value) return null;
    return {
      provider: value.provider,
      baseUrl: value.baseUrl,
      status: value.status,
      settingsHash: wave3Hash(value.settingsJson ?? {}),
      verifiedAt: value.verifiedAt?.toISOString() ?? null,
      lastCheckedAt: value.lastCheckedAt?.toISOString() ?? null,
    };
  }

  private async requiredIntegration(tenantId: string) {
    const integration = await this.prisma.crmIntegration.findUnique({
      where: { tenantId },
    });
    if (!integration) throw new NotFoundException('CRM integration missing');
    return integration;
  }

  private async assertNoClientHold(
    tenantId: string,
    links: Array<{ provider: string; externalId: string }>,
    db: PrismaClient | Tx = this.prisma,
  ) {
    if (!links.length) return;
    const hold = await db.unresolvedClientIdentityHold.findFirst({
      where: {
        tenantId,
        resolvedAt: null,
        OR: links.map((link) => ({
          provider: link.provider,
          externalId: link.externalId,
        })),
      },
      select: { id: true },
    });
    if (hold) throw new ConflictException('Client identity hold is unresolved');
  }

  private normalizeSlots(slots: StaffDaySlot[]) {
    const normalized = [...slots]
      .map((slot) => ({ from: slot.from, to: slot.to }))
      .sort((a, b) => a.from.localeCompare(b.from));
    for (const [index, slot] of normalized.entries()) {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.from) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.to) ||
        slot.from >= slot.to ||
        (index > 0 && normalized[index - 1].to > slot.from)
      )
        throw new BadRequestException('Schedule slots invalid or overlapping');
    }
    return normalized;
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

  private bounded(value: string) {
    const normalized = value.trim();
    if (!normalized || normalized.length > 240)
      throw new BadRequestException('Required value invalid');
    return normalized;
  }

  private inputText(value: unknown) {
    if (typeof value !== 'string' || !value)
      throw new Package5Wave3Error('Expected trusted input text');
    return value;
  }
}

export class Package5Wave3ExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly runtime: ActionEngineRuntimeService,
    private readonly planner: Package5Wave3ShadowService,
    private readonly provider: Package5Wave3ProviderGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    prepared: Package5Wave3Prepared,
  ): Promise<Package5Wave3ExecutionValue> {
    const registration = PACKAGE5_WAVE3_REGISTRATIONS.find(
      (row) => row.executableCapability === prepared.request.capability,
    );
    if (!registration)
      throw new Package5Wave3Error('Wave 3 capability is not executable');
    return registration.authorityClass === 'AC2'
      ? this.executeExternal(prepared)
      : this.executeLocal(prepared, registration);
  }

  async resume(prepared: Package5Wave3Prepared) {
    return this.execute(prepared);
  }

  private async executeLocal(
    prepared: Package5Wave3Prepared,
    registration: (typeof PACKAGE5_WAVE3_REGISTRATIONS)[number],
  ) {
    const execution = await this.ingress.createExecution(prepared.request);
    if (execution.state === ActionExecutionState.SUCCEEDED)
      return this.restore(execution);
    if (execution.state !== ActionExecutionState.READY)
      throw new Package5Wave3Error(
        `Execution cannot run from ${execution.state}`,
      );
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    await this.planner.assertStillCurrent(
      execution.tenantId,
      prepared.actor,
      prepared.command,
      input,
    );
    return this.serializable(async (tx) => {
      if (prepared.actor.consentChannel) {
        const binding = prepared.actor.consentChannel;
        await lockClientChannelIdentity(
          tx,
          execution.tenantId,
          binding.provider,
          binding.providerSubjectHash,
        );
        await prepared.actor.recheckChannel?.(tx);
      }
      await this.lock(
        tx,
        execution.tenantId,
        this.text(input.targetKind),
        this.text(input.targetRef),
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED)
        return this.restore(locked);
      this.assertExecutable(locked, registration.actionClass);
      await this.assertActor(tx, locked, input);
      if (prepared.command.operation === 'record_client_consent') {
        await this.planner.assertStillCurrent(
          execution.tenantId,
          prepared.actor,
          prepared.command,
          input,
          tx,
        );
      }
      const attemptId = await this.begin(
        tx,
        locked,
        'package5.wave3.local-command',
      );
      await this.mutate(tx, locked, prepared.command, input);
      await this.recordMutation(tx, locked, input);
      const value = this.value(locked, input, 0, false);
      await this.finalize(tx, locked, attemptId, value);
      return value;
    });
  }

  private async executeExternal(
    prepared: Package5Wave3Prepared,
  ): Promise<Package5Wave3ExecutionValue> {
    if (prepared.existingExecution?.state === ActionExecutionState.SUCCEEDED)
      return this.restore(prepared.existingExecution);
    if (prepared.command.operation !== 'update_staff_schedule_day')
      throw new Package5Wave3Error('External operation mismatch');
    const command = prepared.command;
    const link = await this.prisma.staffProviderLink.findFirst({
      where: {
        tenantId: prepared.request.tenantId,
        staffId: command.staffId,
        unlinkedAt: null,
      },
      include: { staff: { select: { branchId: true } } },
    });
    if (!link?.staff.branchId)
      throw new Package5Wave3Error('Provider staff/branch link missing');
    const branchId = link.staff.branchId;
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
        await this.assertActor(this.prisma, execution, input);
        await this.planner.assertStillCurrent(
          context.tenantId,
          prepared.actor,
          command,
          input,
        );
        return {
          providerRequestIdentityHash: this.text(
            input.providerRequestIdentityHash,
          ),
          expectedProviderRevision: this.text(input.expectedProviderRevision),
        };
      },
      dispatch: async (input, _transportKey, context) => {
        const result = await this.provider.replaceStaffDay({
          tenantId: context.tenantId,
          provider: link.provider,
          staffId: command.staffId,
          branchId,
          externalStaffId: link.externalId,
          localDate: command.localDate,
          slots: command.slots,
          expectedProviderRevision: this.text(input.expectedProviderRevision),
          requestIdentityHash: this.text(input.providerRequestIdentityHash),
        });
        if (result.stateHash !== input.desiredStateHash)
          throw new Package5Wave3AmbiguousDispatchError(
            'Provider reread differs after dispatch',
          );
        const value = await this.commitExternal(
          context.tenantId,
          context.executionId,
          input,
        );
        return {
          value,
          safeResult: value as unknown as Record<string, unknown>,
        };
      },
      reconcile: async (input, _pre, context) => {
        if (!context) return { outcome: 'STILL_UNKNOWN' };
        const outcome = await this.provider.reconcileStaffDay({
          tenantId: context.tenantId,
          provider: link.provider,
          staffId: command.staffId,
          branchId,
          externalStaffId: link.externalId,
          localDate: command.localDate,
          desiredStateHash: this.text(input.desiredStateHash),
          expectedProviderRevision: this.text(input.expectedProviderRevision),
          requestIdentityHash: this.text(input.providerRequestIdentityHash),
        });
        if (outcome === 'STILL_UNKNOWN') return { outcome };
        if (outcome === 'PROVEN_NOT_EXECUTED') return { outcome };
        const execution = await this.prisma.actionExecution.findUniqueOrThrow({
          where: {
            id_tenantId: {
              id: context.executionId,
              tenantId: context.tenantId,
            },
          },
        });
        const value = this.value(execution, input, 1, true);
        return {
          outcome: 'PROVEN_SUCCEEDED',
          safeResult: value as unknown as Record<string, unknown>,
        };
      },
      restore: (safe) => safe as unknown as Package5Wave3ExecutionValue,
      classifyError: (error, phase) => ({
        kind:
          phase === 'dispatch' ||
          error instanceof Package5Wave3AmbiguousDispatchError
            ? 'unknown'
            : 'definitive',
        outcomeCode:
          phase === 'dispatch'
            ? 'staff_day_dispatch_ambiguous'
            : 'staff_day_prepare_failed',
        errorClass:
          error instanceof Error
            ? error.constructor.name
            : 'StaffDayCommandError',
      }),
    });
    const input = await this.kernel.readTrustedNormalizedInput(
      prepared.request.tenantId,
      runtimeValue.actionExecutionId,
    );
    await this.commitExternal(
      prepared.request.tenantId,
      runtimeValue.actionExecutionId,
      input,
    );
    return runtimeValue;
  }

  private async commitExternal(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ) {
    return this.serializable(async (tx) => {
      await this.lock(
        tx,
        tenantId,
        this.text(input.targetKind),
        this.text(input.targetRef),
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
      if (!existing) await this.recordMutation(tx, execution, input);
      return this.value(execution, input, 1, true);
    });
  }

  private async mutate(
    tx: Tx,
    execution: ActionExecution,
    command: Package5Wave3Command,
    input: Record<string, unknown>,
  ) {
    const tenantId = execution.tenantId;
    const now = this.now();
    switch (command.operation) {
      case 'install_crm_credentials':
        await tx.crmIntegration.upsert({
          where: { tenantId },
          create: {
            tenantId,
            provider: command.provider,
            encryptedApiToken: command.encryptedApiToken,
            baseUrl: command.baseUrl ?? null,
            status: 'pending_activation',
            settingsJson: {
              ...(command.settingsJson ?? {}),
              canonicalCredentialFingerprint: command.credentialFingerprint,
            },
          },
          update: {
            provider: command.provider,
            encryptedApiToken: command.encryptedApiToken,
            baseUrl: command.baseUrl ?? null,
            status: 'pending_activation',
            settingsJson: {
              ...(command.settingsJson ?? {}),
              canonicalCredentialFingerprint: command.credentialFingerprint,
            },
            verifiedAt: null,
            lastCheckedAt: null,
            lastErrorCode: null,
            lastErrorAt: null,
          },
        });
        return;
      case 'activate_crm_integration': {
        await tx.crmIntegration.update({
          where: { tenantId },
          data: {
            status: 'active',
            verifiedAt: now,
            lastCheckedAt: now,
            lastErrorCode: null,
            lastErrorAt: null,
          },
        });
        await tx.tenant.update({
          where: { id: tenantId },
          data: { calendarSource: 'external' },
        });
        const integration = await tx.crmIntegration.findUniqueOrThrow({
          where: { tenantId },
          select: { provider: true },
        });
        if (integration.provider !== 'mock') {
          const branding = await tx.brandingSettings.findUnique({
            where: { tenantId },
            select: { themeJson: true },
          });
          await tx.brandingSettings.upsert({
            where: { tenantId },
            create: {
              tenantId,
              themeJson: this.withBookingMode(branding?.themeJson, 'live'),
            },
            update: {
              themeJson: this.withBookingMode(branding?.themeJson, 'live'),
            },
          });
        }
        return;
      }
      case 'confirm_crm_import': {
        const current = await tx.crmIntegration.findUniqueOrThrow({
          where: { tenantId },
        });
        const settings =
          current.settingsJson &&
          typeof current.settingsJson === 'object' &&
          !Array.isArray(current.settingsJson)
            ? (current.settingsJson as Record<string, unknown>)
            : {};
        await tx.crmIntegration.update({
          where: { tenantId },
          data: {
            settingsJson: {
              ...settings,
              acceptedImportSnapshotHash: this.text(input.providerSnapshotHash),
            },
            lastSyncAt: now,
          },
        });
        return;
      }
      case 'disconnect_crm_integration': {
        const current = await tx.crmIntegration.findUniqueOrThrow({
          where: { tenantId },
        });
        await tx.staffProviderLink.updateMany({
          where: { tenantId, provider: current.provider, unlinkedAt: null },
          data: { unlinkedAt: now },
        });
        const access = await tx.crmStaffAccess.findMany({
          where: {
            tenantId,
            status: { not: 'disabled' },
            role: { notIn: OWNER_ROLE_VALUES },
          },
          select: { id: true, userId: true },
        });
        if (access.length)
          await tx.crmStaffAccess.updateMany({
            where: { id: { in: access.map((row) => row.id) } },
            data: { status: 'disabled' },
          });
        const users = access
          .map((row) => row.userId)
          .filter((id): id is string => Boolean(id));
        if (users.length)
          await tx.authSession.updateMany({
            where: { tenantId, userId: { in: users }, revokedAt: null },
            data: { revokedAt: now, revokeReason: 'crm_disconnected' },
          });
        await tx.crmIntegration.delete({ where: { tenantId } });
        return;
      }
      case 'update_client_profile':
        await this.updateClientProfile(
          tx,
          tenantId,
          command.clientId,
          execution.actorUserId,
          { preferredLocale: command.preferredLocale },
        );
        return;
      case 'update_client_notes':
        await this.updateClientProfile(tx, tenantId, command.clientId, null, {
          encryptedNotes: command.encryptedNotes,
        });
        return;
      case 'record_client_consent':
        await tx.clientConsentFact.create({
          data: {
            tenantId,
            clientId: command.clientId,
            kind: command.kind,
            decision: command.decision,
            occurredAt: command.occurredAt,
            effectiveAt: command.effectiveAt,
            sourceType: 'client_command',
            sourceIdentityHash: command.sourceIdentityHash,
            actorUserId: execution.actorUserId,
            actionExecutionId: execution.id,
          },
        });
        await this.updateClientProfile(
          tx,
          tenantId,
          command.clientId,
          execution.actorUserId,
          command.kind === 'privacy'
            ? {
                privacyConsentAt:
                  command.decision === 'grant' ? command.effectiveAt : null,
              }
            : {
                marketingConsentAt:
                  command.decision === 'grant' ? command.effectiveAt : null,
              },
        );
        return;
      default:
        throw new Package5Wave3Error('Local mutation operation mismatch');
    }
  }

  private async updateClientProfile(
    tx: Tx,
    tenantId: string,
    clientId: string,
    actorUserId: string | null,
    data: {
      preferredLocale?: string | null;
      privacyConsentAt?: Date | null;
      marketingConsentAt?: Date | null;
      encryptedNotes?: string | null;
    },
  ) {
    const client = await tx.client.findUniqueOrThrow({
      where: { id_tenantId: { id: clientId, tenantId } },
      select: { userId: true },
    });
    const userId = client.userId;
    void actorUserId;
    const profiles = await tx.customerProfile.findMany({
      where: {
        tenantId,
        OR: [{ clientId }, ...(userId ? [{ userId }] : [])],
      },
      take: 2,
      select: { id: true },
    });
    if (profiles.length > 1)
      throw new Package5Wave3Error('Client profile ownership conflicts');
    if (profiles[0]) {
      await tx.customerProfile.update({
        where: { id: profiles[0].id },
        data: { clientId, ...(userId ? { userId } : {}), ...data },
      });
      return;
    }
    await tx.customerProfile.create({
      data: { tenantId, clientId, userId, ...data },
    });
  }

  private withBookingMode(themeJson: unknown, mode: 'live' | 'preview') {
    const theme =
      themeJson && typeof themeJson === 'object' && !Array.isArray(themeJson)
        ? (themeJson as Record<string, unknown>)
        : {};
    const booking =
      theme.booking &&
      typeof theme.booking === 'object' &&
      !Array.isArray(theme.booking)
        ? (theme.booking as Record<string, unknown>)
        : {};
    return { ...theme, booking: { ...booking, mode } } as Prisma.InputJsonValue;
  }

  private async assertActor(
    tx: PrismaClient | Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (input.operation === 'record_client_consent') {
      await assertConsentChannelBinding(
        tx,
        execution.tenantId,
        this.text(input.clientId),
        input.consentChannel as ConsentChannelBinding,
      );
      return;
    }
    if (!execution.actorUserId)
      throw new Package5Wave3Error('Actor binding missing');
    const membership = await tx.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: execution.actorUserId,
          tenantId: execution.tenantId,
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { status: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.user.status !== 'active' ||
      membership.id !== input.actorMembershipId ||
      String(membership.role) !== input.actorRole
    )
      throw new Package5Wave3Error('Actor authority changed after planning');
  }

  private assertExecutable(
    execution: ActionExecution,
    actionClass: Package5Wave3ActionClass,
  ) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.dryRun ||
      execution.actionClass !== actionClass ||
      !execution.capability.endsWith('.execute.v1')
    )
      throw new Package5Wave3Error(
        'Execution is not a canonical Wave 3 action',
      );
  }

  private async lock(
    tx: Tx,
    tenantId: string,
    targetKind: string,
    targetRef: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:p5-wave3:${targetKind}:${targetRef}`}, 0))`,
    );
  }

  private async begin(tx: Tx, execution: ActionExecution, executorKey: string) {
    const now = this.now();
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
        reconciliationRequired: false,
        startedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.EXECUTING,
        executionAttemptCount: attemptNumber,
        firstAttemptedAt: execution.firstAttemptedAt ?? now,
        leaseOwner: `package5-wave3:${execution.id}`,
        leaseTokenHash: `wave3:${execution.id}`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async recordMutation(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    await tx.actionTargetMutation.create({
      data: {
        id: randomUUID(),
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

  private async finalize(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: Package5Wave3ExecutionValue,
  ) {
    const now = this.now();
    const safe = value as unknown as Prisma.InputJsonValue;
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: safe,
        reconciliationRequired: false,
        finishedAt: now,
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
        finalizedAt: now,
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
    providerWrites: 0 | 1,
    unknownApplicable: boolean,
  ): Package5Wave3ExecutionValue {
    return {
      actionClass: execution.actionClass as Package5Wave3ActionClass,
      actionExecutionId: execution.id,
      targetRef: this.text(input.targetRef),
      targetGeneration: this.integer(input.targetGeneration),
      businessMutations: 1,
      providerWrites,
      unknownApplicable,
    };
  }

  private restore(execution: ActionExecution): Package5Wave3ExecutionValue {
    if (
      !execution.safeResultSummaryJson ||
      typeof execution.safeResultSummaryJson !== 'object' ||
      Array.isArray(execution.safeResultSummaryJson)
    )
      throw new Package5Wave3Error('Safe result missing');
    return execution.safeResultSummaryJson as unknown as Package5Wave3ExecutionValue;
  }

  private text(value: unknown) {
    if (typeof value !== 'string' || !value)
      throw new Package5Wave3Error('Expected durable text');
    return value;
  }

  private integer(value: unknown) {
    if (!Number.isSafeInteger(value) || Number(value) < 0)
      throw new Package5Wave3Error('Expected generation');
    return Number(value);
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt === 3 ||
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        )
          throw error;
      }
    }
    throw new Package5Wave3Error('Serializable transaction retry exhausted');
  }
}
