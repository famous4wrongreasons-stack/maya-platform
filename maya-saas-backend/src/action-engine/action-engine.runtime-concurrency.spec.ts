import { ActionExecutionState } from '@prisma/client';
import {
  ActionEngineRuntimeService,
  type ActionRuntimeHandlers,
} from './action-engine.runtime';
import type { TrustedActionExecutionRequestV1 } from './action-engine.contract';

function setup() {
  const executions = new Map<
    string,
    {
      id: string;
      tenantId: string;
      state: ActionExecutionState;
      safeResultSummaryJson?: Record<string, unknown>;
    }
  >();
  const ingress = {
    createExecution: jest.fn((request: TrustedActionExecutionRequestV1) => {
      const key = request.tenantId;
      if (!executions.has(key))
        executions.set(key, {
          id: 'same-id',
          tenantId: key,
          state: ActionExecutionState.READY,
        });
      return Promise.resolve({ ...executions.get(key) });
    }),
  };
  const kernel = {
    claimExecution: jest.fn(({ tenantId }: { tenantId: string }) =>
      Promise.resolve({
        execution: {
          ...executions.get(tenantId),
          transportIdempotencyKey: 'stable',
        },
        attempt: { id: 'attempt' },
        leaseToken: 'lease',
      }),
    ),
    readTrustedNormalizedInput: jest.fn().mockResolvedValue({}),
    markDispatchMayHaveCrossed: jest.fn().mockResolvedValue(undefined),
    markDispatchAcknowledged: jest.fn().mockResolvedValue(undefined),
    finalizeSuccess: jest.fn(
      ({
        tenantId,
        safeResult,
      }: {
        tenantId: string;
        safeResult: Record<string, unknown>;
      }) => {
        Object.assign(executions.get(tenantId)!, {
          state: ActionExecutionState.SUCCEEDED,
          safeResultSummaryJson: safeResult,
        });
        return Promise.resolve();
      },
    ),
    finalizeDefinitiveFailure: jest.fn().mockResolvedValue(undefined),
    getAudit: jest.fn((tenantId: string) =>
      Promise.resolve({ execution: executions.get(tenantId) }),
    ),
    getExecutionResult: jest.fn((tenantId: string) =>
      Promise.resolve({
        state: executions.get(tenantId)?.state,
        executionId: 'same-id',
      }),
    ),
  };
  const runtime = new ActionEngineRuntimeService(
    kernel as never,
    ingress as never,
  );
  const request = (key: string, tenantId = 'tenant-1') =>
    ({
      tenantId,
      callerIdempotency: { scope: 'test', key },
    }) as TrustedActionExecutionRequestV1;
  const dispatch = jest.fn().mockResolvedValue({
    value: 'accepted',
    safeResult: { result: 'accepted' },
  });
  const handlers: ActionRuntimeHandlers<string> = {
    dispatch,
    restore: (safe) => String(safe.result),
    reconcile: () => Promise.resolve({ outcome: 'STILL_UNKNOWN' }),
    classifyError: () => ({
      kind: 'definitive',
      outcomeCode: 'rejected',
      errorClass: 'rejected',
    }),
  };
  return { runtime, ingress, kernel, request, handlers, dispatch };
}

describe('Action Engine concurrent transport aliases', () => {
  it('passes every caller key through ingress but claims and dispatches the durable execution only once', async () => {
    const h = setup();
    const result = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        h.runtime.executeWithReceipt(h.request(String(i)), h.handlers),
      ),
    );
    expect(h.ingress.createExecution).toHaveBeenCalledTimes(12);
    expect(h.kernel.claimExecution).toHaveBeenCalledTimes(1);
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    expect(result.every((item) => item.value === 'accepted')).toBe(true);
  });

  it('never coalesces two tenants and does not retain failed operations', async () => {
    const h = setup();
    await Promise.all(
      ['tenant-1', 'tenant-2'].map((tenantId) =>
        h.runtime.executeWithReceipt(
          h.request('same-alias', tenantId),
          h.handlers,
        ),
      ),
    );
    expect(h.dispatch).toHaveBeenCalledTimes(2);
    const failed = setup();
    failed.dispatch.mockRejectedValueOnce(new Error('before acceptance'));
    await expect(
      failed.runtime.executeWithReceipt(
        failed.request('first'),
        failed.handlers,
      ),
    ).rejects.toThrow('before acceptance');
    await expect(
      failed.runtime.executeWithReceipt(
        failed.request('retry'),
        failed.handlers,
      ),
    ).resolves.toMatchObject({ value: 'accepted' });
    expect(failed.dispatch).toHaveBeenCalledTimes(2);
  });
});
