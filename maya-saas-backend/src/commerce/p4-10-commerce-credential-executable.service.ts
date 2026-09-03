import { randomUUID } from 'node:crypto';

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
  ActionEngineKernel,
  CanonicalActionIngressService,
  P4_10_EXECUTABLE_CAPABILITIES,
  type P410ActionClass,
  type P410Operation,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import {
  p410CommerceStateHash,
  p410Hash,
  type P410CredentialMaterial,
  type StoredIntegration,
} from './p4-10-commerce-credential-shadow.service';
import type {
  P410CredentialVerification,
  P410CredentialVerifier,
} from './p4-10-yookassa-credential-verifier';

type Tx = Prisma.TransactionClient;

const OPERATION_BY_CAPABILITY = new Map<string, P410Operation>([
  [P4_10_EXECUTABLE_CAPABILITIES.connect, 'connect'],
  [P4_10_EXECUTABLE_CAPABILITIES.replace, 'replace'],
  [P4_10_EXECUTABLE_CAPABILITIES.recheck, 'recheck'],
  [P4_10_EXECUTABLE_CAPABILITIES.disconnect, 'disconnect'],
]);

const ACTION_BY_OPERATION: Readonly<Record<P410Operation, P410ActionClass>> = {
  connect: 'connect_commerce_payment_credentials',
  replace: 'replace_commerce_payment_credentials',
  recheck: 'recheck_commerce_payment_credentials',
  disconnect: 'disconnect_commerce_payment_credentials',
};

export class P410CommerceCredentialExecutionError extends Error {}

export interface P410ExecutionValue {
  actionClass: P410ActionClass;
  actionExecutionId: string;
  integrationId: string;
  connectionState: 'active' | 'error' | 'disconnected';
  verificationOutcome:
    'ACCEPTED' | 'REJECTED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  credentialMutations: 1;
  providerReads: 0 | 1;
  providerWrites: 0;
  paymentMutations: 0;
  customerValueMutations: 0;
  unknownApplicable: false;
}

