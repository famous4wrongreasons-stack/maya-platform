import { ActionExecutionState } from '@prisma/client';

import { Package5Wave5CanonicalCutoverService } from './package5-wave5-canonical-cutover.service';

describe('Wave 5 production correction adapter', () => {
  const command = {
    conversionId: 'conversion-1',
    touchpointId: 'touchpoint-2',
    sourceEvidenceEventId: 'evidence-2',
    reasonCode: 'operator_evidence_correction' as const,
  };
  function setup(role = 'tenant_owner', prior = false) {
    const prepared = {
      request: { input: { actorRole: role } },
      existingExecution: prior ? { id: 'execution-1' } : null,
    };
    const planner = { build: jest.fn().mockResolvedValue(prepared) };
    const ingress = {
      createExecution: jest.fn().mockResolvedValue({
        id: 'execution-1',
        state: ActionExecutionState.PENDING_APPROVAL,
      }),
    };
    const kernel = { decideApproval: jest.fn().mockResolvedValue({}) };
    const executor = {
      execute: jest.fn().mockResolvedValue({ outcome: 'success' }),
      resume: jest.fn().mockResolvedValue({ outcome: 'restored' }),
    };
    const service = new Package5Wave5CanonicalCutoverService(
      planner as never,
      ingress as never,
      kernel as never,
      executor as never,
    );
    return { service, planner, ingress, kernel, executor, prepared };
  }

  it('binds the owner request to executable ingress and durable owner approval', async () => {
    const f = setup();
    await f.service.correctRecoveryAttribution(
      'tenant-1',
      'owner-1',
      command,
      'correction-0001',
    );
    expect(f.planner.build).toHaveBeenCalledWith(
      'tenant-1',
      'owner-1',
      { ...command, sourceIntentRef: 'correction-0001' },
      'execute',
    );
    expect(f.ingress.createExecution).toHaveBeenCalledWith(f.prepared.request);
    expect(f.kernel.decideApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      executionId: 'execution-1',
      approverUserId: 'owner-1',
      decision: 'APPROVED',
    });
    expect(f.executor.execute).toHaveBeenCalledWith(f.prepared);
  });

  it('rejects non-owner authority before creating an execution', async () => {
    const f = setup('manager');
    await expect(
      f.service.correctRecoveryAttribution(
        'tenant-1',
        'manager-1',
        command,
        'correction-0001',
      ),
    ).rejects.toThrow('active owner');
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
    expect(f.executor.execute).not.toHaveBeenCalled();
  });

  it('requires a stable caller identity so retries cannot silently become new commands', async () => {
    const f = setup();
    await expect(
      f.service.correctRecoveryAttribution('tenant-1', 'owner-1', command),
    ).rejects.toThrow('Idempotency-Key');
    expect(f.planner.build).not.toHaveBeenCalled();
  });

  it('restores an existing successful execution without requesting another approval', async () => {
    const f = setup('tenant_owner', true);
    f.ingress.createExecution.mockResolvedValue({
      id: 'execution-1',
      state: ActionExecutionState.SUCCEEDED,
    });
    await f.service.correctRecoveryAttribution(
      'tenant-1',
      'owner-1',
      command,
      'correction-0001',
    );
    expect(f.kernel.decideApproval).not.toHaveBeenCalled();
    expect(f.executor.resume).toHaveBeenCalledWith(f.prepared);
    expect(f.executor.execute).not.toHaveBeenCalled();
  });

  it('propagates stale evidence and authority rejection without a legacy fallback', async () => {
    const f = setup();
    f.planner.build.mockRejectedValue(new Error('stale source evidence'));
    await expect(
      f.service.correctRecoveryAttribution(
        'tenant-1',
        'owner-1',
        command,
        'correction-0001',
      ),
    ).rejects.toThrow('stale source evidence');
    expect(f.ingress.createExecution).not.toHaveBeenCalled();
    expect(f.executor.execute).not.toHaveBeenCalled();
  });

  it('stops on failed approval unless a concurrent approval already completed', async () => {
    const f = setup();
    f.kernel.decideApproval.mockRejectedValue(new Error('approval rejected'));
    await expect(
      f.service.correctRecoveryAttribution(
        'tenant-1',
        'owner-1',
        command,
        'correction-0001',
      ),
    ).rejects.toThrow('approval rejected');
    expect(f.executor.execute).not.toHaveBeenCalled();
    const concurrent = setup();
    concurrent.kernel.decideApproval.mockRejectedValue(
      new Error('APPROVAL_NOT_PENDING'),
    );
    concurrent.ingress.createExecution
      .mockResolvedValueOnce({
        id: 'execution-1',
        state: ActionExecutionState.PENDING_APPROVAL,
      })
      .mockResolvedValueOnce({
        id: 'execution-1',
        state: ActionExecutionState.READY,
      });
    await concurrent.service.correctRecoveryAttribution(
      'tenant-1',
      'owner-1',
      command,
      'correction-0001',
    );
    expect(concurrent.executor.execute).toHaveBeenCalledWith(
      concurrent.prepared,
    );
  });
});
