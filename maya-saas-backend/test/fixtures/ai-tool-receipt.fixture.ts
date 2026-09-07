// Async Prisma mocks retain Promise-shaped interfaces; unsafe values are limited to fixture storage.
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { AiToolReceiptService } from '../../src/ai-tools/ai-tool-receipt.service';
import { admitWithInvocationReceipt } from '../../src/action-engine/action-invocation-receipt.context';

/** Compatibility adapter for pre-existing money/presentation unit fixtures
 * whose domain owner is already mocked. The actual durable boundary is tested
 * separately against Action Engine and PostgreSQL. Never used by production. */
export function canonicalReceiptFixture(
  db: any,
  encryption: any,
): AiToolReceiptService {
  const invocations = new Map<string, any>();
  const actions = new Map<string, any>();
  const running = new Map<string, Promise<unknown>>();
  const originalFind = db.aiToolExecution.findUnique.bind(db.aiToolExecution);
  const originalCreate = db.aiToolExecution.create.bind(db.aiToolExecution);
  const originalUpdate = db.aiToolExecution.update.bind(db.aiToolExecution);
  const originalTransaction = db.$transaction.bind(db);
  db.aiToolExecution.findUnique = async (input: any) => {
    const key = input.where.tenantId_idempotencyKey;
    if (key) {
      const cached = [...invocations.values()].find(
        (row) =>
          row.tenantId === key.tenantId &&
          row.idempotencyKey === key.idempotencyKey,
      );
      if (cached) return { ...cached };
    }
    return originalFind(input);
  };
  db.aiToolExecution.create = async (input: any) => {
    const result = await originalCreate(input);
    const row = { ...input.data, ...result };
    invocations.set(row.id, row);
    return row;
  };
  db.aiToolExecution.update = async (input: any) => {
    const result = await originalUpdate(input);
    const row = invocations.get(input.where.id);
    if (row) Object.assign(row, input.data);
    return row ?? result;
  };
  db.$transaction = (input: any) =>
    typeof input === 'function' ? input(db) : originalTransaction(input);
  const query = db.$queryRaw?.bind(db);
  db.$queryRaw = (input: any) =>
    input.strings?.join('').includes('"AiToolExecution"')
      ? Promise.resolve([])
      : query
        ? query(input)
        : Promise.resolve([]);
  db.actionExecution = {
    ...db.actionExecution,
    findUnique: async ({ where }: any) => {
      const row = actions.get(where.id_tenantId.id);
      return row?.tenantId === where.id_tenantId.tenantId ? { ...row } : null;
    },
  };
  const service = new AiToolReceiptService(db, encryption);
  const realRun = service.run.bind(service);
  service.run = (invocation, work) =>
    realRun(invocation, async (args) => {
      const id = `canonical-fixture:${invocation.id}`;
      const admitted = await admitWithInvocationReceipt(
        {
          contract: 'maya.action-execution-request/1',
          tenantId: invocation.principal.tenantId,
          capability: 'fixture.mocked-existing-owner',
          source: {
            type: 'authenticated_request',
            sourceRef: invocation.toolName,
            actorUserId: invocation.principal.userId,
            occurrenceScope: invocation.id,
          },
          targetRef: invocation.id,
          input: {},
          evidenceRefs: [],
        },
        () => {
          if (!actions.has(id))
            actions.set(id, {
              id,
              tenantId: invocation.principal.tenantId,
              actorUserId: invocation.principal.userId,
              capability: 'fixture.mocked-existing-owner',
              identityFingerprint: id,
              normalizedInputHash: invocation.inputHash,
              state: 'EXECUTING',
              reconciliationState: 'NOT_REQUIRED',
              safeResultSummaryJson: null,
            });
          return Promise.resolve(actions.get(id));
        },
      );
      if (admitted.state === 'SUCCEEDED') return admitted.safeResultSummaryJson;
      if (running.has(id)) return running.get(id);
      const operation = work(args).then(
        (value) => {
          Object.assign(actions.get(id), {
            state: 'SUCCEEDED',
            safeResultSummaryJson: value,
          });
          return value;
        },
        (error: unknown) => {
          Object.assign(actions.get(id), {
            state: 'FAILED',
            finalOutcomeCode: 'fixture_owner_failed',
          });
          throw error;
        },
      );
      running.set(id, operation);
      return operation;
    });
  return service;
}
