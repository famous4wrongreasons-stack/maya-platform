import { NotFoundException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BusinessContentService } from './business-content.service';

describe('BusinessContentService', () => {
  const now = new Date('2026-08-14T10:00:00.000Z');

  function setup() {
    const prisma = {
      tenantCatalogItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      referralProgram: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      businessReview: {
        findMany: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const tenantContext = {
      assertTenantId: jest.fn((tenantId: string) => tenantId),
    };
    const encryption = {
      encrypt: jest.fn((value: string) => `encrypted:${value.length}`),
    };
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new BusinessContentService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      encryption as unknown as EncryptionService,
      auditLog as unknown as AuditLogService,
    );
    return { service, prisma, encryption, auditLog };
  }

  it('keeps inventory reads tenant-scoped and identifies low stock', async () => {
    const { service, prisma } = setup();
    prisma.tenantCatalogItem.findMany.mockResolvedValue([
      {
        id: 'item-low',
        tenantId: 'tenant-a',
        kind: 'inventory',
        name: 'Воск',
        description: null,
        priceKopecks: 150_000,
        currency: 'RUB',
        quantity: 2,
        lowStockThreshold: 3,
        active: true,
        source: 'manual',
        externalRef: null,
        metadataJson: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'item-ok',
        tenantId: 'tenant-a',
        kind: 'inventory',
        name: 'Шампунь',
        description: null,
        priceKopecks: 200_000,
        currency: 'RUB',
        quantity: 8,
        lowStockThreshold: 3,
        active: true,
        source: 'manual',
        externalRef: null,
        metadataJson: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await service.listCatalog('tenant-a', 'inventory', {
      lowStockOnly: true,
    });

    expect(prisma.tenantCatalogItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a', kind: 'inventory', active: true },
      }),
    );
    expect(result).toMatchObject({
      configured: true,
      count: 1,
      items: [{ id: 'item-low', low_stock: true, quantity: 2 }],
    });
  });

  it('encrypts review text and never returns it to the AI-facing result', async () => {
    const { service, prisma, encryption, auditLog } = setup();
    prisma.businessReview.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'review-a',
          ...data,
          createdAt: now,
          updatedAt: now,
        }),
    );

    const result = await service.ingestReview('tenant-a', 'owner-a', {
      source: 'Yandex',
      rating: 2,
      occurredAt: '2026-08-14T09:00:00.000Z',
      text: 'Долго ждал, но мастер вежливый',
    });

    expect(encryption.encrypt).toHaveBeenCalledWith(
      'Долго ждал, но мастер вежливый',
    );
    const createCalls = prisma.businessReview.create.mock
      .calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const createInput = createCalls[0]?.[0];
    expect(createInput).toBeDefined();
    if (!createInput) throw new Error('Expected review create input');
    const createData = createInput.data;
    expect(createData.tenantId).toBe('tenant-a');
    expect(createData.source).toBe('yandex');
    expect(createData.encryptedText).toEqual(
      expect.stringMatching(/^encrypted:/),
    );
    expect(createData.topicTagsJson).toEqual(
      expect.arrayContaining(['staff', 'wait']),
    );
    expect(result).toMatchObject({
      id: 'review-a',
      rating: 2,
      has_private_text: true,
    });
    expect(result.topics).toEqual(expect.arrayContaining(['staff', 'wait']));
    expect(JSON.stringify(result)).not.toContain('Долго ждал');
    expect(JSON.stringify(result)).not.toContain('encrypted:');
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-a', userId: 'owner-a' }),
    );
  });

  it('returns only aggregate review topics and rating trend', async () => {
    const { service, prisma } = setup();
    prisma.businessReview.findMany.mockResolvedValue([
      {
        id: 'review-a',
        tenantId: 'tenant-a',
        source: 'yandex',
        rating: 2,
        occurredAt: new Date('2026-07-10T10:00:00.000Z'),
        encryptedText: 'cipher-a',
        topicTagsJson: ['wait'],
        branchId: null,
        staffExternalId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'review-b',
        tenantId: 'tenant-a',
        source: 'yandex',
        rating: 5,
        occurredAt: new Date('2026-08-10T10:00:00.000Z'),
        encryptedText: 'cipher-b',
        topicTagsJson: ['staff'],
        branchId: null,
        staffExternalId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const topics = await service.analyzeReviews('tenant-a', { days: 365 });
    const trend = await service.reviewTrend('tenant-a', { days: 365 });

    const findManyCalls = prisma.businessReview.findMany.mock
      .calls as unknown as Array<[{ where: Record<string, unknown> }]>;
    const findManyInput = findManyCalls[0]?.[0];
    expect(findManyInput).toBeDefined();
    if (!findManyInput) throw new Error('Expected review query input');
    const findManyWhere = findManyInput.where;
    expect(findManyWhere.tenantId).toBe('tenant-a');
    expect(topics).toMatchObject({
      review_count: 2,
      average_rating: 3.5,
      privacy: 'aggregated_topics_only',
    });
    expect(trend).toMatchObject({
      review_count: 2,
      rating_change: 3,
      direction: 'improving',
    });
    expect(JSON.stringify({ topics, trend })).not.toContain('cipher-');
  });

  it('refuses to mutate a catalog item outside the current tenant', async () => {
    const { service, prisma } = setup();
    prisma.tenantCatalogItem.findFirst.mockResolvedValue(null);

    await expect(
      service.updateCatalogItem(
        'tenant-a',
        'owner-a',
        'certificate',
        'item-from-tenant-b',
        { name: 'Сертификат' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenantCatalogItem.update).not.toHaveBeenCalled();
  });
});
