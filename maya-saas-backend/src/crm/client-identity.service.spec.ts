import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientIdentityService } from './client-identity.service';

type ClientCreateArgs = {
  data: {
    tenantId: string;
    userId: string | null;
    phoneHash: string | null;
    mergedIntoClientId?: unknown;
  };
};
type ClientUpdateManyArgs = { where: { id: string; tenantId: string } };
type LinkUpdateArgs = { data: { unlinkedAt: Date | null } };
type LinkRow = { clientId: string; unlinkedAt: Date | null } | null;

describe('ClientIdentityService', () => {
  const createService = (
    overrides: {
      linkFindUnique?: jest.MockedFunction<() => Promise<LinkRow>>;
      secret?: string;
    } = {},
  ) => {
    const linkFindUnique: jest.MockedFunction<() => Promise<LinkRow>> =
      overrides.linkFindUnique ?? jest.fn();
    const linkUpdate: jest.MockedFunction<
      (args: LinkUpdateArgs) => Promise<unknown>
    > = jest.fn().mockResolvedValue({});
    const clientCreate: jest.MockedFunction<
      (args: ClientCreateArgs) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'client-1' });
    const clientUpdateMany: jest.MockedFunction<
      (args: ClientUpdateManyArgs) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      crmClientLink: { findUnique: linkFindUnique, update: linkUpdate },
      client: { create: clientCreate, updateMany: clientUpdateMany },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();
    const service = new ClientIdentityService(prisma, tenantContext, {
      get: jest
        .fn()
        .mockReturnValue(
          overrides.secret ?? 'client-identity-secret-value-long-enough',
        ),
    } as unknown as ConfigService);

    return {
      service,
      tenantContext,
      linkFindUnique,
      linkUpdate,
      clientCreate,
      clientUpdateMany,
    };
  };

  const register = (
    service: ClientIdentityService,
    tenantContext: TenantContextService,
    params: Parameters<ClientIdentityService['registerCrmClient']>[0],
  ) =>
    tenantContext.runAsSystemTenant(params.tenantId, () =>
      service.registerCrmClient(params),
    );

  it('creates an identity for a card that was never seen before', async () => {
    const { service, tenantContext, clientCreate } = createService({
      linkFindUnique: jest.fn().mockResolvedValue(null),
    });

    const result = await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '777',
      phone: '+7 (999) 000-00-00',
    });

    expect(result).toEqual({ clientId: 'client-1' });
    const createArgs = clientCreate.mock.calls[0]?.[0];
    expect(createArgs?.data.tenantId).toBe('tenant-1');
    // Хеш, а не номер: сам телефон в таблицу не попадает никогда.
    expect(createArgs?.data.phoneHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(createArgs)).not.toContain('9990000000');
  });

  it('is idempotent: the same card returns the same identity', async () => {
    const { service, tenantContext, clientCreate, linkUpdate } = createService({
      linkFindUnique: jest
        .fn()
        .mockResolvedValue({ clientId: 'client-42', unlinkedAt: null }),
    });

    const first = await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '777',
    });
    const second = await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '777',
    });

    expect(first).toEqual({ clientId: 'client-42' });
    expect(second).toEqual({ clientId: 'client-42' });
    // Ни одной новой личности: повтор — это воспроизведение, а не событие.
    expect(clientCreate).not.toHaveBeenCalled();
    expect(linkUpdate).toHaveBeenCalledTimes(2);
  });

  it('revives a card that had been marked as gone', async () => {
    // Переподключение той же CRM обязано вернуть ТУ ЖЕ личность.
    const { service, tenantContext, linkUpdate } = createService({
      linkFindUnique: jest
        .fn()
        .mockResolvedValue({ clientId: 'client-42', unlinkedAt: new Date() }),
    });

    await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '777',
    });

    const updateArgs = linkUpdate.mock.calls[0]?.[0];
    expect(updateArgs?.data.unlinkedAt).toBeNull();
  });

  it('keeps the identity when the phone changes', async () => {
    // 🔴 Ровно ради этого случая якорь и заводится: сегодня смена номера
    // порождает нового субъекта атрибуции и рвёт историю.
    const { service, tenantContext, clientUpdateMany, clientCreate } =
      createService({
        linkFindUnique: jest
          .fn()
          .mockResolvedValue({ clientId: 'client-42', unlinkedAt: null }),
      });

    await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '777',
      phone: '+79995550000',
    });

    expect(clientCreate).not.toHaveBeenCalled();
    const updateArgs = clientUpdateMany.mock.calls[0]?.[0];
    expect(updateArgs?.where).toEqual({
      id: 'client-42',
      tenantId: 'tenant-1',
    });
  });

  it('never attaches a new card to an existing client by phone alone', async () => {
    // Один номер на семью — обычное дело. Автоматическое склеивание по нему
    // необратимо объединило бы разных людей.
    const { service, tenantContext, clientCreate } = createService({
      linkFindUnique: jest.fn().mockResolvedValue(null),
    });

    await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '888',
      phone: '+79995550000',
    });

    // Новая карточка — новая личность, без поиска кандидатов по хешу.
    expect(clientCreate).toHaveBeenCalledTimes(1);
    const createArgs = clientCreate.mock.calls[0]?.[0];
    expect(createArgs?.data.mergedIntoClientId).toBeUndefined();
  });

  it('identifies a card that has no phone at all', async () => {
    // Отсутствие телефона не запрещает личность: её опознаёт внешний id.
    const { service, tenantContext, clientCreate } = createService({
      linkFindUnique: jest.fn().mockResolvedValue(null),
    });

    const result = await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '999',
      phone: null,
    });

    expect(result).toEqual({ clientId: 'client-1' });
    const createArgs = clientCreate.mock.calls[0]?.[0];
    expect(createArgs?.data.phoneHash).toBeNull();
  });

  it('refuses a foreign tenant before touching the database', async () => {
    const { service, tenantContext, linkFindUnique } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.registerCrmClient({
          tenantId: 'tenant-b',
          provider: 'yclients',
          externalId: '777',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(linkFindUnique).not.toHaveBeenCalled();
  });

  it('fails closed without tenant context', async () => {
    const { service, linkFindUnique } = createService();

    await expect(
      service.registerCrmClient({
        tenantId: 'tenant-1',
        provider: 'yclients',
        externalId: '777',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(linkFindUnique).not.toHaveBeenCalled();
  });

  it('ignores a card without provider or external id', async () => {
    const { service, tenantContext, linkFindUnique } = createService();

    await expect(
      register(service, tenantContext, {
        tenantId: 'tenant-1',
        provider: '  ',
        externalId: '777',
      }),
    ).resolves.toBeNull();
    expect(linkFindUnique).not.toHaveBeenCalled();
  });

  it('never lets a shadow write break the caller', async () => {
    const { service, tenantContext } = createService({
      linkFindUnique: jest
        .fn()
        .mockRejectedValue(new Error('database is gone')),
    });

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.tryRegisterCrmClient({
          tenantId: 'tenant-1',
          provider: 'yclients',
          externalId: '777',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('produces no hash when the secret is absent', async () => {
    const { service, tenantContext, clientCreate } = createService({
      linkFindUnique: jest.fn().mockResolvedValue(null),
      secret: '',
    });

    await register(service, tenantContext, {
      tenantId: 'tenant-1',
      provider: 'yclients',
      externalId: '777',
      phone: '+79995550000',
    });

    const createArgs = clientCreate.mock.calls[0]?.[0];
    expect(createArgs?.data.phoneHash).toBeNull();
  });
});
