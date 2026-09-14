// Async Prisma mocks retain Promise-shaped interfaces; unsafe values are limited to fixture storage.
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { ConflictException } from '@nestjs/common';
import { Prisma, type ActionExecution } from '@prisma/client';
import { ActionEngineRuntimeService } from '../action-engine/action-engine.runtime';
import { admitWithInvocationReceipt } from '../action-engine/action-invocation-receipt.context';
import type { TrustedActionExecutionRequestV1 } from '../action-engine/action-engine.contract';
import { UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { AiToolReceiptService } from './ai-tool-receipt.service';

const USER = {
  userId: 'actor-a',
  tenantId: 'tenant-a',
  role: UserRole.TENANT_OWNER,
} as AuthenticatedUser;
const KEY = 'd9f422fc-02ec-4544-a42a-277edb3d9f0b';
const clone = <T>(value: T): T => structuredClone(value);
type Row = Record<string, any>; // Fixture database only; production contracts remain typed.

function setup() {
  let ai: Row | null = null;
  const canonical = new Map<string, Row>();
  let queue = Promise.resolve();
  let failReceiptSave = false;
  let failAudit = false;
  let effects = 0;
  let reconciles = 0;
  let dispatchBody: () => Promise<void> = () => Promise.resolve();
  let reconcileOutcome = 'STILL_UNKNOWN';
  let afterCanonical: () => Promise<void> = () => Promise.resolve();
  const db: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    aiToolExecution: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (!ai) return null;
        const key = where.tenantId_idempotencyKey;
        return key &&
          (key.tenantId !== ai.tenantId ||
            key.idempotencyKey !== ai.idempotencyKey)
          ? null
          : clone(ai);
      }),
      create: jest.fn(async ({ data }: any) => {
        if (ai)
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        ai = { id: 'ai-a', ...clone(data) };
        return clone(ai);
      }),
      update: jest.fn(async ({ data }: any) => {
        if (failReceiptSave && data.encryptedResult && !data.status)
          throw new Error('receipt persistence rejected');
        Object.assign(ai!, clone(data));
        return clone(ai);
      }),
    },
    aiApprovalRequest: {
      update: jest.fn(async ({ data }: any) => data),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    actionExecution: {
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.id_tenantId;
        const row = canonical.get(key.id);
        return row?.tenantId === key.tenantId ? clone(row) : null;
      }),
    },
  };
  db.$transaction = async (operation: any) => {
    if (Array.isArray(operation)) return Promise.all(operation);
    let release!: () => void;
    const previous = queue;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeAi = clone(ai);
    const beforeCanonical = clone(canonical);
    try {
      return await operation(db);
    } catch (error) {
      ai = beforeAi;
      canonical.clear();
      for (const [key, row] of beforeCanonical) canonical.set(key, row);
      throw error;
    } finally {
      release();
    }
  };
  const encryption = {
    encrypt: (value: string) => Buffer.from(value).toString('base64'),
    decrypt: (value: string) => Buffer.from(value, 'base64').toString(),
  };
  const context = new TenantContextService();
  const definition = {
    name: 'settings.update',
    riskTier: 'low_write',
    approvalPolicy: 'none',
    idempotency: 'required',
    timeoutMs: 20,
    fallbackPolicy: 'fail_closed',
  };
  const request = (args: Row): TrustedActionExecutionRequestV1 => ({
    contract: 'maya.action-execution-request/1',
    tenantId: 'tenant-a',
    capability: 'fixture.existing.canonical-owner',
    source: {
      type: 'authenticated_request',
      sourceRef: 'ai-tool-fixture',
      occurrenceScope: KEY,
      actorUserId: 'actor-a',
    },
    targetRef: 'owned-target',
    input: args,
    evidenceRefs: [],
    callerIdempotency: { scope: 'fixture', key: KEY },
  });
  const ingress = {
    createExecution: (candidate: TrustedActionExecutionRequestV1) =>
      admitWithInvocationReceipt(candidate, async (effective) => {
        if (!canonical.has('canonical-a'))
          canonical.set('canonical-a', {
            id: 'canonical-a',
            tenantId: 'tenant-a',
            actorUserId: 'actor-a',
            capability: effective.capability,
            targetRef: effective.targetRef,
            identityFingerprint: 'fingerprint-a',
            normalizedInputHash: 'input-a',
            state: 'READY',
            reconciliationState: 'NOT_REQUIRED',
            safeResultSummaryJson: null,
          });
        return clone(canonical.get('canonical-a')!) as ActionExecution;
      }),
  };
  const kernel: any = {
    getAudit: async () => ({ execution: clone(canonical.get('canonical-a')) }),
    getExecutionResult: async () => ({
      contract: 'maya.action-execution-result/1',
      executionId: 'canonical-a',
      state: canonical.get('canonical-a')?.state,
    }),
    claimExecution: async () => {
      const row = canonical.get('canonical-a')!;
      row.state = 'EXECUTING';
      return {
        execution: { ...row, transportIdempotencyKey: 'same-provider-key' },
        attempt: { id: 'attempt-a' },
        leaseToken: 'lease-a',
      };
    },
    readTrustedNormalizedInput: async () => ({ intended: true }),
    markDispatchMayHaveCrossed: async () => undefined,
    markDispatchAcknowledged: async () => undefined,
    finalizeSuccess: async ({ safeResult }: any) =>
      Object.assign(canonical.get('canonical-a')!, {
        state: 'SUCCEEDED',
        safeResultSummaryJson: safeResult,
      }),
    finalizeUnknown: async () =>
      Object.assign(canonical.get('canonical-a')!, {
        state: 'UNKNOWN',
        reconciliationState: 'PENDING',
      }),
    claimReconciliation: async () => ({
      attempt: { id: 'reconcile-a' },
      leaseToken: 'reconcile-lease',
    }),
    readLatestPreDispatchContext: async () => undefined,
    finalizeReconciliation: async ({ outcome, safeResult }: any) => {
      Object.assign(
        canonical.get('canonical-a')!,
        outcome === 'PROVEN_SUCCEEDED'
          ? {
              state: 'SUCCEEDED',
              reconciliationState: 'RESOLVED',
              safeResultSummaryJson: safeResult,
            }
          : { state: 'UNKNOWN', reconciliationState: 'MANUAL_REQUIRED' },
      );
    },
  };
  const engine = new ActionEngineRuntimeService(kernel, ingress as never);
  const handler = {
    normalizeArguments: async (_name: string, _principal: unknown, args: Row) =>
      args,
    execute: jest.fn(async (_name: string, _principal: unknown, args: Row) => {
      const receipt = await engine.executeWithReceipt(request(args), {
        dispatch: async () => {
          // The current receipt is durable before this synthetic effect starts.
          expect(
            JSON.parse(encryption.decrypt(ai!.encryptedResult)).bindings[0]
              .executionId,
          ).toBe('canonical-a');
          effects += 1;
          await dispatchBody();
          return { value: { accepted: true }, safeResult: { accepted: true } };
        },
        restore: (safe) => safe,
        reconcile: async () => {
          reconciles += 1;
          return {
            outcome: reconcileOutcome as never,
            safeResult: { accepted: true },
          };
        },
        classifyError: () => ({
          kind: 'unknown',
          outcomeCode: 'provider_unknown',
          errorClass: 'fixture',
        }),
      });
      await afterCanonical();
      return receipt.value;
    }),
  };
  const registry = {
    get: () => definition,
    validateArguments: (_name: string, args: Row) => args,
  };
  const policy = {
    buildPrincipal: (
      tenantId: string,
      userId: string,
      role: string,
      surface: string,
    ) => ({ tenantId, userId, role, surface }),
    assertCanExecute: async () => undefined,
  };
  const createRuntime = () =>
    new AiToolRuntimeService(
      db,
      context,
      registry as never,
      policy as never,
      handler as never,
      encryption as never,
      {
        log: async () => {
          if (failAudit) throw new Error('audit unavailable');
        },
      } as never,
      new AiToolReceiptService(db, encryption as never, kernel),
    );
  let runtime = createRuntime();
  const run = (
    args: Row = { enabled: true },
    user = USER,
    key: string | undefined = KEY,
  ) =>
    context.runAsSystemTenant(user.tenantId!, () =>
      runtime.execute(user, definition.name, {
        surface: 'web',
        arguments: args,
        idempotencyKey: key,
      }),
    );
  return {
    run,
    db,
    handler,
    definition,
    canonical,
    kernel,
    encryption,
    request,
    ingress,
    state: () => ({ ai, effects, reconciles }),
    restart: () => {
      runtime = createRuntime();
    },
    failSave: () => {
      failReceiptSave = true;
    },
    failAudit: () => {
      failAudit = true;
    },
    dispatch: (fn: () => Promise<void>) => {
      dispatchBody = fn;
    },
    reconciliation: (outcome: string) => {
      reconcileOutcome = outcome;
    },
    afterCanonical: (fn: () => Promise<void>) => {
      afterCanonical = fn;
    },
  };
}

