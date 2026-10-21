import { ActionExecutionState } from '@prisma/client';
import { ActionEngineRuntimeService } from './action-engine.runtime';
import { normalizeStaffCreateInput } from './staff-create.contract';
import { staffCreatePrepared } from '../crm/yclients-staff-create.contract';
import type { TrustedActionExecutionRequestV1 } from './action-engine.contract';

const input = {
  name: 'Synthetic staff',
  specialization: 'Synthetic role',
  company_id: '123',
  integration_revision: 'a'.repeat(64),
  permission_revision: 'b'.repeat(64),
  origin: 'YC-ST1-CHAT-1',
  approval_id: 'approval-1',
};
const request = (): TrustedActionExecutionRequestV1 => ({
  contract: 'maya.action-execution-request/1',
  tenantId: 'tenant-1',
  capability: 'crm.staff.quick-create.v1',
  source: {
    type: 'authenticated_request',
    occurrenceScope: 'YC-ST1-CHAT-1',
    sourceRef: 'approval-1',
    actorUserId: 'owner-1',
  },
  targetRef: 'synthetic-proposal',
  input,
  evidenceRefs: [],
});
function setup() {
  const execution = {
    id: 'execution-1',
    tenantId: 'tenant-1',
    capability: 'crm.staff.quick-create.v1',
    sourceRef: 'approval-1',
    actorUserId: 'owner-1',
    approvalRequirement: 'REQUIRED',
    state: ActionExecutionState.PENDING_APPROVAL,
  };
  const ingress = { createExecution: jest.fn().mockResolvedValue(execution) };
  const kernel = {
    decideApproval: jest
      .fn()
      .mockResolvedValue({ ...execution, state: 'READY' }),
  };
  const authorize = jest.fn().mockResolvedValue(undefined);
  return {
    execution,
    ingress,
    kernel,
    authorize,
    runtime: new ActionEngineRuntimeService(kernel as never, ingress as never),
  };
}
describe('finite staff approval uses canonical runtime, never CRM kernel access', () => {
  it('rereads owner approval before canonical ingress and again before REQUIRED decision', async () => {
    const f = setup();
    await expect(
      f.runtime.approveStaffCreateFromOwner(request(), f.authorize),
    ).resolves.toMatchObject({ state: 'READY' });
    expect(f.authorize).toHaveBeenCalledTimes(2);
    expect(f.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      f.ingress.createExecution.mock.invocationCallOrder[0],
    );
    expect(f.authorize.mock.invocationCallOrder[1]).toBeLessThan(
      f.kernel.decideApproval.mock.invocationCallOrder[0],
    );
    expect(f.kernel.decideApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      executionId: 'execution-1',
      approverUserId: 'owner-1',
      decision: 'APPROVED',
    });
  });
  it.each(['first', 'second'])(
    'refuses authority loss on %s reread without approval',
    async (phase) => {
      const f = setup();
      if (phase === 'second') f.authorize.mockResolvedValueOnce(undefined);
      f.authorize.mockRejectedValueOnce(new Error('revoked'));
      await expect(
        f.runtime.approveStaffCreateFromOwner(request(), f.authorize),
      ).rejects.toThrow('revoked');
      expect(f.kernel.decideApproval).not.toHaveBeenCalled();
    },
  );
  it.each(['capability', 'sourceRef', 'actor', 'origin'])(
    'refuses substituted request %s before ingress',
    async (field) => {
      const f = setup(),
        r = request();
      if (field === 'capability') r.capability = 'crm.appointment.create.v1';
      if (field === 'sourceRef') r.source = { ...r.source, sourceRef: 'other' };
      if (field === 'actor') r.source = { ...r.source, actorUserId: undefined };
      if (field === 'origin')
        r.source = { ...r.source, occurrenceScope: 'other' };
      await expect(
        f.runtime.approveStaffCreateFromOwner(r, f.authorize),
      ).rejects.toThrow();
      expect(f.ingress.createExecution).not.toHaveBeenCalled();
      expect(f.kernel.decideApproval).not.toHaveBeenCalled();
    },
  );
  it.each([
    'tenantId',
    'capability',
    'sourceRef',
    'actorUserId',
    'approvalRequirement',
  ])('refuses substituted execution %s', async (key) => {
    const f = setup();
    f.ingress.createExecution.mockResolvedValue({
      ...f.execution,
      [key]: 'other',
    });
    await expect(
      f.runtime.approveStaffCreateFromOwner(request(), f.authorize),
    ).rejects.toThrow('binding');
    expect(f.kernel.decideApproval).not.toHaveBeenCalled();
  });
  it.each(['READY', 'SUCCEEDED', 'UNKNOWN', 'FAILED', 'NOT_EXECUTED'])(
    'does not reapprove %s',
    async (state) => {
      const f = setup();
      f.ingress.createExecution.mockResolvedValue({ ...f.execution, state });
      await expect(
        f.runtime.approveStaffCreateFromOwner(request(), f.authorize),
      ).resolves.toMatchObject({ state });
      expect(f.kernel.decideApproval).not.toHaveBeenCalled();
    },
  );
  it('does not absorb stale approval CAS or expiry refusals', async () => {
    const f = setup();
    f.kernel.decideApproval.mockRejectedValue(
      new Error('APPROVAL_NOT_PENDING'),
    );
    await expect(
      f.runtime.approveStaffCreateFromOwner(request(), f.authorize),
    ).rejects.toThrow('APPROVAL_NOT_PENDING');
  });
});
describe('AE independently validates the same finite provider proposal', () => {
  it('preserves exact accepted input including numeric company normalization', () => {
    for (const company_id of ['123', 123]) {
      const { approval_id, ...proposal } = { ...input, company_id };
      expect(normalizeStaffCreateInput({ ...proposal, approval_id })).toEqual({
        ...staffCreatePrepared(proposal),
        approval_id,
      });
    }
  });
  it.each([
    { name: '' },
    { name: ' padded ' },
    { specialization: 'x\ny' },
    { name: 'x'.repeat(241) },
    { name: 'x\u202ey' },
    { company_id: 0 },
    { company_id: {} },
    { integration_revision: 'short' },
    { permission_revision: 'g'.repeat(64) },
    { origin: 'OTHER' },
    { phone_number: null },
    { position_id: null },
    { user_id: 'other' },
    { url: 'https://invalid.test' },
  ])('refuses changed provider contract %j', (change) => {
    const { approval_id, ...proposal } = { ...input, ...change };
    expect(() => staffCreatePrepared(proposal)).toThrow();
    expect(() =>
      normalizeStaffCreateInput({ ...proposal, approval_id }),
    ).toThrow();
  });
  it.each(['', 'invalid/id', null])('refuses approval id %j', (approval_id) => {
    expect(() =>
      normalizeStaffCreateInput({ ...input, approval_id }),
    ).toThrow();
  });
});
