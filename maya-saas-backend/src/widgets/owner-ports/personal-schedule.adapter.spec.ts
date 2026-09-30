import { PersonalScheduleAdapter } from './personal-schedule.adapter';
const actor = {
  tenantId: 'tenant',
  userId: 'user',
  sessionId: 'session',
  membershipId: 'member',
};
const row = {
  id: 'exact-appointment',
  is_upcoming: true,
  status: 'scheduled',
  service_ids: ['service'],
  staff_external_id: 'staff',
  start_at: new Date(Date.now() + 86400000),
  end_at: new Date(Date.now() + 88200000),
  branch_id: null,
  services: [{ name: 'Service' }],
};
const harness = () => {
  const personal = { revalidate: jest.fn().mockResolvedValue(undefined) };
  const contexts = { select: jest.fn().mockResolvedValue(personal) };
  const owner = { forAccount: jest.fn().mockResolvedValue([row]) };
  const runtime = {
    execute: jest.fn().mockResolvedValue({
      status: 'completed',
      result: {
        slots: [
          {
            start: new Date(Date.now() + 90000000).toISOString(),
            end: new Date(Date.now() + 91800000).toISOString(),
            staff_id: 'staff',
          },
        ],
      },
    }),
  };
  return {
    personal,
    contexts,
    owner,
    runtime,
    adapter: new PersonalScheduleAdapter(
      contexts as never,
      owner as never,
      runtime as never,
    ),
  };
};
describe('BS-1 exact personal schedule source', () => {
  it('BS-IDENTITY requires canonical personal context and exact completed owner id, never a matching time', async () => {
    const h = harness();
    expect(
      await h.adapter.resolve(actor as never, {
        appointments: [{ id: 'foreign', start_at: row.start_at }],
      }),
    ).toBeNull();
    expect(h.runtime.execute).not.toHaveBeenCalled();
    const result = await h.adapter.resolve(actor as never, {
      appointments: [{ id: row.id }],
    });
    expect(result?.appointmentId).toBe(row.id);
    expect(h.contexts.select).toHaveBeenCalledWith(actor, 'personal_client');
    expect(h.owner.forAccount).toHaveBeenCalledWith('tenant', 'user');
    expect(h.runtime.execute).toHaveBeenCalledWith(
      actor,
      'booking.availability.read',
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        arguments: expect.objectContaining({
          service_ids: ['service'],
          staff_id: 'staff',
        }),
      }),
      { suppressWidgetTrigger: true },
    );
    await result!.revalidate();
    expect(h.personal.revalidate).toHaveBeenCalledTimes(2);
  });
  it('BS-REVOKED absence/revocation of verified personal binding refuses before reading appointments', async () => {
    const h = harness();
    h.contexts.select.mockRejectedValue(
      new Error('new_verified_maya_user_binding_required'),
    );
    await expect(
      h.adapter.resolve(actor as never, { appointments: [{ id: row.id }] }),
    ).rejects.toThrow('new_verified');
    expect(h.owner.forAccount).not.toHaveBeenCalled();
  });
  it('BS-CHANGED binding replacement or changed exact appointment is revalidated before mint', async () => {
    const h = harness();
    const source = await h.adapter.resolve(actor as never, {
      appointments: [{ id: row.id }],
    });
    h.owner.forAccount.mockResolvedValue([{ ...row, id: 'other' }]);
    await expect(source!.revalidate()).rejects.toThrow(
      'personal_appointment_changed',
    );
    h.personal.revalidate.mockRejectedValue(
      new Error('personal_client_context_changed'),
    );
    await expect(source!.revalidate()).rejects.toThrow(
      'personal_client_context_changed',
    );
  });
  it('BS-AVAILABILITY only an available exact-staff future slot can become a reschedule target', async () => {
    const h = harness();
    h.runtime.execute.mockResolvedValue({
      status: 'completed',
      result: {
        slots: [
          {
            start: row.start_at.toISOString(),
            end: row.end_at.toISOString(),
            staff_id: 'staff',
          },
          {
            start: new Date(Date.now() - 10000).toISOString(),
            end: row.end_at.toISOString(),
            staff_id: 'staff',
          },
          {
            start: new Date(Date.now() + 90000000).toISOString(),
            end: row.end_at.toISOString(),
            staff_id: 'other',
          },
        ],
      },
    });
    const source = await h.adapter.resolve(actor as never, {
      appointments: [{ id: row.id }],
    });
    expect(source?.rescheduleStart).toBeNull();
    expect(source?.appointmentId).toBe(row.id);
  });
});
