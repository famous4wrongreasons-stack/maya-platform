import { asHandle } from '../noun-resolution/noun-handles';
import { openWidgetNounHandle } from '../emission/seal.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Injectable, HttpException } from '@nestjs/common';
import type { TerminalLine } from '../../widget-contract/lifecycle';
import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import type { AuthenticatedUser } from '../../common/authenticated-user.interface';
import type {
  ActuatingRoutingInput,
  EffectRouteOutcome,
} from '../routing/effect-router.ports';
import { SCHEDULE_AE } from '../emission/schedule-intent-template';

const refused = (): EffectRouteOutcome => ({
  receiptOutcome: 'REFUSED',
  refusalCode: 'insufficient_authority',
  actionReceiptRef: null,
  nextEnvelope: null,
  resolvedWidget: null,
  ownerDecision: null,
});

/** Presentation adapter only. Immutable approval and AE execution stay with their existing owners. */
@Injectable()
export class ScheduleApprovalAdapter {
  constructor(
    private readonly runtime: AiToolRuntimeService,
    private readonly prisma: PrismaService,
  ) {}
  async read(
    tenantId: string,
    userId: string,
    id: string,
    hash: string,
  ): Promise<boolean> {
    return this.runtime.hasPendingScheduleApproval(tenantId, userId, id, hash);
  }

  preview(actor: AuthenticatedUser, id: string, hash: string) {
    return this.runtime.scheduleApprovalPreview(actor, id, hash);
  }
  async terminalForWidget(
    user: AuthenticatedUser,
    widgetId: string,
  ): Promise<TerminalLine[]> {
    const row = await this.prisma.widgetIntentRecord.findFirst({
      where: {
        tenantId: user.tenantId!,
        widgetId,
        capabilityKey: SCHEDULE_AE,
        effect: 'COMMIT',
      },
      select: { frozenNounsJson: true },
    });
    if (!row) return [];
    const nouns = row.frozenNounsJson as Record<string, string>;
    const id = openWidgetNounHandle(asHandle(nouns.approval)),
      hash = openWidgetNounHandle(asHandle(nouns.payload));
    if (
      !id ||
      !hash ||
      id.noun !== 'approval' ||
      hash.noun !== 'payload' ||
      id.tenantId !== user.tenantId ||
      hash.tenantId !== user.tenantId ||
      id.ownerKind !== 'schedule_approval' ||
      hash.ownerKind !== 'schedule_approval'
    )
      return [];
    return this.terminal(user, id.ownerRef, hash.ownerRef);
  }
  async terminal(
    user: AuthenticatedUser,
    id: string,
    hash: string,
  ): Promise<TerminalLine[]> {
    let result: Record<string, unknown>;
    try {
      result = (await this.runtime.observeScheduleApproval(
        user,
        id,
        hash,
      )) as Record<string, unknown>;
    } catch {
      return [
        {
          outcome: 'SUBMITTED',
          text: 'Результат изменения графика пока не подтверждён. Повторная запись не выполнялась.',
          action_receipt_ref: null,
        },
      ];
    }
    if (result.status === 'pending') return [];
    const actions = Array.isArray(result.canonical_actions)
      ? (result.canonical_actions as Array<Record<string, unknown>>)
      : [];
    const succeeded = actions.find(
      (a) => a.state === 'SUCCEEDED' && typeof a.executionId === 'string',
    );
    if (result.status === 'completed' && succeeded)
      return [
        {
          outcome: 'CONFIRMED',
          text: 'График обновлён.',
          action_receipt_ref: succeeded.executionId as string,
        },
      ];
    if (result.status === 'expired')
      return [
        {
          outcome: 'EXPIRED_UNUSED',
          text: 'Срок подтверждения графика истёк.',
          action_receipt_ref: null,
        },
      ];
    if (['failed', 'not_executed', 'rejected'].includes(String(result.status)))
      return [
        {
          outcome: 'NOT_CONFIRMED',
          text: 'Изменение графика не подтверждено. Проверьте актуальное расписание.',
          action_receipt_ref: null,
        },
      ];
    return [
      {
        outcome: 'SUBMITTED',
        text: 'Результат изменения графика пока не подтверждён. Повторная запись не выполнялась.',
        action_receipt_ref: null,
      },
    ];
  }
  async commit(input: ActuatingRoutingInput): Promise<EffectRouteOutcome> {
    const r = input.routing.record;
    const id = input.resolvedNouns.values.get('approval');
    const hash = input.resolvedNouns.values.get('payload');
    if (
      r.widgetKind !== 'SETTINGS_DRAFT' ||
      r.capabilitySpace !== 'AE' ||
      r.capabilityKey !== SCHEDULE_AE ||
      r.confirmationOfKind !== 'draft' ||
      r.confirmationOfRef !== id ||
      !id ||
      !hash ||
      r.confirmationIdempotencyKey !== id
    )
      return refused();
    const user = {
      userId: input.actorUserId,
      tenantId: input.routing.tenantId,
      role: input.principal.role,
    } as AuthenticatedUser;
    // Runtime re-resolves live membership/role and the exact stored args before dispatch.
    let result: Record<string, unknown>;
    try {
      result = (await this.runtime.approve(user, id, {
        payloadHash: hash,
      })) as Record<string, unknown>;
    } catch (error) {
      // Only an explicit pre-dispatch refusal is a denial. A transport/store
      // fault can outlive dispatch; retain the durable approval for observation.
      try {
        result = (await this.runtime.observeScheduleApproval(
          user,
          id,
          hash,
        )) as Record<string, unknown>;
      } catch {
        result = { status: 'unknown' };
      }
      if (
        result.status === 'pending' &&
        error instanceof HttpException &&
        [400, 403, 404, 409].includes(error.getStatus())
      )
        return refused();
    }
    const actions = Array.isArray(result.canonical_actions)
      ? (result.canonical_actions as Array<Record<string, unknown>>)
      : [];
    const action = actions.find((a) => a.state === 'SUCCEEDED');
    return {
      receiptOutcome: [
        'failed',
        'not_executed',
        'expired',
        'rejected',
      ].includes(String(result.status))
        ? 'REFUSED'
        : 'ACCEPTED',
      refusalCode: ['failed', 'not_executed', 'expired', 'rejected'].includes(
        String(result.status),
      )
        ? 'effect_not_admissible'
        : null,
      actionReceiptRef:
        result.status === 'completed' && typeof action?.executionId === 'string'
          ? action.executionId
          : null,
      nextEnvelope: null,
      resolvedWidget: null,
      ownerDecision: {
        domain: 'staff_schedule',
        state:
          result.status === 'completed' &&
          typeof action?.executionId === 'string'
            ? 'SUCCEEDED'
            : ['failed', 'not_executed', 'expired', 'rejected'].includes(
                  String(result.status),
                )
              ? 'FAILED'
              : 'UNKNOWN',
      },
    };
  }
}
