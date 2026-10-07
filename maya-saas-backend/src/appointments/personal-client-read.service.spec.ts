import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PersonalClientReadService } from './personal-client-read.service';

function fixture() {
  const personal = {
    tenantId: 'tenant-a',
    userId: 'owner-a',
    membershipId: 'member-a',
    linkId: 'verified-link-a',
    revalidate: jest.fn().mockResolvedValue(undefined),
  };
  const contexts = { select: jest.fn().mockResolvedValue(personal) };
  const quote = {
    services: [
      {
        id: 'service-a',
        name: 'Стрижка',
        price: 1500,
        currency: 'RUB',
        duration_minutes: 30,
        privateExtra: 'not-for-ui',
      },
    ],
    staff: { id: 'staff-a', name: 'Мастер' },
    start: '2026-10-08T09:00:00.000Z',
    timezone: 'Europe/Moscow',
    source: 'internal',
    previous: null as unknown,
    bookingIdentity: {
      clientName: 'PRIVATE_NAME',
      clientPhone: 'PRIVATE_PHONE',
    },
    link: { id: 'PRIVATE_LINK' },
    key: 'PRIVATE_KEY',
  };
  const creator = {
    quoteForAccount: jest.fn().mockResolvedValue(quote),
    executionResult: jest
      .fn()
      .mockResolvedValue({ state: 'UNKNOWN', safeResult: { private: 'drop' } }),
  };
  const prisma = {
    actionExecution: {
      findMany: jest
        .fn<
          Promise<Array<{ id: string; createdAt: Date }>>,
          [Prisma.ActionExecutionFindManyArgs]
        >()
        .mockResolvedValue([
          { id: 'ae-a', createdAt: new Date('2026-10-07T00:00:00Z') },
        ]),
      findFirst: jest
        .fn<
          Promise<{ id: string } | null>,
          [Prisma.ActionExecutionFindFirstArgs]
        >()
        .mockResolvedValue({ id: 'ae-a' }),
    },
  };
  const tenants = {
    assertLiveBookingEnabled: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PersonalClientReadService(
    contexts as never,
    creator as never,
    prisma as never,
    tenants as never,
  );
  const user = {
    userId: 'owner-a',
    tenantId: 'tenant-a',
    role: 'tenant_owner',
  } as never;
  const dto = {
    staffId: 'staff-a',
    serviceIds: ['service-a'],
    start: quote.start,
  };
  return {
    personal,
    contexts,
    quote,
    creator,
    prisma,
    tenants,
    service,
    user,
    dto,
  };
}

describe('Personal booking read projections', () => {
  it('requires the same live booking admission as create before producing a preview', async () => {
    const f = fixture();
    f.tenants.assertLiveBookingEnabled.mockRejectedValue(
      new ForbiddenException('live_booking_disabled'),
    );
    await expect(
      f.service.preview(f.user, 'personal_client', f.dto),
    ).rejects.toThrow('live_booking_disabled');
    expect(f.creator.quoteForAccount).not.toHaveBeenCalled();
  });
  it('uses the current selected context and projects quote facts without private authority/contact data', async () => {
    const f = fixture();
    const result = await f.service.preview(f.user, 'personal_client', f.dto);
    expect(f.contexts.select).toHaveBeenCalledWith(f.user, 'personal_client');
    expect(f.creator.quoteForAccount).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      f.dto,
      { personalContext: f.personal },
    );
    expect(result).toMatchObject({
      contract: 'maya.personal-booking.preview/1',
      staff: 'Мастер',
      availability: 'available_at_read',
      services: [
        { name: 'Стрижка', price: 1500, currency: 'RUB', durationMinutes: 30 },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE_|verified-link|not-for-ui|owner-a|tenant-a|service-a|staff-a/,
    );
    expect(f.personal.revalidate).toHaveBeenCalledTimes(1);
    expect(f.prisma.actionExecution.findMany).not.toHaveBeenCalled();
  });

  it('preserves missing price/duration and marks an existing request rather than selling the slot again', async () => {
    const f = fixture();
    f.quote.services[0].price = Number.NaN;
    f.quote.services[0].duration_minutes = 0;
    f.quote.previous = { id: 'old' };
    expect(
      await f.service.preview(f.user, 'personal_client', f.dto),
    ).toMatchObject({
      availability: 'existing_request',
      requestState: 'UNKNOWN',
      services: [{ price: null, durationMinutes: null }],
    });
  });

  it('refuses ambiguous or missing display facts and does not substitute opaque IDs', async () => {
    const f = fixture();
    f.quote.services.push(f.quote.services[0]);
    await expect(
      f.service.preview(f.user, 'personal_client', f.dto),
    ).rejects.toThrow();
    f.quote.services.pop();
    f.quote.staff.id = 'another-staff';
    await expect(
      f.service.preview(f.user, 'personal_client', f.dto),
    ).rejects.toThrow();
  });

  it('refuses without context before any quote or result read', async () => {
    const f = fixture();
    f.contexts.select.mockRejectedValue(new ForbiddenException('revoked'));
    await expect(f.service.preview(f.user, undefined, f.dto)).rejects.toThrow(
      'revoked',
    );
    await expect(f.service.results(f.user, 'personal_client')).rejects.toThrow(
      'revoked',
    );
    expect(f.creator.quoteForAccount).not.toHaveBeenCalled();
    expect(f.prisma.actionExecution.findMany).not.toHaveBeenCalled();
  });

  it('selects only exact current tenant/link and immutable actual-account evidence, then uses the canonical result reader', async () => {
    const f = fixture();
    const result = await f.service.results(f.user, 'personal_client');
    const query = f.prisma.actionExecution.findMany.mock.calls[0][0];
    expect(query).toMatchObject({
      take: 21,
      where: {
        tenantId: 'tenant-a',
        sourceRef: 'client-channel-link:verified-link-a',
        capability: 'crm.appointment.create.v1',
        dryRun: false,
        sourceType: 'authenticated_request',
        evidenceRefsJson: {
          array_contains: [
            'personal-context:v1:personal_client',
            'personal-actor-user:v1:owner-a',
            'personal-actor-membership:v1:member-a',
            'client-authority:v1:verified-link-a',
          ],
        },
      },
    });
    expect(query.where).not.toHaveProperty('actorUserId');
    expect(f.creator.executionResult).toHaveBeenCalledWith('tenant-a', 'ae-a');
    expect(result).toEqual({
      contract: 'maya.personal-booking.results/1',
      hasMore: false,
      hasPending: true,
      results: [
        {
          id: 'ae-a',
          recordedAt: '2026-10-07T00:00:00.000Z',
          state: 'UNKNOWN',
        },
      ],
    });
    expect(f.personal.revalidate).toHaveBeenCalledTimes(1);
  });

  it('bounds history but checks pending executions beyond the visible page without dispatch or reconciliation', async () => {
    const f = fixture();
    f.prisma.actionExecution.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({
        id: 'ae-' + i,
        createdAt: new Date(),
      })),
    );
    const result = await f.service.results(f.user, 'personal_client');
    expect(result.results).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(f.creator.executionResult).toHaveBeenCalledTimes(20);
    expect(f.prisma.actionExecution.findFirst.mock.calls[0][0]).toMatchObject({
      where: {
        state: { in: ['PENDING_APPROVAL', 'READY', 'EXECUTING', 'UNKNOWN'] },
      },
    });
  });

  it('discards facts and outcomes after a concurrent link/session/membership revocation', async () => {
    const f = fixture();
    f.personal.revalidate.mockRejectedValue(
      new ForbiddenException('binding_changed'),
    );
    await expect(
      f.service.preview(f.user, 'personal_client', f.dto),
    ).rejects.toThrow('binding_changed');
    await expect(f.service.results(f.user, 'personal_client')).rejects.toThrow(
      'binding_changed',
    );
  });
});