export class P410CommerceCredentialExecutableService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly encryption: EncryptionService,
    private readonly verifier: P410CredentialVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    request: TrustedActionExecutionRequestV1,
    material: P410CredentialMaterial | null,
  ): Promise<P410ExecutionValue> {
    const operation = OPERATION_BY_CAPABILITY.get(request.capability);
    if (!operation) {
      throw new P410CommerceCredentialExecutionError(
        'P4-10 capability is not registered',
      );
    }
    const execution = await this.canonicalExecution(request);
    if (execution.actionClass !== ACTION_BY_OPERATION[operation]) {
      throw new P410CommerceCredentialExecutionError(
        'P4-10 action class mismatch',
      );
    }
    if (execution.state === ActionExecutionState.SUCCEEDED) {
      return this.restore(execution);
    }
    if (execution.state !== ActionExecutionState.READY) {
      throw new P410CommerceCredentialExecutionError(
        `Execution cannot run from ${execution.state}`,
      );
    }
    const input = await this.kernel.readTrustedNormalizedInput(
      execution.tenantId,
      execution.id,
    );
    const verification = await this.verification(
      execution,
      operation,
      input,
      material,
    );
    const result = await this.serializable(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${execution.tenantId}:p4-10-commerce-credentials`}, 0))`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "ActionExecution" WHERE id = ${execution.id} AND "tenantId" = ${execution.tenantId} FOR UPDATE`,
      );
      const locked = await tx.actionExecution.findUniqueOrThrow({
        where: {
          id_tenantId: { id: execution.id, tenantId: execution.tenantId },
        },
      });
      if (locked.state === ActionExecutionState.SUCCEEDED) {
        return { ok: true, value: this.restore(locked) } as const;
      }
      this.assertExecutable(locked, operation);
      await this.assertActor(tx, locked, input);
      const current = (await tx.commerceIntegration.findUnique({
        where: { tenantId: locked.tenantId },
      })) as StoredIntegration | null;
      this.assertCurrentState(current, input);
      const attemptId = await this.begin(tx, locked, operation, verification);
      if (
        (operation === 'connect' || operation === 'replace') &&
        verification.outcome !== 'ACCEPTED'
      ) {
        const code = verification.errorCode ?? 'commerce_provider_unavailable';
        await this.finalizeFailure(tx, locked, attemptId, code);
        return { ok: false, code } as const;
      }
      const value = await this.mutate(
        tx,
        locked,
        operation,
        input,
        material,
        verification,
      );
      await this.finalizeSuccess(tx, locked, attemptId, value);
      return { ok: true, value } as const;
    });
    if (!result.ok) {
      throw new P410CommerceCredentialExecutionError(result.code);
    }
    return result.value;
  }

  private async verification(
    execution: ActionExecution,
    operation: P410Operation,
    input: Record<string, unknown>,
    material: P410CredentialMaterial | null,
  ): Promise<P410CredentialVerification> {
    if (operation === 'disconnect') {
      if (material) {
        throw new P410CommerceCredentialExecutionError(
          'Disconnect must not receive raw credentials',
        );
      }
      return {
        outcome: 'ACCEPTED',
        errorCode: null,
        httpStatus: null,
        providerWrites: 0,
      };
    }
    let credentials = material;
    if (operation === 'recheck') {
      if (material) {
        throw new P410CommerceCredentialExecutionError(
          'Recheck uses only the stored credential authority',
        );
      }
      const stored = await this.prisma.commerceIntegration.findUnique({
        where: { tenantId: execution.tenantId },
      });
      if (!stored) {
        throw new P410CommerceCredentialExecutionError(
          'Stored credentials are absent',
        );
      }
      credentials = {
        shopId: this.encryption.decrypt(stored.encryptedShopId),
        secretKey: this.encryption.decrypt(stored.encryptedSecretKey),
      };
    }
    if (!credentials) {
      throw new P410CommerceCredentialExecutionError(
        'Transient credential presentation is required',
      );
    }
    const fingerprints = this.fingerprints(
      credentials.shopId,
      credentials.secretKey,
    );
    const expected =
      operation === 'recheck'
        ? this.text(input.currentCredentialSetFingerprint)
        : this.text(input.desiredCredentialSetFingerprint);
    if (fingerprints.set !== expected) {
      throw new P410CommerceCredentialExecutionError(
        'Presented credential material changed after planning',
      );
    }
    if (
      operation !== 'recheck' &&
      fingerprints.shop !== this.text(input.shopIdFingerprint)
    ) {
      throw new P410CommerceCredentialExecutionError(
        'Presented shop identity changed after planning',
      );
    }
    return this.verifier.verify(credentials.shopId, credentials.secretKey);
  }

  private async mutate(
    tx: Tx,
    execution: ActionExecution,
    operation: P410Operation,
    input: Record<string, unknown>,
    material: P410CredentialMaterial | null,
    verification: P410CredentialVerification,
  ): Promise<P410ExecutionValue> {
    const now = this.now();
    const integrationId = this.text(input.integrationId);
    if (operation === 'connect' || operation === 'replace') {
      if (!material) {
        throw new P410CommerceCredentialExecutionError(
          'Credential presentation was lost before commit',
        );
      }
      const data = {
        provider: 'yookassa',
        encryptedShopId: this.encryption.encrypt(material.shopId),
        encryptedSecretKey: this.encryption.encrypt(material.secretKey),
        status: 'active',
        verifiedAt: now,
        lastCheckedAt: now,
        lastErrorCode: null,
        lastErrorAt: null,
      };
      if (operation === 'connect') {
        await tx.commerceIntegration.create({
          data: { id: integrationId, tenantId: execution.tenantId, ...data },
        });
      } else {
        await tx.commerceIntegration.update({
          where: { tenantId: execution.tenantId },
          data,
        });
      }
    } else if (operation === 'recheck') {
      const accepted = verification.outcome === 'ACCEPTED';
      await tx.commerceIntegration.update({
        where: { tenantId: execution.tenantId },
        data: {
          status: accepted ? 'active' : 'error',
          verifiedAt: accepted ? now : undefined,
          lastCheckedAt: now,
          lastErrorCode: accepted ? null : verification.errorCode,
          lastErrorAt: accepted ? null : now,
        },
      });
    } else {
      await tx.commerceIntegration.delete({
        where: { tenantId: execution.tenantId },
      });
    }
    const value: P410ExecutionValue = {
      actionClass: execution.actionClass as P410ActionClass,
      actionExecutionId: execution.id,
      integrationId,
      connectionState:
        operation === 'disconnect'
          ? 'disconnected'
          : verification.outcome === 'ACCEPTED'
            ? 'active'
            : 'error',
      verificationOutcome:
        operation === 'disconnect' ? 'NOT_APPLICABLE' : verification.outcome,
      credentialMutations: 1,
      providerReads: operation === 'disconnect' ? 0 : 1,
      providerWrites: 0,
      paymentMutations: 0,
      customerValueMutations: 0,
      unknownApplicable: false,
    };
    const credentialSetFingerprint = this.text(
      operation === 'connect' || operation === 'replace'
        ? input.desiredCredentialSetFingerprint
        : input.currentCredentialSetFingerprint,
    );
    await tx.auditLog.create({
      data: {
        scope: 'tenant',
        tenantId: execution.tenantId,
        userId: execution.actorUserId,
        action: `commerce.credentials.${operation}.canonical`,
        entityType: 'commerce_integration',
        entityId: integrationId,
        metadataJson: {
          provider: 'yookassa',
          action_execution_id: execution.id,
          credential_set_fingerprint: credentialSetFingerprint,
          verification_outcome: value.verificationOutcome,
          raw_credentials_persisted_in_action_evidence: false,
          provider_writes: 0,
        },
      },
    });
    return value;
  }

  private assertCurrentState(
    current: StoredIntegration | null,
    input: Record<string, unknown>,
  ) {
    const currentFingerprint = current
      ? this.fingerprints(
          this.encryption.decrypt(current.encryptedShopId),
          this.encryption.decrypt(current.encryptedSecretKey),
        ).set
      : null;
    if (
      p410CommerceStateHash(current, currentFingerprint) !==
      input.expectedStateHash
    ) {
      throw new P410CommerceCredentialExecutionError(
        'Commerce credential state changed after planning',
      );
    }
  }

  private async assertActor(
    tx: Tx,
    execution: ActionExecution,
    input: Record<string, unknown>,
  ) {
    if (!execution.actorUserId) {
      throw new P410CommerceCredentialExecutionError(
        'Credential manager is required',
      );
    }
    const actor = await tx.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: execution.actorUserId,
          tenantId: execution.tenantId,
        },
      },
    });
    if (
      !actor ||
      actor.status !== 'active' ||
      actor.id !== input.actorMembershipId ||
      actor.role !== input.actorRole ||
      ![
        'tenant_owner',
        'business_owner',
        'tenant_admin',
        'administrator',
      ].includes(actor.role)
    ) {
      throw new P410CommerceCredentialExecutionError(
        'Credential manager authority changed after planning',
      );
    }
  }

  private assertExecutable(
    execution: ActionExecution,
    operation: P410Operation,
  ) {
    if (
      execution.state !== ActionExecutionState.READY ||
      execution.policyDecision !== ActionPolicyDecision.ALLOW ||
      execution.approvalRequirement !== 'NONE' ||
      execution.dryRun ||
      execution.actionClass !== ACTION_BY_OPERATION[operation] ||
      execution.capability !== P4_10_EXECUTABLE_CAPABILITIES[operation]
    ) {
      throw new P410CommerceCredentialExecutionError(
        'Execution is not an authorized canonical P4-10 action',
      );
    }
  }

  private async begin(
    tx: Tx,
    execution: ActionExecution,
    operation: P410Operation,
    verification: P410CredentialVerification,
  ): Promise<string> {
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
        executorKey: 'commerce.canonical-credentials',
        executorVersion: 1,
        externalDispatchState:
          operation === 'disconnect'
            ? ExternalDispatchState.NOT_CROSSED
            : verification.httpStatus === null
              ? ExternalDispatchState.MAY_HAVE_CROSSED
              : ExternalDispatchState.ACKNOWLEDGED,
        providerRequestIdentityHash:
          operation === 'disconnect'
            ? null
            : p410Hash({
                contract: 'p4-10.read-only-provider-check.v1',
                executionId: execution.id,
                attemptNumber,
              }),
        transportCode:
          operation === 'disconnect' ? null : `READ_${verification.outcome}`,
        httpStatus: verification.httpStatus,
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
        leaseOwner: `p4-10-local:${execution.id}`,
        leaseTokenHash: `p4-10-local:${execution.id}`,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        revision: { increment: 1 },
      },
    });
    return attemptId;
  }

  private async finalizeSuccess(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    value: P410ExecutionValue,
  ) {
    const now = this.now();
    const safe = value as unknown as Prisma.InputJsonValue;
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.SUCCEEDED,
        outcomeCode: 'commerce_credential_transaction_committed',
        safeResultJson: safe,
        finishedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.SUCCEEDED,
        finalOutcomeCode: 'commerce_credential_transaction_committed',
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

  private async finalizeFailure(
    tx: Tx,
    execution: ActionExecution,
    attemptId: string,
    code: string,
  ) {
    const now = this.now();
    await tx.actionAttempt.update({
      where: { id_tenantId: { id: attemptId, tenantId: execution.tenantId } },
      data: {
        state: ActionAttemptState.FAILED,
        errorClass: code,
        outcomeCode: code,
        retryDecisionCode: 'new_read_only_verification_action_required',
        reconciliationRequired: false,
        finishedAt: now,
      },
    });
    await tx.actionExecution.update({
      where: {
        id_tenantId: { id: execution.id, tenantId: execution.tenantId },
      },
      data: {
        state: ActionExecutionState.FAILED,
        finalOutcomeCode: code,
        finalizedAt: now,
        reconciliationState: 'NOT_REQUIRED',
        leaseOwner: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        revision: { increment: 1 },
      },
    });
  }

  private restore(execution: ActionExecution): P410ExecutionValue {
    const value = execution.safeResultSummaryJson;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new P410CommerceCredentialExecutionError(
        'Committed commerce credential result is unavailable',
      );
    }
    return value as unknown as P410ExecutionValue;
  }

  private async canonicalExecution(request: TrustedActionExecutionRequestV1) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.ingress.createExecution(request);
      } catch (error) {
        if (this.serializationFailure(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new P410CommerceCredentialExecutionError(
      'Canonical execution could not serialize',
    );
  }

  private async serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (this.serializationFailure(error) && attempt < 3) continue;
        throw error;
      }
    }
    throw new P410CommerceCredentialExecutionError(
      'Commerce credential transaction could not serialize',
    );
  }

  private serializationFailure(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    const databaseCode =
      typeof error.meta?.code === 'string' ? error.meta.code : '';
    return (
      error.code === 'P2034' ||
      databaseCode === '40001' ||
      (error.code === 'P2010' &&
        /40001|serializ|write conflict/i.test(error.message))
    );
  }

  private fingerprints(shopId: string, secretKey: string) {
    return {
      shop: this.encryption.opaqueReference('p4-10.yookassa-shop-id', shopId),
      set: this.encryption.opaqueReference(
        'p4-10.yookassa-credential-set',
        `${shopId}\u0000${secretKey}`,
      ),
    };
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || !value) {
      throw new P410CommerceCredentialExecutionError(
        'Canonical P4-10 value is missing',
      );
    }
    return value;
  }
}
