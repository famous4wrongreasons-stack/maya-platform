import { createHash } from 'node:crypto';

import {
  ActionApprovalDecision,
  ActionExecutionState,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

import type {
  ActionFailureClassification,
  ActionRuntimePhase,
  ActionRuntimeReceipt,
  ActionRuntimeHandlers,
} from '../action-engine/action-engine.runtime';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import type { TrustedActionExecutionRequestV1 } from '../action-engine/action-engine.contract';
import {
  LEGACY_LOYALTY_REDEEM_LEDGER_KIND,
  LEGACY_LOYALTY_REFUND_LEDGER_KIND,
  legacyLoyaltyRefundCorrelationHash,
} from '../action-engine/legacy-loyalty-refund-shadow.contract';
import {
  P4_03_BULK_ENVELOPE_CAPABILITIES,
  P4_03_EXECUTABLE_CAPABILITIES,
  type P403BulkActionClass,
  type P403ExecutableActionClass,
} from '../action-engine/p4-03-legacy-loyalty-executable.contract';
import { EncryptionService } from '../encryption/encryption.service';
import {
  issueLoyaltyRedemptionClaim,
  loyaltyRedemptionClaimLookup,
  type LoyaltyRedemptionClaimArtifactV1,
} from './loyalty-redemption-claim.contract';

interface P403ExecutableServiceOptions {
  redemptionCodePepper: string;
  now?: () => Date;
}

export interface P403ExecutionValue {
  actionClass: P403ExecutableActionClass;
  actionExecutionId: string;
  accountId?: string;
  balanceAfter?: number;
  transactionIds?: string[];
  grantId?: string;
  claimArtifact?: LoyaltyRedemptionClaimArtifactV1;
  redemptionId?: string;
  batchAudienceHash?: string;
  childMutationHashes?: string[];
  providerWrites: 0;
}

class P403ExecutionContractError extends Error {}

const EXECUTABLE_ACTION_BY_CAPABILITY = new Map<
  string,
  P403ExecutableActionClass
>([
  [P4_03_EXECUTABLE_CAPABILITIES.earn, 'earn_legacy_loyalty'],
  [P4_03_EXECUTABLE_CAPABILITIES.expire, 'expire_legacy_loyalty'],
  [P4_03_EXECUTABLE_CAPABILITIES.redeem, 'redeem_legacy_loyalty'],
  [P4_03_EXECUTABLE_CAPABILITIES.refund, 'refund_legacy_loyalty'],
  [P4_03_EXECUTABLE_CAPABILITIES.import, 'import_legacy_loyalty_balance'],
  [P4_03_EXECUTABLE_CAPABILITIES.backfill, 'backfill_legacy_loyalty'],
  [P4_03_EXECUTABLE_CAPABILITIES.issueGrant, 'issue_loyalty_redemption_grant'],
  [
    P4_03_EXECUTABLE_CAPABILITIES.consumeGrant,
    'consume_loyalty_redemption_grant',
  ],
]);

const BULK_ACTION_BY_CAPABILITY = new Map<string, P403BulkActionClass>([
  [P4_03_BULK_ENVELOPE_CAPABILITIES.expire, 'expire_legacy_loyalty'],
  [P4_03_BULK_ENVELOPE_CAPABILITIES.backfill, 'backfill_legacy_loyalty'],
  [P4_03_BULK_ENVELOPE_CAPABILITIES.import, 'import_legacy_loyalty_balance'],
]);

const BULK_CAPABILITY_BY_ACTION: Readonly<Record<P403BulkActionClass, string>> =
  {
    expire_legacy_loyalty: P4_03_BULK_ENVELOPE_CAPABILITIES.expire,
    backfill_legacy_loyalty: P4_03_BULK_ENVELOPE_CAPABILITIES.backfill,
    import_legacy_loyalty_balance: P4_03_BULK_ENVELOPE_CAPABILITIES.import,
  };

/**
 * Canonical P4-03 executor prepared for the cutover gate. It is deliberately
 * not registered in LoyaltyModule and therefore has no production-reachable
 * initiator until a separately approved cutover wires the legacy adapters.
 */
export class P403LegacyLoyaltyExecutableService {
  private readonly now: () => Date;
  private readonly redemptionCodePepper: Buffer;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly encryption: EncryptionService,
    options: P403ExecutableServiceOptions,
  ) {
    const pepper = options.redemptionCodePepper.trim();
    if (pepper.length < 32) {
      throw new P403ExecutionContractError(
        'Redemption code pepper must contain at least 32 characters',
      );
    }
    this.redemptionCodePepper = Buffer.from(pepper, 'utf8');
    this.now = options.now ?? (() => new Date());
  }

  execute(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P403ExecutionValue>> {
    const bulkAction = BULK_ACTION_BY_CAPABILITY.get(request.capability);
    if (bulkAction) return this.executeBulkEnvelope(request, bulkAction);

    const actionClass = EXECUTABLE_ACTION_BY_CAPABILITY.get(request.capability);
    if (!actionClass) {
      throw new P403ExecutionContractError(
        'P4-03 executable capability is not registered',
      );
    }
    if (actionClass === 'issue_loyalty_redemption_grant') {
      return this.executeGrantIssue(request);
    }
    if (actionClass === 'consume_loyalty_redemption_grant') {
      return this.executeGrantConsume(request);
    }
    return this.executeLedgerMutation(request, actionClass);
  }

  private executeBulkEnvelope(
    request: TrustedActionExecutionRequestV1,
    actionClass: P403BulkActionClass,
  ): Promise<ActionRuntimeReceipt<P403ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: (input) => {
          this.bulkEnvelope(input, actionClass);
          return Promise.resolve({ valueMutationPermitted: false });
        },
        dispatch: (input, _transportKey, context) => {
          const envelope = this.bulkEnvelope(input, actionClass);
          const value: P403ExecutionValue = {
            actionClass,
            actionExecutionId: context.executionId,
            batchAudienceHash: envelope.audienceHash,
            childMutationHashes: envelope.childMutationHashes,
            providerWrites: 0,
          };
          return Promise.resolve({ value, safeResult: this.safe(value) });
        },
        reconcile: () => Promise.resolve({ outcome: 'PROVEN_NOT_EXECUTED' }),
      }),
    );
  }

  private executeLedgerMutation(
    request: TrustedActionExecutionRequestV1,
    actionClass: Exclude<
      P403ExecutableActionClass,
      'issue_loyalty_redemption_grant' | 'consume_loyalty_redemption_grant'
    >,
  ): Promise<ActionRuntimeReceipt<P403ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          const plan = this.plan(input);
          await this.assertBulkChildIfRequired(
            context.tenantId,
            actionClass,
            input,
          );
          await this.assertLedgerPreconditions(
            context.tenantId,
            actionClass,
            plan,
          );
          return { actionClass, target: String(plan.canonicalClientId) };
        },
        dispatch: async (input, _transportKey, context) => {
          const value = await this.applyLedgerMutation(
            context.tenantId,
            context.executionId,
            actionClass,
            this.plan(input),
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' };
          const value = await this.ledgerValueForExecution(
            context.tenantId,
            context.executionId,
            actionClass,
          );
          return value
            ? { outcome: 'PROVEN_SUCCEEDED', safeResult: this.safe(value) }
            : { outcome: 'PROVEN_NOT_EXECUTED' };
        },
      }),
    );
  }

  private executeGrantIssue(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P403ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          await this.assertGrantIssuePreconditions(context.tenantId, input);
          return { codeMaterial: 'server_generated_not_persisted' };
        },
        dispatch: async (input, _transportKey, context) => {
          const value = await this.issueGrant(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' };
          const value = await this.grantValueForExecution(
            context.tenantId,
            context.executionId,
          );
          return value
            ? { outcome: 'PROVEN_SUCCEEDED', safeResult: this.safe(value) }
            : { outcome: 'PROVEN_NOT_EXECUTED' };
        },
      }),
    );
  }

  private executeGrantConsume(
    request: TrustedActionExecutionRequestV1,
  ): Promise<ActionRuntimeReceipt<P403ExecutionValue>> {
    return this.actionEngine.executeWithReceipt(
      request,
      this.handlers({
        prepare: async (input, context) => {
          if (
            input.providerProjectionDecision !==
              'local_only_no_provider_write' ||
            input.providerWritesPermitted !== false
          ) {
            throw new P403ExecutionContractError(
              'Grant consume provider boundary is not local-only',
            );
          }
          await this.assertGrantConsumePreconditions(context.tenantId, input);
          return { providerDispatch: 'forbidden' };
        },
        dispatch: async (input, _transportKey, context) => {
          const value = await this.consumeGrant(
            context.tenantId,
            context.executionId,
            input,
          );
          return { value, safeResult: this.safe(value) };
        },
        reconcile: async (_input, _previous, context) => {
          if (!context) return { outcome: 'STILL_UNKNOWN' };
          const value = await this.consumeValueForExecution(
            context.tenantId,
            context.executionId,
          );
          if (value === 'contradiction') {
            return { outcome: 'PROVEN_FAILED' };
          }
          return value
            ? { outcome: 'PROVEN_SUCCEEDED', safeResult: this.safe(value) }
            : { outcome: 'PROVEN_NOT_EXECUTED' };
        },
      }),
    );
  }

  private handlers(
    handlers: Pick<
      ActionRuntimeHandlers<P403ExecutionValue>,
      'prepare' | 'dispatch' | 'reconcile'
    >,
  ): ActionRuntimeHandlers<P403ExecutionValue> {
    return {
      ...handlers,
      restore: (safeResult) => this.restore(safeResult),
      classifyError: (error, phase) => this.classify(error, phase),
    };
  }

  private classify(
    error: unknown,
    phase: ActionRuntimePhase,
  ): ActionFailureClassification {
    if (phase === 'prepare' || error instanceof P403ExecutionContractError) {
      return {
        kind: 'definitive',
        outcomeCode: 'p4_03_contract_rejected',
        errorClass: this.errorClass(error),
      };
    }
    return {
      kind: 'unknown',
      outcomeCode: 'p4_03_local_commit_outcome_unknown',
      errorClass: this.errorClass(error),
    };
  }

  private errorClass(error: unknown): string {
    const name =
      error instanceof Error ? error.constructor.name : 'UnknownError';
    return /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name) ? name : 'UnknownError';
  }

  private async assertBulkChildIfRequired(
    tenantId: string,
    actionClass: P403ExecutableActionClass,
    input: Record<string, unknown>,
  ): Promise<void> {
    if (!(actionClass in BULK_CAPABILITY_BY_ACTION)) return;
    const bulkAction = actionClass as P403BulkActionClass;
    const batch = this.record(input.batch, 'batch binding');
    const batchExecutionId = this.text(
      batch.batchExecutionId,
      'batchExecutionId',
    );
    const audienceHash = this.text(batch.audienceHash, 'audienceHash');
    const childMutationHash = this.text(
      batch.childMutationHash,
      'childMutationHash',
    );
    const execution = await this.prisma.actionExecution.findUnique({
      where: { id_tenantId: { id: batchExecutionId, tenantId } },
    });
    const safe = this.record(
      execution?.safeResultSummaryJson,
      'batch safe result',
    );
    const children = Array.isArray(safe.childMutationHashes)
      ? safe.childMutationHashes
      : [];
    if (
      !execution ||
      execution.capability !== BULK_CAPABILITY_BY_ACTION[bulkAction] ||
      execution.actionClass !== bulkAction ||
      execution.state !== ActionExecutionState.SUCCEEDED ||
      execution.approvalRequirement !== 'REQUIRED' ||
      execution.approvalDecision !== ActionApprovalDecision.APPROVED ||
      !execution.approvalExpiresAt ||
      execution.approvalExpiresAt <= this.now() ||
      safe.batchAudienceHash !== audienceHash ||
      !children.includes(childMutationHash)
    ) {
      throw new P403ExecutionContractError(
        'Bulk child is not bound to an active approved exact batch',
      );
    }
  }

  private async assertLedgerPreconditions(
    tenantId: string,
    actionClass: Exclude<
      P403ExecutableActionClass,
      'issue_loyalty_redemption_grant' | 'consume_loyalty_redemption_grant'
    >,
    plan: Record<string, unknown>,
  ): Promise<void> {
    await this.resolveAccount(
      tenantId,
      this.text(plan.canonicalClientId, 'client'),
    );
    if (actionClass === 'redeem_legacy_loyalty') {
      const appointmentExecutionId = this.text(
        plan.appointmentActionExecutionId,
        'appointmentActionExecutionId',
      );
      const appointmentExecution = await this.prisma.actionExecution.findUnique(
        {
          where: {
            id_tenantId: { id: appointmentExecutionId, tenantId },
          },
        },
      );
      if (
        !appointmentExecution ||
        appointmentExecution.state !== ActionExecutionState.SUCCEEDED ||
        appointmentExecution.actionClass !== 'create_appointment'
      ) {
        throw new P403ExecutionContractError(
          'Canonical appointment success evidence is missing',
        );
      }
    }
    if (actionClass === 'refund_legacy_loyalty') {
      await this.assertOriginalRedemption(tenantId, plan);
    }
  }

  private async assertOriginalRedemption(
    tenantId: string,
    plan: Record<string, unknown>,
  ): Promise<void> {
    const originalExecutionId = this.text(
      plan.originalRedemptionActionExecutionId,
      'originalRedemptionActionExecutionId',
    );
    const rows = await this.prisma.loyaltyTransaction.findMany({
      where: {
        tenantId,
        actionExecutionId: originalExecutionId,
        delta: { lt: 0 },
      },
    });
    const points = rows.reduce((sum, row) => sum - row.delta, 0);
    if (
      rows.length !== Number(plan.originalDebitRowCount) ||
      points !== Number(plan.originalDebitPoints)
    ) {
      throw new P403ExecutionContractError(
        'Refund is not bound to the exact original debit',
      );
    }
  }

  private async applyLedgerMutation(
    tenantId: string,
    executionId: string,
    actionClass: Exclude<
      P403ExecutableActionClass,
      'issue_loyalty_redemption_grant' | 'consume_loyalty_redemption_grant'
    >,
    plan: Record<string, unknown>,
  ): Promise<P403ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.loyaltyTransaction.findFirst({
          where: { tenantId, actionExecutionId: executionId },
          include: { account: true },
        });
        if (existing)
          return this.ledgerValue(actionClass, executionId, existing);

        const account = await this.resolveAccount(
          tenantId,
          this.text(plan.canonicalClientId, 'canonicalClientId'),
          tx,
        );
        await tx.$queryRaw`
          SELECT "id"
          FROM "LoyaltyAccount"
          WHERE "id" = ${account.id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const locked = await tx.loyaltyAccount.findUniqueOrThrow({
          where: { id_tenantId: { id: account.id, tenantId } },
        });
        this.assertCurrentBalance(actionClass, plan, locked.balance);
        if (actionClass === 'refund_legacy_loyalty') {
          await this.assertOriginalRedemptionInTransaction(tx, tenantId, plan);
        }
        const delta = this.integer(
          plan.intendedDeltaPoints,
          'intendedDeltaPoints',
        );
        const externalRef = this.ledgerExternalRef(tenantId, actionClass, plan);
        const claimed = await tx.loyaltyTransaction.findFirst({
          where: { tenantId, externalRef },
        });
        if (claimed && claimed.actionExecutionId !== executionId) {
          throw new P403ExecutionContractError(
            'Logical loyalty mutation is already owned by another execution',
          );
        }
        const balanceAfter = locked.balance + delta;
        if (balanceAfter < 0) {
          throw new P403ExecutionContractError(
            'Loyalty mutation would create a negative balance',
          );
        }
        if (
          actionClass === 'import_legacy_loyalty_balance' &&
          balanceAfter !== Number(plan.providerBalancePoints)
        ) {
          throw new P403ExecutionContractError(
            'Import must align to the observed provider balance',
          );
        }
        if (
          actionClass === 'redeem_legacy_loyalty' &&
          balanceAfter !== Number(plan.resultingBalancePoints)
        ) {
          throw new P403ExecutionContractError(
            'Redemption resulting balance is stale',
          );
        }
        const updated = await tx.loyaltyAccount.update({
          where: { id_tenantId: { id: locked.id, tenantId } },
          data: { balance: balanceAfter },
        });
        const transaction = await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            actionExecutionId: executionId,
            accountId: locked.id,
            kind:
              actionClass === 'redeem_legacy_loyalty'
                ? LEGACY_LOYALTY_REDEEM_LEDGER_KIND
                : actionClass === 'refund_legacy_loyalty'
                  ? LEGACY_LOYALTY_REFUND_LEDGER_KIND
                  : delta > 0
                    ? 'credit'
                    : 'debit',
            delta,
            balanceAfter,
            encryptedReason: this.encryption.encrypt(`p4-03:${actionClass}`),
            idempotencyKey: this.sha256([
              tenantId,
              executionId,
              actionClass,
              'ledger-0',
            ]),
            externalRef,
          },
        });
        return {
          actionClass,
          actionExecutionId: executionId,
          accountId: updated.id,
          balanceAfter: updated.balance,
          transactionIds: [transaction.id],
          providerWrites: 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertOriginalRedemptionInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    plan: Record<string, unknown>,
  ): Promise<void> {
    const originalExecutionId = this.text(
      plan.originalRedemptionActionExecutionId,
      'originalRedemptionActionExecutionId',
    );
    const rows = await tx.loyaltyTransaction.findMany({
      where: {
        tenantId,
        actionExecutionId: originalExecutionId,
        kind: LEGACY_LOYALTY_REDEEM_LEDGER_KIND,
        delta: { lt: 0 },
      },
    });
    const providerRecordIdentityHash = this.text(
      plan.providerRecordIdentityHash,
      'providerRecordIdentityHash',
    );
    const points = rows.reduce((sum, row) => sum - row.delta, 0);
    if (
      rows.length !== Number(plan.originalDebitRowCount) ||
      points !== Number(plan.originalDebitPoints) ||
      rows.some((row) => row.externalRef !== providerRecordIdentityHash)
    ) {
      throw new P403ExecutionContractError('Original redemption changed');
    }
  }

  private assertCurrentBalance(
    actionClass: P403ExecutableActionClass,
    plan: Record<string, unknown>,
    balance: number,
  ): void {
    const expected =
      actionClass === 'expire_legacy_loyalty'
        ? plan.canonicalBalancePoints
        : actionClass === 'redeem_legacy_loyalty'
          ? plan.canonicalBalancePoints
          : actionClass === 'import_legacy_loyalty_balance'
            ? plan.canonicalCurrentBalancePoints
            : undefined;
    if (expected !== undefined && balance !== Number(expected)) {
      throw new P403ExecutionContractError(
        'Canonical loyalty balance changed after planning',
      );
    }
  }

  private ledgerExternalRef(
    tenantId: string,
    actionClass: Exclude<
      P403ExecutableActionClass,
      'issue_loyalty_redemption_grant' | 'consume_loyalty_redemption_grant'
    >,
    plan: Record<string, unknown>,
  ): string {
    if (actionClass === 'redeem_legacy_loyalty') {
      return this.text(
        plan.providerRecordIdentityHash,
        'providerRecordIdentityHash',
      );
    }
    if (actionClass === 'refund_legacy_loyalty') {
      return legacyLoyaltyRefundCorrelationHash({
        tenantId,
        originalRedemptionActionExecutionId: this.text(
          plan.originalRedemptionActionExecutionId,
          'originalRedemptionActionExecutionId',
        ),
        cancellationFactHash: this.text(
          plan.cancellationFactHash,
          'cancellationFactHash',
        ),
      });
    }
    const identity =
      actionClass === 'earn_legacy_loyalty'
        ? [plan.provider, plan.providerVisitIdentityHash]
        : actionClass === 'expire_legacy_loyalty'
          ? [
              plan.canonicalClientId,
              plan.expiryPolicy,
              plan.evaluationWindowEnd,
            ]
          : actionClass === 'import_legacy_loyalty_balance'
            ? [plan.provider, plan.providerCardIdentityHash, plan.importPolicy]
            : [plan.canonicalClientId, plan.programVersion];
    return `p4-03:${actionClass}:${this.sha256(identity)}`;
  }

  private async assertGrantIssuePreconditions(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    if (
      input.authorizationEvidence !== 'server_resolved_eligible_requester' ||
      input.codeMaterial !== 'server_generated_not_persisted'
    ) {
      throw new P403ExecutionContractError(
        'Grant issue authority or code contract is invalid',
      );
    }
    const account = await this.resolveAccount(
      tenantId,
      this.text(input.canonicalClientId, 'canonicalClientId'),
    );
    if (account.balance !== Number(input.availableBalancePoints)) {
      throw new P403ExecutionContractError('Grant balance evidence is stale');
    }
  }

  private async issueGrant(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P403ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.loyaltyRedemptionGrant.findUnique({
          where: {
            issueExecutionId_tenantId: {
              issueExecutionId: executionId,
              tenantId,
            },
          },
        });
        if (existing) return this.grantValue(executionId, existing.id);
        const clientId = this.text(
          input.canonicalClientId,
          'canonicalClientId',
        );
        const account = await this.resolveAccount(tenantId, clientId, tx);
        await tx.$queryRaw`
          SELECT "id" FROM "LoyaltyAccount"
          WHERE "id" = ${account.id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const locked = await tx.loyaltyAccount.findUniqueOrThrow({
          where: { id_tenantId: { id: account.id, tenantId } },
        });
        if (locked.balance !== Number(input.availableBalancePoints)) {
          throw new P403ExecutionContractError(
            'Grant balance evidence is stale',
          );
        }
        const legacySourceRef = this.text(
          input.requestIdentityHash,
          'requestIdentityHash',
        );
        const claimed = await tx.loyaltyRedemptionGrant.findUnique({
          where: { tenantId_legacySourceRef: { tenantId, legacySourceRef } },
        });
        if (claimed && claimed.issueExecutionId !== executionId) {
          throw new P403ExecutionContractError(
            'Logical grant is already owned by another execution',
          );
        }
        const issuedAt = this.now();
        const expiresAt = new Date(
          issuedAt.getTime() +
            this.integer(input.ttlDays, 'ttlDays') * 24 * 60 * 60 * 1_000,
        );
        const claimArtifact = issueLoyaltyRedemptionClaim();
        const grant = await tx.loyaltyRedemptionGrant.create({
          data: {
            tenantId,
            issueExecutionId: executionId,
            clientId,
            codeHash: loyaltyRedemptionClaimLookup(
              this.redemptionCodePepper,
              claimArtifact.bearer,
            ),
            serviceRef: this.text(input.serviceRef, 'serviceRef'),
            points: this.integer(input.servicePoints, 'servicePoints'),
            issuedAt,
            expiresAt,
            legacySourceRef,
          },
        });
        return this.grantValue(executionId, grant.id, claimArtifact);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertGrantConsumePreconditions(
    tenantId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const grant = await this.prisma.loyaltyRedemptionGrant.findUnique({
      where: {
        id_tenantId: {
          id: this.text(input.canonicalGrantId, 'canonicalGrantId'),
          tenantId,
        },
      },
      include: { redemption: true, revocation: true },
    });
    this.assertGrantConsumable(tenantId, input, grant);
  }

  private async consumeGrant(
    tenantId: string,
    executionId: string,
    input: Record<string, unknown>,
  ): Promise<P403ExecutionValue> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.loyaltyRedemption.findUnique({
          where: {
            actionExecutionId_tenantId: {
              actionExecutionId: executionId,
              tenantId,
            },
          },
        });
        if (existing) {
          const value = await this.consumeValueForExecutionTx(
            tx,
            tenantId,
            executionId,
          );
          if (!value || value === 'contradiction') {
            throw new P403ExecutionContractError(
              'Consume execution has contradictory durable facts',
            );
          }
          return value;
        }
        const grantId = this.text(input.canonicalGrantId, 'canonicalGrantId');
        await tx.$queryRaw`
          SELECT "id" FROM "LoyaltyRedemptionGrant"
          WHERE "id" = ${grantId} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const grant = await tx.loyaltyRedemptionGrant.findUnique({
          where: { id_tenantId: { id: grantId, tenantId } },
          include: { client: true, redemption: true, revocation: true },
        });
        this.assertGrantConsumable(tenantId, input, grant);
        if (!grant?.client.userId) {
          throw new P403ExecutionContractError(
            'Grant client has no canonical loyalty account owner',
          );
        }
        const account = await tx.loyaltyAccount.findUnique({
          where: { userId_tenantId: { userId: grant.client.userId, tenantId } },
        });
        if (!account) {
          throw new P403ExecutionContractError('Loyalty account is missing');
        }
        await tx.$queryRaw`
          SELECT "id" FROM "LoyaltyAccount"
          WHERE "id" = ${account.id} AND "tenantId" = ${tenantId}
          FOR UPDATE
        `;
        const locked = await tx.loyaltyAccount.findUniqueOrThrow({
          where: { id_tenantId: { id: account.id, tenantId } },
        });
        if (
          locked.balance !== Number(input.availableBalancePoints) ||
          locked.balance < grant.points
        ) {
          throw new P403ExecutionContractError(
            'Grant consume balance evidence is stale or insufficient',
          );
        }
        const redeemedAt = this.now();
        const redemption = await tx.loyaltyRedemption.create({
          data: {
            tenantId,
            grantId,
            actionExecutionId: executionId,
            redeemedAt,
            legacySourceRef: this.sha256([
              tenantId,
              grantId,
              'one-time-consume',
            ]),
          },
        });
        const balanceAfter = locked.balance - grant.points;
        await tx.loyaltyAccount.update({
          where: { id_tenantId: { id: locked.id, tenantId } },
          data: { balance: balanceAfter },
        });
        const transaction = await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            actionExecutionId: executionId,
            accountId: locked.id,
            kind: 'debit',
            delta: -grant.points,
            balanceAfter,
            encryptedReason: this.encryption.encrypt(
              'p4-03:consume_loyalty_redemption_grant',
            ),
            idempotencyKey: this.sha256([
              tenantId,
              executionId,
              'grant-consume-ledger',
            ]),
            externalRef: `p4-03:consume:${grantId}`,
          },
        });
        return {
          actionClass: 'consume_loyalty_redemption_grant',
          actionExecutionId: executionId,
          accountId: locked.id,
          balanceAfter,
          transactionIds: [transaction.id],
          grantId,
          redemptionId: redemption.id,
          providerWrites: 0,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private assertGrantConsumable(
    tenantId: string,
    input: Record<string, unknown>,
    grant: {
      id: string;
      tenantId: string;
      issueExecutionId: string | null;
      clientId: string;
      codeHash: string;
      serviceRef: string;
      points: number;
      issuedAt: Date;
      expiresAt: Date;
      redemption: { id: string } | null;
      revocation: { id: string } | null;
    } | null,
  ): void {
    if (!grant || grant.tenantId !== tenantId) {
      throw new P403ExecutionContractError('Grant is missing or cross-tenant');
    }
    if (grant.redemption || grant.revocation) {
      throw new P403ExecutionContractError(
        'Grant is already consumed or revoked',
      );
    }
    if (grant.expiresAt <= this.now()) {
      throw new P403ExecutionContractError('Grant is expired');
    }
    const grantIdentityHash = this.sha256([
      tenantId,
      grant.id,
      grant.clientId,
      grant.serviceRef,
      String(grant.points),
      grant.issuedAt.toISOString(),
      grant.expiresAt.toISOString(),
      grant.codeHash,
    ]);
    const issueExecutionIdentityHash = this.sha256([
      tenantId,
      grant.issueExecutionId,
    ]);
    if (
      input.canonicalGrantId !== grant.id ||
      input.canonicalClientId !== grant.clientId ||
      input.serviceRef !== grant.serviceRef ||
      Number(input.grantPoints) !== grant.points ||
      input.grantIdentityHash !== grantIdentityHash ||
      input.issueExecutionIdentityHash !== issueExecutionIdentityHash
    ) {
      throw new P403ExecutionContractError(
        'Grant consume facts do not match the immutable grant',
      );
    }
  }

  private async resolveAccount(
    tenantId: string,
    clientId: string,
    tx: Prisma.TransactionClient | PrismaClient = this.prisma,
  ) {
    const client = await tx.client.findUnique({
      where: { id_tenantId: { id: clientId, tenantId } },
    });
    if (!client?.userId) {
      throw new P403ExecutionContractError(
        'Canonical client has no tenant-qualified user binding',
      );
    }
    return tx.loyaltyAccount.upsert({
      where: { userId_tenantId: { userId: client.userId, tenantId } },
      update: {},
      create: { tenantId, userId: client.userId, source: 'internal' },
    });
  }

  private async ledgerValueForExecution(
    tenantId: string,
    executionId: string,
    actionClass: Exclude<
      P403ExecutableActionClass,
      'issue_loyalty_redemption_grant' | 'consume_loyalty_redemption_grant'
    >,
  ): Promise<P403ExecutionValue | null> {
    const row = await this.prisma.loyaltyTransaction.findFirst({
      where: { tenantId, actionExecutionId: executionId },
      include: { account: true },
    });
    return row ? this.ledgerValue(actionClass, executionId, row) : null;
  }

  private ledgerValue(
    actionClass: Exclude<
      P403ExecutableActionClass,
      'issue_loyalty_redemption_grant' | 'consume_loyalty_redemption_grant'
    >,
    executionId: string,
    row: { id: string; accountId: string; balanceAfter: number },
  ): P403ExecutionValue {
    return {
      actionClass,
      actionExecutionId: executionId,
      accountId: row.accountId,
      balanceAfter: row.balanceAfter,
      transactionIds: [row.id],
      providerWrites: 0,
    };
  }

  private async grantValueForExecution(
    tenantId: string,
    executionId: string,
  ): Promise<P403ExecutionValue | null> {
    const grant = await this.prisma.loyaltyRedemptionGrant.findUnique({
      where: {
        issueExecutionId_tenantId: { issueExecutionId: executionId, tenantId },
      },
    });
    return grant ? this.grantValue(executionId, grant.id) : null;
  }

  private grantValue(
    executionId: string,
    grantId: string,
    claimArtifact?: LoyaltyRedemptionClaimArtifactV1,
  ): P403ExecutionValue {
    return {
      actionClass: 'issue_loyalty_redemption_grant',
      actionExecutionId: executionId,
      grantId,
      ...(claimArtifact ? { claimArtifact } : {}),
      providerWrites: 0,
    };
  }

  private async consumeValueForExecution(
    tenantId: string,
    executionId: string,
  ): Promise<P403ExecutionValue | 'contradiction' | null> {
    return this.consumeValueForExecutionTx(this.prisma, tenantId, executionId);
  }

  private async consumeValueForExecutionTx(
    tx: Prisma.TransactionClient | PrismaClient,
    tenantId: string,
    executionId: string,
  ): Promise<P403ExecutionValue | 'contradiction' | null> {
    const [redemption, rows] = await Promise.all([
      tx.loyaltyRedemption.findUnique({
        where: {
          actionExecutionId_tenantId: {
            actionExecutionId: executionId,
            tenantId,
          },
        },
      }),
      tx.loyaltyTransaction.findMany({
        where: { tenantId, actionExecutionId: executionId },
      }),
    ]);
    if (!redemption && rows.length === 0) return null;
    if (!redemption || rows.length !== 1 || rows[0].delta >= 0) {
      return 'contradiction';
    }
    return {
      actionClass: 'consume_loyalty_redemption_grant',
      actionExecutionId: executionId,
      accountId: rows[0].accountId,
      balanceAfter: rows[0].balanceAfter,
      transactionIds: [rows[0].id],
      grantId: redemption.grantId,
      redemptionId: redemption.id,
      providerWrites: 0,
    };
  }

  private bulkEnvelope(
    input: Record<string, unknown>,
    actionClass: P403BulkActionClass,
  ): {
    audienceHash: string;
    childMutationHashes: string[];
  } {
    if (
      input.actionClass !== actionClass ||
      input.approvalScope !== 'exact_batch_envelope'
    ) {
      throw new P403ExecutionContractError('Bulk envelope action is invalid');
    }
    if (!Array.isArray(input.childMutationHashes)) {
      throw new P403ExecutionContractError('Bulk child hashes are missing');
    }
    return {
      audienceHash: this.text(input.audienceHash, 'audienceHash'),
      childMutationHashes: input.childMutationHashes.map((item) =>
        this.text(item, 'childMutationHash'),
      ),
    };
  }

  private plan(input: Record<string, unknown>): Record<string, unknown> {
    return input.plan === undefined ? input : this.record(input.plan, 'plan');
  }

  private safe(value: P403ExecutionValue): Record<string, unknown> {
    return {
      actionClass: value.actionClass,
      actionExecutionId: value.actionExecutionId,
      ...(value.accountId ? { accountId: value.accountId } : {}),
      ...(value.balanceAfter !== undefined
        ? { balanceAfter: value.balanceAfter }
        : {}),
      ...(value.transactionIds ? { transactionIds: value.transactionIds } : {}),
      ...(value.grantId ? { grantId: value.grantId } : {}),
      ...(value.redemptionId ? { redemptionId: value.redemptionId } : {}),
      ...(value.batchAudienceHash
        ? { batchAudienceHash: value.batchAudienceHash }
        : {}),
      ...(value.childMutationHashes
        ? { childMutationHashes: value.childMutationHashes }
        : {}),
      providerWrites: 0,
    };
  }

  private restore(value: Record<string, unknown>): P403ExecutionValue {
    const actionClass = this.text(value.actionClass, 'actionClass');
    if (!this.isExecutableActionClass(actionClass)) {
      throw new P403ExecutionContractError('Stored P4-03 result is invalid');
    }
    const transactionIds = Array.isArray(value.transactionIds)
      ? value.transactionIds.map((item) => this.text(item, 'transactionId'))
      : undefined;
    const childMutationHashes = Array.isArray(value.childMutationHashes)
      ? value.childMutationHashes.map((item) =>
          this.text(item, 'childMutationHash'),
        )
      : undefined;
    return {
      actionClass,
      actionExecutionId: this.text(
        value.actionExecutionId,
        'actionExecutionId',
      ),
      ...(value.accountId
        ? { accountId: this.text(value.accountId, 'accountId') }
        : {}),
      ...(value.balanceAfter !== undefined
        ? {
            balanceAfter: this.integer(value.balanceAfter, 'balanceAfter'),
          }
        : {}),
      ...(transactionIds ? { transactionIds } : {}),
      ...(value.grantId
        ? { grantId: this.text(value.grantId, 'grantId') }
        : {}),
      ...(value.redemptionId
        ? { redemptionId: this.text(value.redemptionId, 'redemptionId') }
        : {}),
      ...(value.batchAudienceHash
        ? {
            batchAudienceHash: this.text(
              value.batchAudienceHash,
              'batchAudienceHash',
            ),
          }
        : {}),
      ...(childMutationHashes ? { childMutationHashes } : {}),
      providerWrites: 0,
    };
  }

  private isExecutableActionClass(
    value: string,
  ): value is P403ExecutableActionClass {
    return [
      'earn_legacy_loyalty',
      'expire_legacy_loyalty',
      'redeem_legacy_loyalty',
      'refund_legacy_loyalty',
      'import_legacy_loyalty_balance',
      'backfill_legacy_loyalty',
      'issue_loyalty_redemption_grant',
      'consume_loyalty_redemption_grant',
    ].includes(value);
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new P403ExecutionContractError(`${label} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value) {
      throw new P403ExecutionContractError(`${label} must be a string`);
    }
    return value;
  }

  private integer(value: unknown, label: string): number {
    if (!Number.isInteger(value)) {
      throw new P403ExecutionContractError(`${label} must be an integer`);
    }
    return Number(value);
  }

  private sha256(parts: readonly unknown[]): string {
    return createHash('sha256')
      .update(parts.map((part) => this.hashScalar(part)).join('\u001f'))
      .digest('hex');
  }

  private hashScalar(part: unknown): string {
    if (part === null || part === undefined) return '';
    if (typeof part === 'string') return part;
    if (
      typeof part === 'number' ||
      typeof part === 'boolean' ||
      typeof part === 'bigint'
    ) {
      return part.toString();
    }
    throw new P403ExecutionContractError(
      'Loyalty execution hash identity parts must be scalar',
    );
  }
}
