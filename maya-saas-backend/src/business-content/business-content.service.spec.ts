import { NotFoundException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { Package5Wave4CanonicalCutoverService } from '../package5-wave4/package5-wave4-canonical-cutover.service';
import { Package5Wave4ReviewFactService } from '../package5-wave4/package5-wave4.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BusinessContentService } from './business-content.service';
import { P409ValueConfigurationCanonicalCutoverService } from './p4-09-value-configuration-canonical-cutover.service';

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
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const canonicalValueConfiguration = {
      createOffer: jest.fn(),
      updateOffer: jest.fn(),
      retireOffer: jest.fn(),
      updateReferralPolicy: jest.fn(),
    };
    const canonicalWave4 = {
      createInventoryItem: jest.fn(),
      updateInventoryItem: jest.fn(),
      archiveInventoryItem: jest.fn(),
    };
    const reviewFacts = { accept: jest.fn() };
    const service = new BusinessContentService(
      prisma as unknown as PrismaService,
      tenantContext as unknown as TenantContextService,
      auditLog as unknown as AuditLogService,
      canonicalValueConfiguration as unknown as P409ValueConfigurationCanonicalCutoverService,
      canonicalWave4 as unknown as Package5Wave4CanonicalCutoverService,
      reviewFacts as unknown as Package5Wave4ReviewFactService,
    );
    return {
      service,
      prisma,
      auditLog,
      canonicalValueConfiguration,
      canonicalWave4,
      reviewFacts,
    };
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

  it('describes the actual empty filtered review query without claiming configuration absence', async () => {
    const { service, prisma } = setup();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    prisma.businessReview.findMany.mockResolvedValue([]);
    try {
      const result = await service.listReviews('tenant-a', {
        days: 30,
        rating: 2,
        branchId: 'branch-a',
        limit: 5,
      });
      expect(prisma.businessReview.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-a',
          occurredAt: { gte: new Date('2026-07-15T10:00:00.000Z') },
          rating: 2,
          branchId: 'branch-a',
        },
        orderBy: { occurredAt: 'desc' },
        take: 5,
      });
      // Historical compatibility only: this flag still derives from matches.
      expect(result.configured).toBe(false);
      expect(result.source).toBe('not_configured');
      expect(result.read_scope).toEqual({
        contract: 'maya.review-registry-query/1',
        from_inclusive: '2026-07-15T10:00:00.000Z',
        to_exclusive: null,
        rating_exact: 2,
        scope: 'one_branch',
        order: 'occurred_at_desc',
        limit: 5,
        returned_count: 0,
        limit_reached: false,
        configuration_status: 'not_observed',
      });
      expect(prisma.businessReview.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.businessReview.create).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });

  it('preserves tenant-wide unbounded lower date and distinguishes hitting the limit from proven truncation', async () => {
    const { service, prisma } = setup();
    prisma.businessReview.findMany.mockResolvedValue([
      {
        id: 'review-a',
        source: 'yandex',
        rating: 2,
        occurredAt: now,
        topicTagsJson: ['wait'],
        encryptedText: 'SECRET',
        branchId: null,
        staffExternalId: null,
      },
    ]);
    const result = await service.listReviews('tenant-a', { limit: 1 });
    expect(prisma.businessReview.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      orderBy: { occurredAt: 'desc' },
      take: 1,
    });
    expect(result.read_scope).toEqual({
      contract: 'maya.review-registry-query/1',
      from_inclusive: null,
      to_exclusive: null,
      rating_exact: null,
      scope: 'tenant',
      order: 'occurred_at_desc',
      limit: 1,
      returned_count: 1,
      limit_reached: true,
      configuration_status: 'not_observed',
    });
    expect(result.configured).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('passes review text only to the encrypted immutable fact boundary', async () => {
    const { service, reviewFacts, auditLog } = setup();
    reviewFacts.accept.mockResolvedValue({
      id: 'review-a',
      tenantId: 'tenant-a',
      source: 'yandex',
      externalRef: 'review-source-a',
      rating: 2,
      occurredAt: new Date('2026-08-14T09:00:00.000Z'),
      encryptedText: 'ciphertext',
      topicTagsJson: ['staff', 'wait'],
      branchId: null,
      staffExternalId: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.ingestReview('tenant-a', 'owner-a', {
      source: 'Yandex',
      externalRef: 'review-source-a',
      rating: 2,
      occurredAt: '2026-08-14T09:00:00.000Z',
      text: 'Долго ждал, но мастер вежливый',
    });

    expect(reviewFacts.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        source: 'yandex',
        externalRef: 'review-source-a',
        text: 'Долго ждал, но мастер вежливый',
      }),
    );
    const reviewCalls = reviewFacts.accept.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    expect(reviewCalls[0]?.[0].topicTags).toEqual(
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
    const { service, canonicalValueConfiguration } = setup();
    canonicalValueConfiguration.updateOffer.mockRejectedValue(
      new NotFoundException('Canonical offer does not exist'),
    );

    await expect(
      service.updateCatalogItem(
        'tenant-a',
        'owner-a',
        'certificate',
        'item-from-tenant-b',
        { name: 'Сертификат' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(canonicalValueConfiguration.updateOffer).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      'certificate',
      'item-from-tenant-b',
      { name: 'Сертификат' },
    );
  });

  it('delegates inventory and value-bearing catalog writes to their canonical owners', async () => {
    const { service, prisma, canonicalValueConfiguration, canonicalWave4 } =
      setup();
    canonicalWave4.createInventoryItem.mockResolvedValue({
      id: 'inventory-a',
      tenantId: 'tenant-a',
      kind: 'inventory',
      name: 'Wax',
      description: null,
      priceKopecks: 1000,
      currency: 'RUB',
      quantity: 1,
      lowStockThreshold: null,
      active: true,
      source: 'manual',
      externalRef: null,
      metadataJson: null,
      createdAt: now,
      updatedAt: now,
    });
    await service.createCatalogItem(
      'tenant-a',
      'owner-a',
      'inventory',
      {
        name: 'Wax',
        priceKopecks: 1000,
        quantity: 1,
      },
      'stable-inventory-request',
    );
    expect(canonicalWave4.createInventoryItem).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      { name: 'Wax', priceKopecks: 1000, quantity: 1 },
      'stable-inventory-request',
    );
    expect(canonicalValueConfiguration.createOffer).not.toHaveBeenCalled();

    canonicalValueConfiguration.createOffer.mockResolvedValue({
      targetId: 'offer-a',
    });
    prisma.tenantCatalogItem.findFirst.mockResolvedValue({
      id: 'offer-a',
      tenantId: 'tenant-a',
      kind: 'membership',
      name: 'Membership',
      description: null,
      priceKopecks: 300_000,
      currency: 'RUB',
      quantity: null,
      lowStockThreshold: null,
      active: true,
      source: 'canonical_action_engine',
      externalRef: null,
      metadataJson: null,
      createdAt: now,
      updatedAt: now,
    });
    await service.createCatalogItem('tenant-a', 'owner-a', 'membership', {
      canonicalTemplateKey: 'haircut.senior',
      name: 'Membership',
      priceKopecks: 300_000,
    });
    expect(canonicalValueConfiguration.createOffer).toHaveBeenCalled();
  });
});
