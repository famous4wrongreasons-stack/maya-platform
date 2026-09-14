import { Injectable } from '@nestjs/common';
import { C9Allowance } from './c9.allowance';
import { C9WorkService } from './c9.work';
import { C9Domain, C9Object, C9_TASKS, c9Deny, c9Hash } from './c9.contract';
import { c9PriceUpperBound } from './c9.budget';

export type C9ModelCall = {
  callKey: string;
  taskKey: (typeof C9_TASKS)[number];
  domain: C9Domain | 'ORCHESTRATOR';
  skillHash: string;
  providerModelKey: string;
  /** Conservative upper bounds; a run reserves the bound, never an optimistic estimate. */
  inputTokens: number;
  outputTokens: number;
  inputHash: string;
  evidenceRefs: unknown[];
  revisionId?: string;
};
export type C9ModelOutcome =
  | { status: 'UNAVAILABLE'; reason: string }
  | { status: 'SETTLED'; workId: string; result: unknown }
  | { status: 'HELD_UNKNOWN'; workId: string };

/**
 * The single paid-reasoning door. It cannot be bypassed: every model call is a reserved,
 * fenced C9WorkReceipt, dispatched only after DISPATCHED is durable, and settled exactly
 * once. A dispatch whose outcome is unproven is HELD_UNKNOWN with its worst-case cost
 * still charged — never retried automatically, never quietly released.
 *
 * With no released allowance this returns UNAVAILABLE without reserving anything, which is
 * a supported deterministic result for the caller rather than an error to be worked around.
 */
@Injectable()
export class C9ModelGateway {
  constructor(
    private readonly allowance: C9Allowance,
    private readonly work: C9WorkService,
  ) {}
  available(now: Date): boolean {
    return this.allowance.released(now) !== null;
  }
  async reason(
    runId: string,
    call: C9ModelCall,
    invoke: (dispatch: {
      providerModelKey: string;
      inputTokens: number;
      outputTokens: number;
    }) => Promise<{
      result: unknown;
      inputTokens: number;
      outputTokens: number;
    }>,
    now: Date,
    channelProof?: string,
  ): Promise<C9ModelOutcome> {
    if (!C9_TASKS.includes(call.taskKey)) c9Deny('unregistered_model_task');
    const released = this.allowance.released(now);
    if (!released)
      return { status: 'UNAVAILABLE', reason: 'paid_capability_not_activated' };
    const basis = released.basis;
    const reservation = {
      contract: 'maya.c9-reservation/1',
      toolCalls: 0,
      modelCalls: 1,
      domain: call.domain,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costMicros: c9PriceUpperBound(
        basis,
        call.inputTokens,
        call.outputTokens,
        now,
      ),
      priceHash: basis.hash as string,
      zeroCostEvidenceRef: null,
      stepRef: null,
    };
    const receipt = await this.work.reserve(
      runId,
      {
        callKey: call.callKey,
        domain: call.domain,
        kind: 'MODEL',
        taskKey: call.taskKey,
        inputHash: call.inputHash,
        evidenceRefs: call.evidenceRefs,
        reservation,
        revisionId: call.revisionId,
        skillHash: call.skillHash,
        providerModelKey: call.providerModelKey,
        priceBasis: basis,
      },
      channelProof,
    );
    if (receipt.state === 'SETTLED')
      return {
        status: 'SETTLED',
        workId: receipt.id,
        result: receipt.resultJson,
      };
    if (receipt.state === 'HELD_UNKNOWN')
      return { status: 'HELD_UNKNOWN', workId: receipt.id };
    const lease = await this.work.claim(runId, receipt.id, channelProof);
    if (!lease)
      return { status: 'UNAVAILABLE', reason: 'budget_or_window_exhausted' };
    let reply: { result: unknown; inputTokens: number; outputTokens: number };
    try {
      reply = await invoke({
        providerModelKey: call.providerModelKey,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      });
    } catch {
      // A provider error is not proof the request never reached the provider.
      await this.work.hold(lease, channelProof);
      return { status: 'HELD_UNKNOWN', workId: receipt.id };
    }
    const usage = {
      contract: 'maya.c9-usage/1',
      usageReceiptRef: c9Hash('usage-receipt/1', [receipt.id, call.callKey]),
      verifiedAt: now.toISOString(),
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      costMicros: c9PriceUpperBound(
        basis,
        Math.min(reply.inputTokens, call.inputTokens),
        Math.min(reply.outputTokens, call.outputTokens),
        now,
      ),
      priceHash: basis.hash as string,
      completionKind: 'CONFIRMED',
    } satisfies C9Object;
    const settled = await this.work.settle(
      lease,
      reply.result,
      usage,
      channelProof,
    );
    return {
      status: 'SETTLED',
      workId: settled.id,
      result: settled.resultJson,
    };
  }
}
