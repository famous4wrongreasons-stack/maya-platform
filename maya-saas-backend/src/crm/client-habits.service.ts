import { evaluateTenantAccessState } from '../tenants/tenant-access-state';
import { createHash, randomUUID } from 'node:crypto';
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
} from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import {
  exactPreferenceKeys,
  preferenceObject,
} from '../action-engine/client-preferences.contract';
import {
  CLIENT_HABITS_CAPABILITY,
  CLIENT_HABITS_KIND,
} from '../action-engine/client-habits.contract';
import {
  ClientHabitsLimitError,
  normalizeClientHabit,
  parseClientHabits,
  serializeClientHabits,
  validateClientHabitsCiphertext,
} from '../action-engine/client-habits.policy';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import {
  ClientChannelLinkService,
  lockClientChannelIdentity,
} from './client-channel-link.service';
import type { ConsentChannelBinding } from './client-consent-authority';
import { EncryptionService } from '../encryption/encryption.service';

type Tx = Prisma.TransactionClient;
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const preferenceHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
type Identity = {
  tenantId: string;
  clientId: string;
  userId: string | null;
  binding: ConsentChannelBinding;
};
type Command = {
  idempotencyKey: string;
  expectedGeneration: number;
  preference: string;
};
type Receipt = {
  actionExecutionId: string | null;
  outcome: 'updated' | 'no_op';
  targetGeneration: number;
  businessMutations: 0 | 1;
  providerWrites: 0;
};

/** B7 V1: Client-owned encrypted habits, admitted by canonical ingress and
 * committed with its ActionExecution outcome in one local transaction. */