describe('R10 canonical AI receipt boundary', () => {
  it('attaches durably before effect and replays the same canonical outcome after wrapper restart', async () => {
    const h = setup();
    expect(await h.run()).toMatchObject({
      status: 'completed',
      result: { accepted: true },
      canonical_actions: [{ executionId: 'canonical-a', state: 'SUCCEEDED' }],
    });
    h.restart();
    expect(await h.run()).toMatchObject({
      status: 'completed',
      replayed: true,
    });
    expect(h.state().effects).toBe(1);
    expect(h.handler.execute).toHaveBeenCalledTimes(1);
  });

  it('rolls admission back and never dispatches when the receipt cannot be saved', async () => {
    const h = setup();
    h.failSave();
    expect(await h.run()).toMatchObject({ status: 'not_executed' });
    expect(h.canonical.size).toBe(0);
    expect(h.state().effects).toBe(0);
  });

  it('keeps timeout nonterminal and records late canonical success without losing the key', async () => {
    const h = setup();
    let release!: () => void;
    h.dispatch(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    expect(await h.run()).toMatchObject({
      status: 'executing',
      canonical_actions: [{ state: 'EXECUTING' }],
    });
    expect(h.state().ai!.status).toBe('executing');
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    h.restart();
    expect(await h.run()).toMatchObject({
      status: 'completed',
      canonical_actions: [{ executionId: 'canonical-a' }],
    });
    expect(h.state().effects).toBe(1);
  });

  it('preserves UNKNOWN/manual-required and later reconciles the same execution without redispatch', async () => {
    const h = setup();
    h.dispatch(() => Promise.reject(new Error('ambiguous provider outcome')));
    expect(await h.run()).toMatchObject({
      status: 'unknown',
      canonical_actions: [
        { state: 'UNKNOWN', reconciliationState: 'MANUAL_REQUIRED' },
      ],
    });
    expect(h.state().ai!.status).toBe('executing');
    h.restart();
    expect(await h.run()).toMatchObject({ status: 'unknown' });
    expect(h.state().effects).toBe(1);
    // Existing reconciliation policy/operator makes the same execution eligible.
    h.canonical.get('canonical-a')!.reconciliationState = 'PENDING';
    h.reconciliation('PROVEN_SUCCEEDED');
    expect(await h.run()).toMatchObject({
      status: 'completed',
      canonical_actions: [{ executionId: 'canonical-a' }],
    });
    expect(h.state().effects).toBe(1);
    expect(h.state().reconciles).toBe(2);
  });

  it('does not rewrite canonical success when completion audit fails', async () => {
    const h = setup();
    h.failAudit();
    expect(await h.run()).toMatchObject({ status: 'completed' });
    expect(h.state().ai!.status).toBe('completed');
    expect(await h.run()).toMatchObject({
      status: 'completed',
      replayed: true,
    });
    expect(h.state().effects).toBe(1);
  });

  it('does not infer whole tool completion from a successful prefix after a crash or presentation loss', async () => {
    const h = setup();
    h.afterCanonical(() =>
      Promise.reject(new Error('process stopped before next logical slot')),
    );
    expect(await h.run()).toMatchObject({
      status: 'unknown',
      invocation_completed: false,
      continuation: 'manual_required',
      canonical_actions: [{ executionId: 'canonical-a', state: 'SUCCEEDED' }],
    });
    const handlerCalls = h.handler.execute.mock.calls.length;
    h.restart();
    expect(await h.run()).toMatchObject({
      status: 'unknown',
      invocation_completed: false,
      canonical_actions: [{ executionId: 'canonical-a', state: 'SUCCEEDED' }],
    });
    expect(h.handler.execute).toHaveBeenCalledTimes(handlerCalls);
    expect(h.canonical.size).toBe(1);
    expect(h.state().effects).toBe(1);
  });

  it('allows concurrent same-key invocations to share one admitted execution and one effect', async () => {
    const h = setup();
    h.definition.timeoutMs = 1000;
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => h.run()),
    );
    expect(outcomes.every((outcome) => outcome.status === 'completed')).toBe(
      true,
    );
    expect(h.canonical.size).toBe(1);
    expect(h.state().effects).toBe(1);
  });

  it('rejects changed input or another actor under the same key before a second effect', async () => {
    const h = setup();
    await h.run();
    await expect(h.run({ enabled: false })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      h.run({ enabled: true }, { ...USER, userId: 'actor-b' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.state().effects).toBe(1);
  });

  it('fences later receipt slots to the original live handler when two first callers read an empty envelope', async () => {
    const h = setup();
    const service = new AiToolReceiptService(h.db, h.encryption as never);
    const principal = {
      ...USER,
      userId: USER.userId,
      tenantId: 'tenant-a',
      surface: 'web',
    } as never;
    const invocation = {
      id: 'ai-a',
      principal,
      toolName: 'settings.update',
      inputHash: 'same-input',
      idempotencyKey: KEY,
    };
    await h.db.aiToolExecution.create({
      data: {
        tenantId: 'tenant-a',
        actorUserId: USER.userId,
        toolName: invocation.toolName,
        inputHash: invocation.inputHash,
        surface: 'web',
        idempotencyKey: KEY,
        encryptedResult: service.initial('same-input', { enabled: true }),
      },
    });
    let secondEntered!: () => void;
    const bothEntered = new Promise<void>((resolve) => {
      secondEntered = resolve;
    });
    let firstBound!: () => void;
    const bound = new Promise<void>((resolve) => {
      firstBound = resolve;
    });
    let releaseOriginal!: () => void;
    const continueOriginal = new Promise<void>((resolve) => {
      releaseOriginal = resolve;
    });
    const persist = jest.fn(
      async (request: TrustedActionExecutionRequestV1) => {
        const row = {
          id: request.targetRef,
          tenantId: 'tenant-a',
          actorUserId: USER.userId,
          capability: request.capability,
          identityFingerprint: request.targetRef,
          normalizedInputHash: request.targetRef,
          state: 'SUCCEEDED',
          reconciliationState: 'NOT_REQUIRED',
        };
        h.canonical.set(request.targetRef, row);
        return row as ActionExecution;
      },
    );
    const admit = (targetRef: string) =>
      admitWithInvocationReceipt(
        { ...h.request({ enabled: true }), targetRef },
        persist,
      );
    const original = service.run(invocation, async () => {
      await bothEntered;
      await admit('original-first');
      firstBound();
      await continueOriginal;
      return admit('original-second');
    });
    const concurrent = service.run(invocation, async () => {
      secondEntered();
      await bound;
      return admit('changed-current-target');
    });
    await expect(concurrent).rejects.toBeInstanceOf(ConflictException);
    releaseOriginal();
    await original;
    expect(persist).toHaveBeenCalledTimes(2);
    expect([...h.canonical.keys()]).toEqual([
      'original-first',
      'original-second',
    ]);
  });

  it('rejects concurrent changed input under one identity without a second admission', async () => {
    const h = setup();
    h.definition.timeoutMs = 1000;
    const outcomes = await Promise.allSettled([
      h.run({ enabled: true }),
      h.run({ enabled: false }),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
    expect(h.canonical.size).toBe(1);
    expect(h.state().effects).toBe(1);
  });

  it('rejects a required missing key before storing an invocation or calling a handler', async () => {
    const h = setup();
    await expect(h.run({ enabled: true }, USER, '')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(h.state().ai).toBeNull();
    expect(h.handler.execute).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'NOT_EXECUTED'])(
    'projects canonical %s without rerunning a completed compatibility receipt',
    async (state) => {
      const h = setup();
      await h.run();
      Object.assign(h.canonical.get('canonical-a')!, {
        state,
        finalOutcomeCode: 'canonical_terminal',
      });
      expect(await h.run()).toMatchObject({
        status: 'failed',
        canonical_actions: [{ executionId: 'canonical-a', state }],
      });
      expect(h.handler.execute).toHaveBeenCalledTimes(1);
      expect(h.state().effects).toBe(1);
    },
  );

  it('fails closed on READY resume when the canonical retained payload is unavailable', async () => {
    const h = setup();
    h.handler.execute.mockImplementationOnce(
      async (_name, _principal, args) => {
        await h.ingress.createExecution(h.request(args));
        throw new Error('process stopped after admission');
      },
    );
    expect(await h.run()).toMatchObject({
      status: 'executing',
      canonical_actions: [{ state: 'READY' }],
    });
    h.kernel.readTrustedNormalizedInput = () =>
      Promise.reject(new Error('canonical payload unavailable'));
    h.restart();
    expect(await h.run()).toMatchObject({
      status: 'executing',
      canonical_actions: [{ executionId: 'canonical-a', state: 'READY' }],
    });
    expect(h.state().effects).toBe(0);
    expect(h.canonical.size).toBe(1);
  });

  it('does not invent a historical binding or repeat an unresolved old invocation', async () => {
    const h = setup();
    await h.run();
    h.state().ai!.encryptedResult = Buffer.from(
      JSON.stringify({ old: 'unbound' }),
    ).toString('base64');
    h.state().ai!.status = 'failed';
    h.restart();
    await expect(h.run()).rejects.toBeInstanceOf(ConflictException);
    expect(h.handler.execute).toHaveBeenCalledTimes(1);
    expect(h.state().effects).toBe(1);
  });

  it('fails closed when a persisted receipt is redirected to an absent or cross-tenant execution', async () => {
    const h = setup();
    await h.run();
    h.canonical.get('canonical-a')!.tenantId = 'tenant-b';
    await expect(h.run()).rejects.toBeInstanceOf(ConflictException);
    expect(h.state().effects).toBe(1);
  });
});
