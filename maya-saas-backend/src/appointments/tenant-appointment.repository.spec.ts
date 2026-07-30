import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantAppointmentRepository } from './tenant-appointment.repository';

interface TestAppointment {
  id: string;
  tenantId: string;
  clientId: string;
  branchId: string | null;
  crmExternalId: string | null;
  staffExternalId: string;
  serviceIds: string[];
  startAt: Date;
  status: string;
  notes: string | null;
  providerPayload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  branch: null;
}

describe('TenantAppointmentRepository isolation', () => {
  const tenantAAppointment: TestAppointment = {
    id: 'appointment-a',
    tenantId: 'tenant-a',
    clientId: 'client-a',
    branchId: null,
    crmExternalId: 'crm-a',
    staffExternalId: 'staff-a',
    serviceIds: ['service-a'],
    startAt: new Date('2026-07-20T10:00:00.000Z'),
    status: 'confirmed',
    notes: null,
    providerPayload: {},
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
    branch: null,
  };
  const tenantBAppointment: TestAppointment = {
    ...tenantAAppointment,
    id: 'appointment-b',
    tenantId: 'tenant-b',
    clientId: 'client-b',
    crmExternalId: 'crm-b',
  };

  const createRepository = () => {
    const records = [tenantAAppointment, tenantBAppointment];
    const appointmentDelegate = {
      findMany: jest.fn(
        (args: {
          where: { tenantId: string; clientId: string };
        }): Promise<TestAppointment[]> =>
          Promise.resolve(
            records.filter(
              (record) =>
                record.tenantId === args.where.tenantId &&
                record.clientId === args.where.clientId,
            ),
          ),
      ),
      findFirst: jest.fn(
        (args: {
          where: { id: string; tenantId: string; clientId: string };
        }): Promise<TestAppointment | null> =>
          Promise.resolve(
            records.find(
              (record) =>
                record.id === args.where.id &&
                record.tenantId === args.where.tenantId &&
                record.clientId === args.where.clientId,
            ) ?? null,
          ),
      ),
      update: jest.fn(
        (args: {
          where: {
            id_tenantId_clientId: {
              id: string;
              tenantId: string;
              clientId: string;
            };
          };
          data: Partial<TestAppointment>;
        }): Promise<TestAppointment> => {
          const key = args.where.id_tenantId_clientId;
          const record = records.find(
            (candidate) =>
              candidate.id === key.id &&
              candidate.tenantId === key.tenantId &&
              candidate.clientId === key.clientId,
          );

          if (!record) {
            return Promise.reject(new Error('Record not found'));
          }

          return Promise.resolve({ ...record, ...args.data });
        },
      ),
      create: jest.fn(
        (args: { data: TestAppointment }): Promise<TestAppointment> =>
          Promise.resolve(args.data),
      ),
    };
    const prisma = {
      appointment: appointmentDelegate,
    } as unknown as PrismaService;
    const context = new TenantContextService();
    const repository = new TenantAppointmentRepository(prisma, context);

    const runAsTenant = <T>(tenantId: string, callback: () => T): T =>
      context.run(`request-${tenantId}`, () => {
        context.setResolvedTenant({
          tenantId,
          userId: `user-${tenantId}`,
          membershipId: `membership-${tenantId}`,
          role: 'client',
          source: 'membership',
        });
        return callback();
      });

    return { repository, appointmentDelegate, runAsTenant };
  };

  it('lists only records from the active tenant and client', async () => {
    const { repository, runAsTenant } = createRepository();

    const appointments = await runAsTenant('tenant-a', () =>
      repository.listForClient('client-a'),
    );

    expect(appointments.map((appointment) => appointment.id)).toEqual([
      'appointment-a',
    ]);
  });

  it('does not reveal a known foreign appointment id', async () => {
    const { repository, runAsTenant } = createRepository();

    const appointment = await runAsTenant('tenant-a', () =>
      repository.findForClient('appointment-b', 'client-b'),
    );

    expect(appointment).toBeNull();
  });

  it('cannot update a known foreign appointment id', async () => {
    const { repository, runAsTenant } = createRepository();

    await expect(
      runAsTenant('tenant-a', () =>
        repository.updateForClient('appointment-b', 'client-b', {
          status: 'canceled',
        }),
      ),
    ).rejects.toThrow('Record not found');
  });

  it('injects tenant id from context when creating a record', async () => {
    const { repository, appointmentDelegate, runAsTenant } = createRepository();

    await runAsTenant('tenant-a', () =>
      repository.createForClient({
        clientId: 'client-a',
        branchId: null,
        crmExternalId: 'crm-new',
        staffExternalId: 'staff-a',
        serviceIds: ['service-a'],
        startAt: new Date('2026-07-21T10:00:00.000Z'),
        status: 'confirmed',
        notes: null,
      }),
    );

    const createArgs = appointmentDelegate.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({ tenantId: 'tenant-a' });
  });

  it('fails closed without TenantContext', () => {
    const { repository } = createRepository();

    expect(() => repository.listForClient('client-a')).toThrow(
      'Tenant context is required',
    );
  });
});