@Injectable()
export class ClientHabitsService {
  private readonly links: ClientChannelLinkService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContextService,
    private readonly channels: ClientChannelAuthenticatorService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService,
  ) {
    this.links = new ClientChannelLinkService(prisma, context, {
      verifyLink: () =>
        Promise.reject(new ForbiddenException('ClientLinkChallenge required')),
      verifyRevocation: () =>
        Promise.reject(
          new ForbiddenException('Explicit verified rebind required'),
        ),
    });
  }

  async binding(proof: string) {
    return this.serializable(async (tx) => {
      await this.identity(tx, proof);
      return { verified: true };
    });
  }

  async read(proof: string) {
    return this.serializable(async (tx) => {
      const identity = await this.identity(tx, proof);
      const profile = await this.profile(tx, identity);
      return {
        preferences: this.decode(profile?.encryptedClientPreferences ?? null),
        expectedGeneration: await this.generation(tx, identity),
        policyVersion: 1,
      };
    });
  }

  async add(proof: string, value: unknown) {
    let command: Command;
    try {
      const input = preferenceObject(value);
      exactPreferenceKeys(input, [
        'idempotencyKey',
        'expectedGeneration',
        'preference',
      ]);
      if (
        typeof input.idempotencyKey !== 'string' ||
        !/^[A-Za-z0-9._:-]{8,180}$/.test(input.idempotencyKey) ||
        !Number.isSafeInteger(input.expectedGeneration) ||
        Number(input.expectedGeneration) < 0 ||
        typeof input.preference !== 'string'
      )
        throw new BadRequestException(
          'Stable intent, generation and explicit preference required',
        );
      command = {
        idempotencyKey: input.idempotencyKey,
        expectedGeneration: Number(input.expectedGeneration),
        preference: input.preference.trim()
          ? normalizeClientHabit(input.preference)
          : '',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ClientHabitsLimitError
      )
        throw error;
      throw new BadRequestException('Invalid Client habit command');
    }
    const prepared = await this.serializable(async (tx) => {
      const identity = await this.identity(tx, proof);
      await this.lock(tx, identity);
      const sourceRef = `client-habits:${preferenceHash({ linkId: identity.binding.linkId, key: command.idempotencyKey })}`;
      const materialHash = this.hash({ preference: command.preference });
      const prior = await tx.actionExecution.findMany({
        where: {
          tenantId: identity.tenantId,
          capability: CLIENT_HABITS_CAPABILITY,
          sourceRef,
        },
        take: 2,
      });
      if (prior.length > 1)
        throw new ConflictException('Ambiguous command identity');
      if (prior[0])
        return {
          identity,
          sourceRef,
          prior: prior[0],
          materialHash,
          snapshot: null,
        };
      const snapshot = await this.snapshot(tx, identity, command);
      if (snapshot.generation !== command.expectedGeneration)
        throw new ConflictException(
          'Preference generation changed; reload before a new command',
        );
      return { identity, sourceRef, prior: null, materialHash, snapshot };
    });
    const { identity, sourceRef, prior, materialHash, snapshot } = prepared;
    let input: Record<string, unknown>;
    if (prior) {
      input = await this.kernel.readTrustedNormalizedInput(
        identity.tenantId,
        prior.id,
      );
      if (
        input.requestMaterialHash !== materialHash ||
        preferenceHash(input.consentChannel) !==
          preferenceHash(identity.binding)
      )
        throw new ConflictException(
          'Command identity reused with changed material or authority',
        );
      if (prior.state === ActionExecutionState.SUCCEEDED)
        return this.restore(prior);
    } else {
      if (!snapshot) throw new ConflictException('Preference snapshot missing');
      if (snapshot.noOp)
        return {
          actionExecutionId: null,
          outcome: 'no_op',
          targetGeneration: snapshot.generation,
          businessMutations: 0,
          providerWrites: 0,
        } satisfies Receipt;
      input = {
        operation: 'add_client_habit',
        targetKind: CLIENT_HABITS_KIND,
        targetRef: identity.clientId,
        targetGeneration: snapshot.generation,
        beforeStateHash: this.hash(snapshot.before),
        afterStateHash: this.hash(snapshot.after),
        requestMaterialHash: materialHash,
        consentChannel: identity.binding,
        // The engine encrypts normalizedInput at rest; plaintext never enters audit/result fields.
        desired: { preferences: snapshot.after },
      };
    }
    const request: TrustedActionExecutionRequestV1 = {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: identity.tenantId,
      capability: CLIENT_HABITS_CAPABILITY,
      targetRef: identity.clientId,
      source: {
        type: 'authenticated_request',
        sourceRef,
        occurrenceScope: sourceRef,
        actorUserId: identity.userId ?? undefined,
      },
      input,
      evidenceRefs: [
        `client-link:${identity.binding.linkId}`,
        `preference-material:${materialHash}`,
      ],
      callerIdempotency: {
        scope: 'client-habits.add.v1',
        key: sourceRef,
      },
    };
    const admitted = await this.ingress.createExecution(request);
    const durable = await this.kernel.readTrustedNormalizedInput(
      identity.tenantId,
      admitted.id,
    );
    return this.serializable(async (tx) => {
      const currentIdentity = await this.identity(tx, proof);
      if (
        preferenceHash(currentIdentity.binding) !==
          preferenceHash(identity.binding) ||
        currentIdentity.clientId !== identity.clientId
      )
        throw new ForbiddenException('Verified Client identity changed');
      await this.lock(tx, identity);
      const execution = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: admitted.id, tenantId: identity.tenantId },
        },
      });
      if (execution.state === ActionExecutionState.SUCCEEDED)
        return this.restore(execution);
      if (
        execution.state !== ActionExecutionState.READY ||
        execution.dryRun ||
        execution.policyDecision !== ActionPolicyDecision.ALLOW ||
        execution.capability !== CLIENT_HABITS_CAPABILITY
      )
        throw new ConflictException('Canonical preference execution not ready');
      const fresh = await this.snapshot(tx, identity, command);
      if (
        fresh.generation !== durable.targetGeneration ||
        this.hash(fresh.before) !== durable.beforeStateHash ||
        this.hash(fresh.after) !== durable.afterStateHash ||
        this.hash(preferenceObject(durable.desired).preferences) !==
          durable.afterStateHash
      )
        throw new ConflictException(
          'Preference target changed before execution',
        );
      const now = new Date();
      const attemptId = randomUUID();
      await tx.actionAttempt.create({
        data: {
          id: attemptId,
          tenantId: identity.tenantId,
          actionExecutionId: execution.id,
          attemptNumber: execution.executionAttemptCount + 1,
          kind: ActionAttemptKind.EXECUTION,
          state: ActionAttemptState.STARTED,
          executorKey: 'package5.client-habits.local',
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
          leaseOwner: `client-habits:${execution.id}`,
          leaseTokenHash: preferenceHash(execution.id),
          leaseExpiresAt: new Date(now.getTime() + 60000),
          revision: { increment: 1 },
        },
      });
      await this.apply(
        tx,
        identity,
        this.encrypt(preferenceObject(durable.desired).preferences as string[]),
      );
      await tx.actionTargetMutation.create({
        data: {
          id: randomUUID(),
          tenantId: identity.tenantId,
          actionExecutionId: execution.id,
          targetKind: CLIENT_HABITS_KIND,
          targetRef: identity.clientId,
          mutationKind: 'add_client_habit',
          mutationKey: `g${fresh.generation}:add_client_habit`,
          targetGeneration: fresh.generation,
          beforeStateHash: String(durable.beforeStateHash),
          afterStateHash: String(durable.afterStateHash),
        },
      });
      const receipt: Receipt = {
        actionExecutionId: execution.id,
        outcome: 'updated',
        targetGeneration: fresh.generation + 1,
        businessMutations: 1,
        providerWrites: 0,
      };
      await tx.actionAttempt.update({
        where: { id: attemptId },
        data: {
          state: ActionAttemptState.SUCCEEDED,
          outcomeCode: 'local_transaction_committed',
          safeResultJson: receipt,
          finishedAt: now,
        },
      });
      await tx.actionExecution.update({
        where: { id: execution.id },
        data: {
          state: ActionExecutionState.SUCCEEDED,
          finalOutcomeCode: 'local_transaction_committed',
          safeResultSummaryJson: receipt,
          finalizedAt: now,
          reconciliationState: 'NOT_REQUIRED',
          leaseOwner: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
          revision: { increment: 1 },
        },
      });
      return receipt;
    });
  }

  private async identity(tx: Tx, proof: string): Promise<Identity> {
    const channel = await this.channels.authenticate(proof, tx);
    await lockClientChannelIdentity(
      tx,
      channel.tenantId,
      channel.provider,
      channel.providerSubjectHash,
    );
    const current = await this.channels.authenticate(proof, tx);
    if (
      current.provider !== channel.provider ||
      current.providerSubjectHash !== channel.providerSubjectHash ||
      current.tenantId !== channel.tenantId
    )
      throw new ForbiddenException('Channel changed');
    const tenant = await tx.tenant.findUnique({
      where: { id: channel.tenantId },
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
        tenantId: channel.tenantId,
        provider: channel.provider,
        providerSubjectHash: channel.providerSubjectHash,
        revokedAt: null,
      },
      take: 2,
    });
    if (
      links.length !== 1 ||
      links[0].verificationVersion !== 1 ||
      links[0].subjectHashVersion !== 1
    )
      throw new ForbiddenException('client_link_required');
    const link = links[0];
    await this.links.assertClientEligible(tx, channel.tenantId, link.clientId);
    return {
      tenantId: channel.tenantId,
      clientId: link.clientId,
      userId: channel.userId,
      binding: {
        linkId: link.id,
        provider: channel.provider,
        providerSubjectHash: link.providerSubjectHash,
        verificationEvidenceHash: link.verificationEvidenceHash,
      },
    };
  }
  private async profile(tx: Tx, identity: Identity) {
    return tx.customerProfile.findUnique({
      where: {
        tenantId_clientId: {
          tenantId: identity.tenantId,
          clientId: identity.clientId,
        },
      },
    });
  }
  private async generation(tx: Tx, identity: Identity) {
    const latest = await tx.actionTargetMutation.findFirst({
      where: {
        tenantId: identity.tenantId,
        targetKind: CLIENT_HABITS_KIND,
        targetRef: identity.clientId,
      },
      orderBy: { targetGeneration: 'desc' },
      select: { targetGeneration: true },
    });
    return (latest?.targetGeneration ?? -1) + 1;
  }
  private decode(ciphertext: string | null): string[] {
    if (ciphertext === null) return [];
    validateClientHabitsCiphertext(ciphertext);
    try {
      return parseClientHabits(this.encryption.decrypt(ciphertext));
    } catch (error) {
      if (error instanceof ClientHabitsLimitError) throw error;
      throw new ConflictException('Stored Client habits cannot be verified');
    }
  }
  private hash(value: unknown) {
    return this.encryption.opaqueReference(
      'package5.client-habits.v1',
      JSON.stringify(canonical(value)),
    );
  }
  private encrypt(after: string[]) {
    const plaintext = serializeClientHabits(after);
    const ciphertext = this.encryption.encrypt(plaintext);
    validateClientHabitsCiphertext(ciphertext);
    return ciphertext;
  }
  private async snapshot(tx: Tx, identity: Identity, command: Command) {
    const profile = await this.profile(tx, identity);
    const generation = await this.generation(tx, identity);
    const before = this.decode(profile?.encryptedClientPreferences ?? null);
    const noOp =
      !command.preference ||
      before.some((x) => x.toLowerCase() === command.preference.toLowerCase());
    const after = noOp ? before : [...before, command.preference];
    // Validate the complete proposed state before admission or any domain write.
    serializeClientHabits(after);
    return { generation, before, after, noOp };
  }
  private async apply(tx: Tx, identity: Identity, ciphertext: string) {
    this.decode(ciphertext);
    const profile = await this.profile(tx, identity);
    if (profile)
      await tx.customerProfile.update({
        where: { id: profile.id },
        data: { encryptedClientPreferences: ciphertext },
      });
    else
      await tx.customerProfile.create({
        data: {
          tenantId: identity.tenantId,
          clientId: identity.clientId,
          encryptedClientPreferences: ciphertext,
        },
      });
  }
  private restore(execution: ActionExecution): Receipt {
    const result = preferenceObject(execution.safeResultSummaryJson);
    if (
      result.actionExecutionId !== execution.id ||
      result.businessMutations !== 1
    )
      throw new ConflictException('Durable preference receipt missing');
    return result as Receipt;
  }
  private async lock(tx: Tx, identity: Identity) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${identity.tenantId}:client-preferences:${identity.clientId}`}, 0))`;
  }
  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 3
        )
          throw error;
      }
    }
    throw new ConflictException('Preference concurrency retry exhausted');
  }
}
