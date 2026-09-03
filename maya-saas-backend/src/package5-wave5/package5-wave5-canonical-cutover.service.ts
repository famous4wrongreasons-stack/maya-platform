import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ActionApprovalDecision, ActionExecutionState } from '@prisma/client';

import {
  ActionEngineKernel,
  CanonicalActionIngressService,
} from '../action-engine';
import {
  Package5Wave5ExecutableService,
  Package5Wave5ShadowService,
  type RecoveryAttributionCorrectionCommand,
} from './package5-wave5.service';

/** Owner-authenticated intent; all durable correction writes belong to the executor. */
@Injectable()
export class Package5Wave5CanonicalCutoverService {
  constructor(
    private readonly planner: Package5Wave5ShadowService,
    private readonly ingress: CanonicalActionIngressService,
    private readonly kernel: ActionEngineKernel,
    private readonly executor: Package5Wave5ExecutableService,
  ) {}

  async correctRecoveryAttribution(
    tenantId: string,
    actorUserId: string,
    command: Omit<RecoveryAttributionCorrectionCommand, 'sourceIntentRef'>,
    idempotencyKey?: string,
  ) {
    const sourceIntentRef = idempotencyKey?.trim() ?? '';
    if (!/^[A-Za-z0-9._:-]{8,240}$/.test(sourceIntentRef)) {
      throw new BadRequestException('A bounded Idempotency-Key is required');
    }
    const prepared = await this.planner.build(
      tenantId,
      actorUserId,
      { ...command, sourceIntentRef },
      'execute',
    );
    const input = prepared.request.input as Record<string, unknown>;
    if (!['tenant_owner', 'business_owner'].includes(String(input.actorRole))) {
      throw new ForbiddenException(
        'An active owner must authorize recovery correction',
      );
    }
    let execution = await this.ingress.createExecution(prepared.request);
    if (execution.state === ActionExecutionState.PENDING_APPROVAL) {
      try {
        await this.kernel.decideApproval({
          tenantId,
          executionId: execution.id,
          approverUserId: actorUserId,
          decision: ActionApprovalDecision.APPROVED,
        });
      } catch (error) {
        execution = await this.ingress.createExecution(prepared.request);
        if (
          execution.state !== ActionExecutionState.READY &&
          execution.state !== ActionExecutionState.SUCCEEDED
        ) {
          throw error;
        }
      }
    }
    return prepared.existingExecution
      ? this.executor.resume(prepared)
      : this.executor.execute(prepared);
  }
}
