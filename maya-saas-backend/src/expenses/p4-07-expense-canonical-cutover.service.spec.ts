import { BadRequestException } from '@nestjs/common';
import { ActionExecutionState } from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineKernel,
  CanonicalActionIngressService,
  P4_07_EXECUTABLE_CAPABILITIES,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { ExpenseCanonicalShadowService } from './expense-canonical-shadow.service';
import { P407ExpenseCanonicalCutoverService } from './p4-07-expense-canonical-cutover.service';
import { P407ExpenseExecutableService } from './p4-07-expense-executable.service';

function request(capability: string): TrustedActionExecutionRequestV1 {
  return {
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: 'tenant-a',
    capability,
    source: {
      type: 'authenticated_request',
      occurrenceScope: 'p4-07:test',
      sourceRef: 'intent-1',
      actorUserId: 'owner-a',
    },
    targetRef: 'expense:test',
    input: {},
    evidenceRefs: ['policy:test'],
    callerIdempotency: { scope: 'p4-07:test', key: 'intent-1' },
  };
}

function harness(state: ActionExecutionState = ActionExecutionState.READY) {
  const createRequest = request(P4_07_EXECUTABLE_CAPABILITIES.create);
  const deleteRequest = request(P4_07_EXECUTABLE_CAPABILITIES.delete);
  const declareRequest = request(P4_07_EXECUTABLE_CAPABILITIES.declare);
  const buildCreateRequest = jest.fn().mockResolvedValue(createRequest);
  const buildDeleteRequest = jest.fn().mockResolvedValue(deleteRequest);
  const buildDeclareRequest = jest.fn().mockResolvedValue(declareRequest);
  const planner = {
    buildCreateRequest,
    buildDeleteRequest,
    buildDeclareRequest,
  } as unknown as ExpenseCanonicalShadowService;
  const createExecution = jest.fn().mockResolvedValue({
    id: 'execution-1',
    tenantId: 'tenant-a',
    state,
  });
  const decideApproval = jest.fn().mockResolvedValue({
    id: 'execution-1',
    state: ActionExecutionState.READY,
  });
  const execute = jest.fn((req: TrustedActionExecutionRequestV1) =>
    Promise.resolve({
      actionClass:
        req.capability === P4_07_EXECUTABLE_CAPABILITIES.create
          ? ('create_expense' as const)
          : req.capability === P4_07_EXECUTABLE_CAPABILITIES.delete
            ? ('delete_expense' as const)
            : ('declare_expense_period_complete' as const),
      actionExecutionId: 'execution-1',
      invalidatedDeclarationIds: [],
      expenseCreates: 0,
      expenseDeletes: 0,
      declarationCreates: 0,
      unknownApplicable: false as const,
      providerWrites: 0 as const,
    }),
  );
  const service = new P407ExpenseCanonicalCutoverService(
    planner,
    { createExecution } as unknown as CanonicalActionIngressService,
    { decideApproval } as ActionEngineKernel,
    { execute } as P407ExpenseExecutableService,
  );
  return {
    service,
    planner,
    buildCreateRequest,
    buildDeleteRequest,
    buildDeclareRequest,
    createExecution,
    decideApproval,
    execute,
    createRequest,
    deleteRequest,
    declareRequest,
  };
}

describe('P407ExpenseCanonicalCutoverService', () => {
  it('submits a stable create intent to the executable capability', async () => {
    const h = harness(ActionExecutionState.PENDING_APPROVAL);
    await h.service.create(
      'tenant-a',
      'owner-a',
      {
        category: 'rent',
        amountKopecks: 125_000,
        currency: 'RUB',
        occurredAt: '2026-09-02T10:00:00.000Z',
      },
      { initiator: 'http', sourceIntentRef: 'request-1' },
    );

    expect(h.buildCreateRequest).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      expect.objectContaining({
        initiator: 'http',
        source_intent_ref: 'request-1',
      }),
      P4_07_EXECUTABLE_CAPABILITIES.create,
    );
    expect(h.decideApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      executionId: 'execution-1',
      approverUserId: 'owner-a',
      decision: 'APPROVED',
    });
    expect(h.execute).toHaveBeenCalledWith(h.createRequest);
  });

  it('fails closed when create has no stable source intent', async () => {
    const h = harness();
    await expect(
      h.service.create(
        'tenant-a',
        'owner-a',
        {
          category: 'rent',
          amountKopecks: 125_000,
          occurredAt: '2026-09-02T10:00:00.000Z',
        },
        { initiator: 'http', sourceIntentRef: '   ' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.buildCreateRequest).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('derives delete identity from the exact expense and records actor confirmation', async () => {
    const h = harness(ActionExecutionState.PENDING_APPROVAL);
    await h.service.remove('tenant-a', 'owner-a', 'expense-a');
    expect(h.buildDeleteRequest).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      {
        initiator: 'http',
        source_intent_ref: 'expense-delete:expense-a',
        expense_id: 'expense-a',
      },
      P4_07_EXECUTABLE_CAPABILITIES.delete,
    );
    expect(h.execute).toHaveBeenCalledWith(h.deleteRequest);
  });

  it('keeps owner period declaration approval-free and epoch-derived by the planner', async () => {
    const h = harness(ActionExecutionState.READY);
    await h.service.declare(
      'tenant-a',
      'owner-a',
      '2026-08-01',
      '2026-08-31',
      'approval-intent-1',
    );
    expect(h.buildDeclareRequest).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      expect.objectContaining({
        initiator: 'ai_tool',
        source_intent_ref: 'approval-intent-1',
      }),
      P4_07_EXECUTABLE_CAPABILITIES.declare,
    );
    expect(h.createExecution).not.toHaveBeenCalled();
    expect(h.decideApproval).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith(h.declareRequest);
  });
});
