import { effectiveClientConsent } from './client-effective-consent';
import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ActionAttemptKind,
  ActionAttemptState,
  ActionExecutionState,
  ActionPolicyDecision,
  ExternalDispatchState,
  Prisma,
  type ActionExecution,
  type ClientWantedSlotInterest,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  CLIENT_WANTED_SLOT_CAPABILITIES,
  CLIENT_WANTED_SLOT_KIND,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { preferenceObject } from '../action-engine/client-preferences.contract';
import { CommunicationDeliveryService } from '../communication-delivery';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from './client-channel-link.service';
import { ClientChannelRuntimeService } from './client-channel-runtime.service';
import type { ConsentChannelBinding } from './client-consent-authority';

type Tx = Prisma.TransactionClient;
type Identity = {
  tenantId: string;
  clientId: string;
  userId: string | null;
  binding: ConsentChannelBinding;
};
type AddCommand = {
  idempotencyKey: string;
  externalStaffId: string;
  desiredStartAt: Date;
};
type AddReceipt = {
  actionExecutionId: string;
  interestId: string;
  outcome: 'created' | 'already_active';
  businessMutations: 0 | 1;
  providerWrites: 0;
};
type MatchInput = {
  externalStaffId: string;
  availableStartAt: Date;
  sourceEventId: string;
};

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/** B9: canonical Client-owned exact-slot intent and deterministic AC5 match. */
@Injectable()
export class ClientWantedSlotService {
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly channelRuntime: ClientChannelRuntimeService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService,
    private readonly delivery: CommunicationDeliveryService,
  ) {
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: () =>
        Promise.reject(new ForbiddenException('ClientLinkChallenge required')),
      verifyRevocation: () =>
        Promise.reject(new ForbiddenException('Verified rebind required')),
    });
  }

  async referralRead(proof: string) {
    return this.serializable(async (tx) => {
      await this.identity(tx, proof);
      return {
        status: 'unavailable',
        referralLink: null,
        businessMutations: 0,
        providerWrites: 0,
      };
    });
  }

  async add(proof: string, value: unknown): Promise<AddReceipt> {
    const command = this.addCommand(value);
    const prepared = await this.serializable(async (tx) => {
      const identity = await this.identity(tx, proof);
      await this.lockClient(tx, identity);
      const staff = await this.staff(
        tx,
        identity.tenantId,
        command.externalStaffId,
      );
      const materialHash = this.hash({
        clientId: identity.clientId,
        branchId: staff.branchId,
        staffId: staff.id,
        desiredStartAt: command.desiredStartAt,
      });
      const sourceRef = `client-wanted-slot:${this.hash({ linkId: identity.binding.linkId, key: command.idempotencyKey })}`;
      const prior = await tx.actionExecution.findMany({
        where: {
          tenantId: identity.tenantId,
          capability: CLIENT_WANTED_SLOT_CAPABILITIES.add,
          sourceRef,
        },
        take: 2,
      });
      if (prior.length > 1)
        throw new ConflictException('Ambiguous wanted-slot command identity');
      const generation = await this.generation(
        tx,
        identity.tenantId,
        identity.clientId,
      );
      return {
        identity,
        staff,
        materialHash,
        sourceRef,
        prior: prior[0],
        generation,
      };
    });
    if (prepared.prior) {
      const durable = await this.kernel.readTrustedNormalizedInput(
        prepared.identity.tenantId,
        prepared.prior.id,
      );
      if (
        durable.requestMaterialHash !== prepared.materialHash ||
        this.hash(durable.consentChannel) !==
          this.hash(prepared.identity.binding)
      )
        throw new ConflictException(
          'Command identity reused with changed material',
        );
      if (prepared.prior.state === ActionExecutionState.SUCCEEDED)
        return this.restoreAdd(prepared.prior);
    }
    const before = { active: false };
    const after = {
      active: true,
      branchId: prepared.staff.branchId,
      clientId: prepared.identity.clientId,
      desiredStartAt: command.desiredStartAt.toISOString(),
      staffId: prepared.staff.id,
    };
    const input = {
      operation: 'add_client_wanted_slot',
      targetKind: CLIENT_WANTED_SLOT_KIND,
      targetRef: prepared.identity.clientId,
      targetGeneration: prepared.generation,
      beforeStateHash: this.hash(before),
      afterStateHash: this.hash(after),
      requestMaterialHash: prepared.materialHash,
      consentChannel: prepared.identity.binding,
      desired: {
        branchId: prepared.staff.branchId,
        clientId: prepared.identity.clientId,
        desiredStartAt: command.desiredStartAt.toISOString(),
        staffId: prepared.staff.id,
      },
    };
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: prepared.identity.tenantId,
      capability: CLIENT_WANTED_SLOT_CAPABILITIES.add,
      targetRef: prepared.identity.clientId,
      source: {
        type: 'authenticated_request',
        sourceRef: prepared.sourceRef,
        occurrenceScope: prepared.sourceRef,
        actorUserId: prepared.identity.userId ?? undefined,
      },
      input,
      evidenceRefs: [
        `client-link:${prepared.identity.binding.linkId}`,
        `wanted-slot-material:${prepared.materialHash}`,
      ],
      callerIdempotency: {
        scope: 'client-wanted-slot.add.v1',
        key: prepared.sourceRef,
      },
    };
    const admitted =
      prepared.prior ?? (await this.ingress.createExecution(request));
    const durable = await this.kernel.readTrustedNormalizedInput(
      prepared.identity.tenantId,
      admitted.id,
    );
    const result = await this.serializable(async (tx) => {
      const current = await this.identity(tx, proof);
      if (
        current.clientId !== prepared.identity.clientId ||
        this.hash(current.binding) !== this.hash(prepared.identity.binding)
      )
        throw new ForbiddenException('Verified Client identity changed');
      await this.lockClient(tx, current);
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: admitted.id, tenantId: current.tenantId },
        },
      });
      if (execution.state === ActionExecutionState.SUCCEEDED)
        return this.restoreAdd(execution);
      if (
        execution.state === ActionExecutionState.FAILED &&
        execution.finalOutcomeCode === 'client_wanted_slot_limit_exceeded'
      )
        return { rejected: 'CLIENT_WANTED_SLOT_LIMIT_EXCEEDED' as const };
      this.ready(execution, CLIENT_WANTED_SLOT_CAPABILITIES.add);
      const desired = preferenceObject(durable.desired);
      if (
        durable.requestMaterialHash !== prepared.materialHash ||
        desired.clientId !== current.clientId ||
        desired.branchId !== prepared.staff.branchId ||
        desired.staffId !== prepared.staff.id ||
        desired.desiredStartAt !== command.desiredStartAt.toISOString()
      )
        throw new ConflictException('Durable wanted-slot command mismatch');
      const existing = await tx.clientWantedSlotInterest.findFirst({
        where: {
          tenantId: current.tenantId,
          clientId: current.clientId,
          branchId: prepared.staff.branchId,
          staffId: prepared.staff.id,
          desiredStartAt: command.desiredStartAt,
          status: 'ACTIVE',
        },
      });
      if (
        !existing &&
        (await tx.clientWantedSlotInterest.count({
          where: {
            tenantId: current.tenantId,
            clientId: current.clientId,
            status: 'ACTIVE',
          },
        })) >= 10
      ) {
        const attemptId = await this.startAttempt(tx, execution, 'add');
        const finalizedAt = new Date();
        await tx.actionAttempt.update({
          where: { id: attemptId },
          data: {
            state: ActionAttemptState.FAILED,
            outcomeCode: 'client_wanted_slot_limit_exceeded',
            errorClass: 'client_wanted_slot_limit',
            retryDecisionCode: 'TERMINAL_NO_RETRY',
            safeResultJson: {
              code: 'CLIENT_WANTED_SLOT_LIMIT_EXCEEDED',
              businessMutations: 0,
              providerWrites: 0,
            },
            finishedAt: finalizedAt,
          },
        });
        await tx.actionExecution.update({
          where: { id: execution.id },
          data: {
            state: ActionExecutionState.FAILED,
            finalOutcomeCode: 'client_wanted_slot_limit_exceeded',
            safeResultSummaryJson: {
              code: 'CLIENT_WANTED_SLOT_LIMIT_EXCEEDED',
              businessMutations: 0,
              providerWrites: 0,
            },
            finalizedAt,
            reconciliationState: 'NOT_REQUIRED',
            leaseOwner: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
            revision: { increment: 1 },
          },
        });
        return { rejected: 'CLIENT_WANTED_SLOT_LIMIT_EXCEEDED' as const };
      }
      const attemptId = await this.startAttempt(tx, execution, 'add');
      let interest = existing;
      if (!interest) {
        interest = await tx.clientWantedSlotInterest.create({
          data: {
            tenantId: current.tenantId,
            clientId: current.clientId,
            branchId: prepared.staff.branchId,
            staffId: prepared.staff.id,
            desiredStartAt: command.desiredStartAt,
            expiresAt: command.desiredStartAt,
            sourceChannelLinkId: current.binding.linkId,
            createdByActionExecutionId: execution.id,
          },
        });
        await tx.actionTargetMutation.create({
          data: {
            id: randomUUID(),
            tenantId: current.tenantId,
            actionExecutionId: execution.id,
            targetKind: CLIENT_WANTED_SLOT_KIND,
            targetRef: current.clientId,
            mutationKind: 'add_client_wanted_slot',
            mutationKey: `g${Number(durable.targetGeneration)}:add:${interest.id}`,
            targetGeneration: Number(durable.targetGeneration),
            beforeStateHash: String(durable.beforeStateHash),
            afterStateHash: String(durable.afterStateHash),
          },
        });
      }
      const receipt: AddReceipt = {
        actionExecutionId: execution.id,
        interestId: interest.id,
        outcome: existing ? 'already_active' : 'created',
        businessMutations: existing ? 0 : 1,
        providerWrites: 0,
      };
      await this.finishAttempt(tx, execution, attemptId, receipt);
      return receipt;
    });
    if ('rejected' in result) throw new ConflictException(result.rejected);
    return result;
  }

  async matchAvailable(value: unknown) {
    const input = this.matchInput(value);
    const tenantId = this.context.requireTenantId();
    const staff = await this.prisma.$transaction((tx) =>
      this.staff(tx, tenantId, input.externalStaffId),
    );
    const rows = await this.prisma.clientWantedSlotInterest.findMany({
      where: {
        tenantId,
        branchId: staff.branchId,
        staffId: staff.id,
        desiredStartAt: input.availableStartAt,
        OR: [
          { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          { status: 'MATCHED', matchedSourceEventId: input.sourceEventId },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const alreadyMatched = await this.prisma.clientWantedSlotInterest.count({
      where: { tenantId, matchedSourceEventId: input.sourceEventId },
    });
    const newMatchCapacity = Math.max(0, 3 - alreadyMatched);
    let selectedNewMatches = 0;
    const eligible: Array<{
      row: ClientWantedSlotInterest;
      endpoint: {
        provider: 'telegram' | 'maya_user';
        address: string;
        identityRef: string;
      };
    }> = [];
    for (const row of rows) {
      if (eligible.length >= 3) break;
      if (row.status === 'ACTIVE' && selectedNewMatches >= newMatchCapacity)
        continue;
      const endpoint =
        await this.channelRuntime.resolveVerifiedDeliveryEndpoint(
          row.clientId,
          row.sourceChannelLinkId,
        );
      if (!endpoint || !(await this.deliveryAllowed(row))) continue;
      eligible.push({ row, endpoint });
      if (row.status === 'ACTIVE') selectedNewMatches += 1;
    }
    const eligibleIds = eligible.map(({ row }) => row.id);
    const outcomes: Array<Record<string, unknown>> = [];
    for (const { row, endpoint } of eligible) {
      const matched =
        row.status === 'MATCHED'
          ? row
          : await this.matchOne(row, input.sourceEventId, eligibleIds);
      try {
        const sourceEventId = `wanted-slot-delivery:${this.hash({
          sourceEventId: input.sourceEventId,
          interestId: matched.id,
        })}`;
        const delivery =
          endpoint.provider === 'telegram'
            ? await this.delivery.deliverPackage2Telegram({
                tenantId,
                telegramChatId: endpoint.address,
                recipientIdentityRef: endpoint.identityRef,
                messageType: 'wanted_slot_available',
                sourceType: 'legacy_bridge',
                sourceEventId,
                title: 'Освободилось время',
                bodyText:
                  'Запрошенное вами время освободилось. Откройте запись, чтобы проверить актуальность слота.',
              })
            : await this.delivery.deliverPackage2Inbox({
                tenantId,
                userId: endpoint.address,
                recipientIdentityRef: endpoint.identityRef,
                messageType: 'wanted_slot_available',
                sourceType: 'legacy_bridge',
                sourceEventId,
                title: 'Освободилось время',
                bodyText:
                  'Запрошенное вами время освободилось. Проверьте актуальность слота.',
                deepLink: '/app/?panel=booking',
              });
        await this.markNotified(matched, delivery.actionExecutionId);
        outcomes.push({ interestId: matched.id, status: 'notified' });
      } catch {
        outcomes.push({ interestId: matched.id, status: 'delivery_pending' });
      }
    }
    return { matched: outcomes.length, outcomes, fanOutLimit: 3 };
  }

  private async matchOne(
    row: ClientWantedSlotInterest,
    sourceEventId: string,
    eligibleIds: string[],
  ) {
    const materialHash = this.hash({ interestId: row.id, sourceEventId });
    const sourceRef = `wanted-slot-match:${materialHash}`;
    const input = {
      operation: 'match_client_wanted_slot',
      targetKind: CLIENT_WANTED_SLOT_KIND,
      targetRef: row.id,
      targetGeneration: 0,
      beforeStateHash: this.hash({ status: 'ACTIVE' }),
      afterStateHash: this.hash({ status: 'MATCHED', sourceEventId }),
      requestMaterialHash: materialHash,
      desired: { matchedSourceEventId: sourceEventId },
    };
    const execution = await this.ingress.createExecution({
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: row.tenantId,
      capability: CLIENT_WANTED_SLOT_CAPABILITIES.match,
      targetRef: row.id,
      source: {
        type: 'webhook',
        sourceRef,
        occurrenceScope: sourceRef,
      },
      input,
      evidenceRefs: [`availability-event:${sourceEventId}`],
      callerIdempotency: {
        scope: 'client-wanted-slot.match.v1',
        key: sourceRef,
      },
    });
    return this.serializable(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        SELECT set_config(
          'maya.client_wanted_slot_eligible_ids',
          ${eligibleIds.join(',')},
          true
        )
      `);
      const current = await tx.clientWantedSlotInterest.findUniqueOrThrow({
        where: { id_tenantId: { id: row.id, tenantId: row.tenantId } },
      });
      if (
        current.status === 'MATCHED' &&
        current.matchedSourceEventId === sourceEventId
      )
        return current;
      if (current.status !== 'ACTIVE')
        throw new ConflictException('Wanted-slot interest is no longer active');
      const durableExecution = await tx.actionExecution.findUniqueOrThrow({
        where: { id_tenantId: { id: execution.id, tenantId: row.tenantId } },
      });
      this.ready(durableExecution, CLIENT_WANTED_SLOT_CAPABILITIES.match);
      const attemptId = await this.startAttempt(tx, durableExecution, 'match');
      const now = new Date();
      const changed = await tx.clientWantedSlotInterest.update({
        where: { id: current.id },
        data: {
          status: 'MATCHED',
          matchedSourceEventId: sourceEventId,
          matchedAt: now,
          lastMutationActionExecutionId: durableExecution.id,
        },
      });
      await tx.actionTargetMutation.create({
        data: {
          id: randomUUID(),
          tenantId: row.tenantId,
          actionExecutionId: durableExecution.id,
          targetKind: CLIENT_WANTED_SLOT_KIND,
          targetRef: row.id,
          mutationKind: 'match_client_wanted_slot',
          mutationKey: `g0:match:${sourceEventId}`,
          targetGeneration: 0,
          beforeStateHash: String(input.beforeStateHash),
          afterStateHash: String(input.afterStateHash),
        },
      });
      await this.finishAttempt(tx, durableExecution, attemptId, {
        interestId: row.id,
        status: 'matched',
      });
      return changed;
    });
  }

  private async markNotified(
    row: ClientWantedSlotInterest,
    deliveryActionExecutionId: string,
  ) {
    await this.serializable(async (tx) => {
      const current = await tx.clientWantedSlotInterest.findUniqueOrThrow({
        where: { id_tenantId: { id: row.id, tenantId: row.tenantId } },
      });
      if (current.status === 'NOTIFIED') return;
      if (current.status !== 'MATCHED')
        throw new ConflictException('Matched wanted-slot handoff required');
      await tx.clientWantedSlotInterest.update({
        where: { id: current.id },
        data: {
          status: 'NOTIFIED',
          notifiedAt: new Date(),
          terminalAt: new Date(),
          lastMutationActionExecutionId: deliveryActionExecutionId,
        },
      });
    });
  }

  private async deliveryAllowed(row: ClientWantedSlotInterest) {
    const [profile, tenant] = await Promise.all([
      this.prisma.customerProfile.findUnique({
        where: {
          tenantId_clientId: { tenantId: row.tenantId, clientId: row.clientId },
        },
      }),
      this.prisma.tenant.findUnique({ where: { id: row.tenantId } }),
    ]);
    if (
      !tenant ||
      !profile?.privacyConsentAt ||
      !(
        await effectiveClientConsent(
          this.prisma,
          row.tenantId,
          row.clientId,
          'privacy',
        )
      ).effective
    )
      return false;
    let prefs: Record<string, unknown>;
    try {
      const envelope = preferenceObject(
        profile.notificationPreferencesJson ?? {},
      );
      prefs = preferenceObject(envelope.overrides ?? {});
    } catch {
      return false;
    }
    if (prefs.freed_slot === false) return false;
    const from = prefs.quiet_from;
    const to = prefs.quiet_to;
    if (typeof from !== 'number' || typeof to !== 'number' || from === to)
      return true;
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tenant.defaultTimezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );
    return !(from < to ? hour >= from && hour < to : hour >= from || hour < to);
  }

  private addCommand(value: unknown): AddCommand {
    const input = preferenceObject(value);
    if (
      Object.keys(input).sort().join(',') !==
        'desiredStartAt,externalStaffId,idempotencyKey' ||
      typeof input.idempotencyKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey) ||
      typeof input.externalStaffId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(input.externalStaffId) ||
      typeof input.desiredStartAt !== 'string' ||
      !/(?:Z|[+-]\d\d:\d\d)$/.test(input.desiredStartAt)
    )
      throw new BadRequestException('Exact wanted-slot command required');
    const desiredStartAt = new Date(input.desiredStartAt);
    if (
      !Number.isFinite(desiredStartAt.getTime()) ||
      desiredStartAt <= new Date()
    )
      throw new BadRequestException(
        'Wanted slot must be a future exact instant',
      );
    return {
      idempotencyKey: input.idempotencyKey,
      externalStaffId: input.externalStaffId,
      desiredStartAt,
    };
  }

  private matchInput(value: unknown): MatchInput {
    const input = preferenceObject(value);
    if (
      Object.keys(input).sort().join(',') !==
        'availableStartAt,externalStaffId,sourceEventId' ||
      typeof input.externalStaffId !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(input.externalStaffId) ||
      typeof input.sourceEventId !== 'string' ||
      !/^[A-Za-z0-9._:-]{8,240}$/.test(input.sourceEventId) ||
      typeof input.availableStartAt !== 'string' ||
      !/(?:Z|[+-]\d\d:\d\d)$/.test(input.availableStartAt)
    )
      throw new BadRequestException('Exact availability source required');
    const availableStartAt = new Date(input.availableStartAt);
    if (!Number.isFinite(availableStartAt.getTime()))
      throw new BadRequestException('Valid availability instant required');
    return {
      externalStaffId: input.externalStaffId,
      sourceEventId: input.sourceEventId,
      availableStartAt,
    };
  }

  private async identity(tx: Tx, proof: string): Promise<Identity> {
    const first = await this.channels.authenticate(proof, tx);
    await lockClientChannelIdentity(
      tx,
      first.tenantId,
      first.provider,
      first.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    if (
      current.tenantId !== first.tenantId ||
      current.provider !== first.provider ||
      current.providerSubjectHash !== first.providerSubjectHash
    )
      throw new ForbiddenException('Authenticated channel changed');
    const tenant = await tx.tenant.findUnique({
      where: { id: first.tenantId },
    });
    if (
      !tenant ||
      !['active', 'trial_active', 'past_due_grace'].includes(
        evaluateTenantAccessState(tenant, new Date()).accessState,
      )
    )
      throw new ForbiddenException('Tenant is not active');
    const links = await tx.clientChannelLink.findMany({
      where: {
        tenantId: first.tenantId,
        provider: first.provider,
        providerSubjectHash: first.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (links.length !== 1)
      throw new ForbiddenException('client_link_required');
    await this.links.assertClientEligible(
      tx,
      first.tenantId,
      links[0].clientId,
    );
    return {
      tenantId: first.tenantId,
      clientId: links[0].clientId,
      userId: current.userId,
      binding: {
        linkId: links[0].id,
        provider: first.provider,
        providerSubjectHash: first.providerSubjectHash,
        verificationEvidenceHash: links[0].verificationEvidenceHash,
      },
    };
  }

  private async staff(tx: Tx, tenantId: string, externalStaffId: string) {
    const links = await tx.staffProviderLink.findMany({
      where: {
        tenantId,
        provider: 'yclients',
        externalId: externalStaffId,
        unlinkedAt: null,
        staff: { active: true, branchId: { not: null } },
      },
      include: { staff: true },
      take: 2,
    });
    if (links.length !== 1 || !links[0].staff.branchId)
      throw new ForbiddenException('Exact active canonical Staff required');
    return { id: links[0].staff.id, branchId: links[0].staff.branchId };
  }

  private async generation(tx: Tx, tenantId: string, clientId: string) {
    const latest = await tx.actionTargetMutation.findFirst({
      where: {
        tenantId,
        targetKind: CLIENT_WANTED_SLOT_KIND,
        targetRef: clientId,
      },
      orderBy: { targetGeneration: 'desc' },
      select: { targetGeneration: true },
    });
    return (latest?.targetGeneration ?? -1) + 1;
  }

  private ready(execution: ActionExecution, capability: string) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.dryRun ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.capability !== capability
    )
      throw new ConflictException('Canonical wanted-slot execution not ready');
  }

  private async startAttempt(
    tx: Tx,
    execution: ActionExecution,
    operation: string,
  ) {
    const id = randomUUID();
    const now = new Date();
    await tx.actionAttempt.create({
      data: {
        id,
        tenantId: execution.tenantId,
        actionExecutionId: execution.id,
        attemptNumber: execution.executionAttemptCount + 1,
        kind: ActionAttemptKind.EXECUTION,
        state: ActionAttemptState.STARTED,
        executorKey: `package5.client-wanted-slot.${operation}.local`,
        executorVersion: 1,
        externalDispatchState: ExternalDispatchState.NOT_CROSSED,
        reconciliationRequired: false,
        startedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: { id: execution.id },
      data: {
        state: ActionExecutionState.EXECUTING,
        executionAttemptCount: { increment: 1 },
        firstAttemptedAt: execution.firstAttemptedAt ?? now,
        leaseOwner: `client-wanted-slot:${execution.id}`,
        leaseTokenHash: this.hash(execution.id),
        leaseExpiresAt: new Date(now.getTime() + 60000),
        revision: { increment: 1 },
      },
    });
    return id;
  }

  private async finishAttempt(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    receipt: Record<string, unknown>,
  ) {
    const now = new Date();
    await tx.actionAttempt.update({
      where: { id: attemptId },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'local_transaction_committed',
        safeResultJson: receipt as Prisma.InputJsonValue,
        finishedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: { id: execution.id },
      data: {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: 'local_transaction_committed',
        safeResultSummaryJson: receipt as Prisma.InputJsonValue,
        finalizedAt: now,
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private restoreAdd(execution: ActionExecution): AddReceipt {
    const receipt = preferenceObject(execution.safeResultSummaryJson);
    if (
      receipt.actionExecutionId !== execution.id ||
      typeof receipt.interestId !== 'string' ||
      ![0, 1].includes(Number(receipt.businessMutations))
    )
      throw new ConflictException('Durable wanted-slot receipt missing');
    return receipt as AddReceipt;
  }

  private hash(value: unknown) {
    return this.encryption.opaqueReference(
      'package5.client-wanted-slot.v1',
      JSON.stringify(canonical(value)),
    );
  }

  private async lockClient(tx: Tx, identity: Identity) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${identity.tenantId}:wanted-slot:${identity.clientId}`}, 0))`;
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 4
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException('Wanted-slot concurrency retry exhausted');
  }
}
