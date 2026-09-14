import {
  Prisma,
  type ActionExecution,
  type PrismaClient,
} from '@prisma/client';
import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  type TrustedActionExecutionRequestV1,
} from './action-engine.contract';
import { ActionEngineKernel } from './action-engine.kernel';
import {
  CLIENT_BOOKING_IDEMPOTENCY_SCOPE,
  CLIENT_BOOKING_INTENT_CONTRACT,
} from './client-booking-intent.contract';

// Ordinary regression for the accepted alias contract. Real concurrency and
// transaction rollback are additionally proved by the owned PostgreSQL probes.
function setup() {
  type Binding = {
    tenantId: string;
    clientId: string;
    actionExecutionId: string;
    idempotencyScope: string;
    requestIdempotencyKeyHash: string;
  };
  let executions: ActionExecution[] = [];
  let bindings: Binding[] = [];
  const matches = (row: object, where: Record<string, unknown>) =>
    Object.entries(Object.values(where)[0] as object).every(
      ([key, value]) => (row as Record<string, unknown>)[key] === value,
    );
  const tx = {
    actionExecution: {
      findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(executions.find((row) => matches(row, where)) ?? null),
      ),
      create: jest.fn(({ data }: { data: ActionExecution }) => {
        const row = { ...data };
        executions.push(row);
        return Promise.resolve(row);
      }),
    },
    actionExecutionIdempotencyBinding: {
      findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const binding = bindings.find((row) => matches(row, where));
        return Promise.resolve(
          binding
            ? {
                ...binding,
                execution: executions.find(
                  (row) => row.id === binding.actionExecutionId,
                )!,
              }
            : null,
        );
      }),
      create: jest.fn(({ data }: { data: Binding }) => {
        bindings.push({ ...data });
        return Promise.resolve(data);
      }),
    },
  };
  const db = {
    ...tx,
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
      const oldExecutions = [...executions];
      const oldBindings = [...bindings];
      try {
        return await fn(tx);
      } catch (error) {
        executions = oldExecutions;
        bindings = oldBindings;
        throw error;
      }
    },
  };
  const kernel = new ActionEngineKernel(db as unknown as PrismaClient, {
    identitySecret: 'b31-unit-identity'.repeat(4),
    payloadEncryptionSecret: 'b31-unit-payload'.repeat(4),
    controlledFixtureMode: true,
  });
  const request = (
    key: string,
    changes: Record<string, unknown> = {},
  ): TrustedActionExecutionRequestV1 => ({
    contract: ACTION_EXECUTION_REQUEST_CONTRACT,
    tenantId: 'tenant-a',
    capability: 'crm.appointment.create.v1',
    source: {
      type: 'authenticated_request',
      sourceRef: 'verified-link-a',
      occurrenceScope: 'appointment-mutation:crm.appointment.create.v1:v1',
    },
    targetRef: 'create/test',
    evidenceRefs: [],
    callerIdempotency: { scope: CLIENT_BOOKING_IDEMPOTENCY_SCOPE, key },
    bookingIntent: {
      contract: CLIENT_BOOKING_INTENT_CONTRACT,
      calendarTarget: { source: 'internal', provider: null, companyId: null },
      timezone: 'Europe/Moscow',
    },
    input: {
      clientId: 'client-a',
      clientName: 'Canonical Client',
      clientPhone: '+79990001122',
      staffId: 'staff-a',
      serviceIds: ['service-a'],
      start: '2099-09-20T10:00:00Z',
      creationMode: 'client',
      allowBusy: false,
      notifyBySmsHours: 0,
      ...changes,
    },
  });
  const create = (key: string, changes?: Record<string, unknown>) =>
    kernel.createExecutionForControlledFixture(request(key, changes));
  return {
    kernel,
    tx,
    request,
    create,
    executions: () => executions,
    bindings: () => bindings,
    clearBindings: () => {
      bindings = [];
    },
  };
}

describe('B31 canonical kernel immutable caller aliases', () => {
  it('binds a secondary accepted key to the existing intent and rejects its later payload change', async () => {
    const h = setup();
    const first = await h.create('K1');
    expect((await h.create('K2')).id).toBe(first.id);
    expect(h.bindings()).toHaveLength(2);
    await expect(
      h.create('K2', { start: '2099-09-20T12:00:00Z' }),
    ).rejects.toMatchObject({ code: 'ACTION_IDEMPOTENCY_CONFLICT' });
    expect(h.executions()).toHaveLength(1);
    expect(h.bindings()).toHaveLength(2);
    expect(h.tx.actionExecution.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { clientId: 'client-b' },
    { staffId: 'staff-b' },
    { serviceIds: ['service-b'] },
    { durationMinutes: 30 },
    { notes: 'changed' },
  ])(
    'rejects changed canonical terms without another execution: %j',
    async (change) => {
      const h = setup();
      await h.create('key');
      await expect(h.create('key', change)).rejects.toMatchObject({
        code: 'ACTION_IDEMPOTENCY_CONFLICT',
      });
      expect(h.executions()).toHaveLength(1);
      expect(h.bindings()).toHaveLength(1);
    },
  );

  it.each(['UNKNOWN', 'SUCCEEDED'] as const)(
    'replays the same %s execution; changed intent cannot bypass its state',
    async (state) => {
      const h = setup();
      const original = await h.create('key');
      original.state = state;
      expect((await h.create('key')).id).toBe(original.id);
      expect((await h.create('alias')).state).toBe(state);
      await expect(
        h.create('alias', { start: '2099-10-01T10:00:00Z' }),
      ).rejects.toMatchObject({ code: 'ACTION_IDEMPOTENCY_CONFLICT' });
      expect(h.executions()).toHaveLength(1);
    },
  );

  it('refuses historical conversion and requires the shared binding context', async () => {
    const h = setup();
    const legacy = await h.create('old');
    Object.assign(legacy, {
      bookingIntentContract: null,
      bookingIntentHash: null,
      bookingIntentEncrypted: null,
    });
    h.clearBindings();
    await expect(h.create('old')).rejects.toMatchObject({
      code: 'ACTION_IDEMPOTENCY_CONFLICT',
    });
    await expect(h.create('new')).rejects.toMatchObject({
      code: 'ACTION_IDEMPOTENCY_CONFLICT',
    });
    expect(h.bindings()).toHaveLength(0);
    expect(legacy.bookingIntentHash).toBeNull();
    const request = h.request('fresh');
    delete request.bookingIntent;
    expect(() => h.kernel.createExecutionForControlledFixture(request)).toThrow(
      'cannot omit',
    );
  });

  it('rolls back a provisional execution when binding persistence fails', async () => {
    const h = setup();
    h.tx.actionExecutionIdempotencyBinding.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('synthetic FK conflict', {
        code: 'P2003',
        clientVersion: 'fixture',
      }),
    );
    await expect(h.create('key')).rejects.toThrow('synthetic FK conflict');
    expect(h.executions()).toHaveLength(0);
    expect(h.bindings()).toHaveLength(0);
  });
});
