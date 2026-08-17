import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import type { PrismaService } from '../prisma/prisma.service';
import { BridgeSourceService } from './bridge-source.service';

/**
 * 🔴 CYCLE 03 B0 — разрешение «источник → арендатор» на мостах приёма.
 *
 * Мост старого бота слал зашитый в его окружении слаг `muzhskaya-estetika`,
 * а арендатор называется `muzhskaya-estetika-3`. Каждый вызов получал 403: за
 * неделю 37 отказов, и в Maya OS не попало ни одной карточки о записи.
 *
 * Чинится ПРИЧИНА, а не симптом: идентичность арендатора не может держаться на
 * имени, которое владелец вправе поменять.
 */

type IntegrationRow = {
  tenantId: string;
  settingsJson: unknown;
  tenant: { slug: string; status: string };
};

type Finders = {
  integrations?: IntegrationRow[];
  tenantBySlug?: { id: string; slug: string } | null;
};

const buildService = (finders: Finders) => {
  const crmIntegrationFindMany: jest.MockedFunction<
    (args: unknown) => Promise<IntegrationRow[]>
  > = jest.fn().mockResolvedValue(finders.integrations ?? []);
  const tenantFindFirst: jest.MockedFunction<
    (args: unknown) => Promise<{ id: string; slug: string } | null>
  > = jest.fn().mockResolvedValue(finders.tenantBySlug ?? null);

  const prisma = {
    crmIntegration: { findMany: crmIntegrationFindMany },
    tenant: { findFirst: tenantFindFirst },
  } as unknown as PrismaService;

  return {
    service: new BridgeSourceService(prisma),
    crmIntegrationFindMany,
    tenantFindFirst,
  };
};

const salonIntegration = (
  companyId: unknown,
  status = 'trial',
): IntegrationRow => ({
  tenantId: 'tenant-salon',
  settingsJson: { companyId, tipsCompanyId: companyId },
  tenant: { slug: 'muzhskaya-estetika-3', status },
});

describe('разрешение арендатора на мосту приёма', () => {
  it('🔴 расхождение слага больше не рвёт приём: решает интеграция', async () => {
    const { service, tenantFindFirst } = buildService({
      integrations: [salonIntegration(503759)],
    });

    const resolved = await service.resolveTenant(
      {
        provider: 'yclients',
        externalCompanyId: '503759',
        // Ровно тот слаг, на котором приём ломался в бою.
        tenantSlug: 'muzhskaya-estetika',
      },
      'inbox_tenant_not_found',
    );

    expect(resolved).toEqual({
      tenantId: 'tenant-salon',
      slug: 'muzhskaya-estetika-3',
      resolvedBy: 'integration',
    });
    // К слагу даже не обращались: он больше не источник истины.
    expect(tenantFindFirst).not.toHaveBeenCalled();
  });

  it('идентификатор компании сравнивается и как число, и как строка', async () => {
    const { service } = buildService({
      integrations: [salonIntegration('503759')],
    });

    await expect(
      service.resolveTenant(
        { provider: 'YClients', externalCompanyId: 503759 },
        'inbox_tenant_not_found',
      ),
    ).resolves.toMatchObject({ resolvedBy: 'integration' });
  });

  it('слаг остаётся совместимостью для источников без интеграции', async () => {
    const { service } = buildService({
      tenantBySlug: { id: 'tenant-salon', slug: 'muzhskaya-estetika-3' },
    });

    await expect(
      service.resolveTenant(
        { tenantSlug: 'muzhskaya-estetika-3' },
        'inbox_tenant_not_found',
      ),
    ).resolves.toMatchObject({ resolvedBy: 'slug_compatibility' });
  });

  it('🔴 неоднозначность не разрешается «первым попавшимся»', async () => {
    // Две интеграции на одну компанию провайдера — это состояние, при котором
    // доставить можно не тому салону. Отказ честнее догадки.
    const { service } = buildService({
      integrations: [
        salonIntegration(503759),
        { ...salonIntegration(503759), tenantId: 'tenant-other' },
      ],
    });

    await expect(
      service.resolveTenant(
        { provider: 'yclients', externalCompanyId: '503759' },
        'inbox_tenant_not_found',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('приостановленный арендатор не принимает мост', async () => {
    const { service } = buildService({
      integrations: [salonIntegration(503759, 'suspended')],
    });

    await expect(
      service.resolveTenant(
        { provider: 'yclients', externalCompanyId: '503759' },
        'inbox_tenant_not_found',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('🔴 единственного арендатора молча не подставляем', async () => {
    // Соблазн «в базе один салон — значит он и есть» ломается на втором
    // арендаторе, и ломается доставкой чужих данных.
    const { service } = buildService({
      integrations: [salonIntegration(503759)],
    });

    await expect(
      service.resolveTenant(
        { provider: 'yclients', externalCompanyId: '999999' },
        'inbox_tenant_not_found',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('секрет моста', () => {
  const secret = 'bridge-secret-at-least-24-characters-long';
  const { service } = buildService({});
  const codes = { disabled: 'x_disabled', unauthorized: 'x_unauthorized' };

  afterEach(() => {
    delete process.env.MAYA_TEST_BRIDGE_TOKEN;
  });

  it('мост без секрета выключен, а не открыт', () => {
    expect(() =>
      service.assertBridgeSecret(secret, 'MAYA_TEST_BRIDGE_TOKEN', codes),
    ).toThrow(UnauthorizedException);
  });

  it('верный секрет принимается', () => {
    process.env.MAYA_TEST_BRIDGE_TOKEN = secret;
    expect(() =>
      service.assertBridgeSecret(secret, 'MAYA_TEST_BRIDGE_TOKEN', codes),
    ).not.toThrow();
  });

  it('🔴 неверный секрет другой ДЛИНЫ отвергается, а не падает', () => {
    // Из-за этого сравнение идёт по свёрткам: `timingSafeEqual` на голых
    // строках требует равной длины и бросил бы исключение вместо отказа.
    process.env.MAYA_TEST_BRIDGE_TOKEN = secret;
    expect(() =>
      service.assertBridgeSecret('short', 'MAYA_TEST_BRIDGE_TOKEN', codes),
    ).toThrow(UnauthorizedException);
  });
});
