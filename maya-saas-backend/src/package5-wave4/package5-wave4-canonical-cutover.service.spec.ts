import { BadRequestException, ConflictException } from '@nestjs/common';

import { EncryptionService } from '../encryption/encryption.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { Package5Wave4CanonicalCutoverService } from './package5-wave4-canonical-cutover.service';
import {
  Package5Wave4ExecutableService,
  Package5Wave4ReviewFactService,
  Package5Wave4ShadowService,
} from './package5-wave4.service';

describe('Package5Wave4CanonicalCutoverService', () => {
  const setup = () => {
    const build = jest.fn();
    const execute = jest.fn().mockResolvedValue({
      actionExecutionId: 'ae-wave4',
      targetRef: 'provider-1',
    });
    const resume = jest.fn().mockResolvedValue({
      actionExecutionId: 'ae-wave4',
      targetRef: 'provider-1',
    });
    const tenantContext = new TenantContextService();
    const prisma = {
      internalProvider: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'provider-1',
          avatarUrl: '/api/public/uploads/provider-avatars/p5w4-file.jpg',
        }),
      },
    };
    const quotas = { assertCanCreate: jest.fn().mockResolvedValue(undefined) };
    const service = new Package5Wave4CanonicalCutoverService(
      { build } as unknown as Package5Wave4ShadowService,
      { execute, resume } as unknown as Package5Wave4ExecutableService,
      tenantContext,
      prisma as never,
      quotas as never,
    );
    return { service, build, execute, resume, prisma, quotas };
  };

  it('crosses canonical ingress and resumes the same execution', async () => {
    const fixture = setup();
    const prepared = { existingExecution: { id: 'ae-wave4' } };
    fixture.build.mockResolvedValue(prepared);

    await fixture.service.execute(
      'tenant-1',
      { userId: 'owner-1' },
      { operation: 'archive_inventory_item', itemId: 'inventory-1' },
      'stable-wave4-request',
    );

    expect(fixture.build).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'owner-1' },
      {
        operation: 'archive_inventory_item',
        itemId: 'inventory-1',
        sourceIntentRef: 'stable-wave4-request',
      },
      'execute',
    );
    expect(fixture.resume).toHaveBeenCalledWith(prepared);
    expect(fixture.execute).not.toHaveBeenCalled();
  });

  it('rejects inline avatar authority and requires a bounded identity', async () => {
    const fixture = setup();
    await expect(
      fixture.service.createProvider(
        'tenant-1',
        'owner-1',
        { displayName: 'Provider', avatarUrl: 'https://forged.test/avatar' },
        'stable-wave4-provider',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.build).not.toHaveBeenCalled();
    expect(() => fixture.service.intentRef('short')).toThrow(
      BadRequestException,
    );
  });

  it('uses the canonical avatar action and returns only the committed URL', async () => {
    const fixture = setup();
    fixture.build.mockResolvedValue({ existingExecution: null });

    const value = await fixture.service.uploadProviderAvatar(
      'tenant-1',
      'owner-1',
      'provider-1',
      {
        buffer: Buffer.from('image'),
        mimetype: 'image/png',
        originalname: 'avatar.png',
        size: 5,
      },
      'stable-wave4-avatar',
    );

    const buildCalls = fixture.build.mock.calls as unknown as Array<
      [string, unknown, Record<string, unknown>, string]
    >;
    const command = buildCalls[0]?.[2] ?? {};
    expect(command.operation).toBe('upload_provider_avatar');
    expect(command.sourceIntentRef).toBe('stable-wave4-avatar');
    expect(fixture.execute).toHaveBeenCalled();
    expect(value).toEqual({
      provider_id: 'provider-1',
      avatar_url: '/api/public/uploads/provider-avatars/p5w4-file.jpg',
    });
  });
});

describe('Package5Wave4ReviewFactService production boundary', () => {
  it('encrypts once and converges plaintext retry despite randomized ciphertext', async () => {
    let stored: Record<string, unknown> | null = null;
    let encryptions = 0;
    const findUnique = jest.fn(() => Promise.resolve(stored));
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
      stored = {
        id: 'review-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return Promise.resolve(stored);
    });
    const prisma = {
      branch: { findUnique: jest.fn() },
      businessReview: { findUnique },
      $transaction: jest.fn((callback: (tx: unknown) => Promise<unknown>) =>
        callback({ businessReview: { findUnique, create } }),
      ),
    };
    const encryption = {
      encrypt: jest.fn((value: string) => {
        encryptions += 1;
        return `cipher:${encryptions}:${value}`;
      }),
      decrypt: jest.fn((value: string) => value.split(':').slice(2).join(':')),
    };
    const service = new Package5Wave4ReviewFactService(
      prisma as never,
      encryption as unknown as EncryptionService,
    );
    const input = {
      tenantId: 'tenant-1',
      source: 'Yandex',
      externalRef: 'review-external-1',
      rating: 5,
      occurredAt: new Date('2026-09-03T10:00:00.000Z'),
      text: 'Excellent service',
      topicTags: ['staff'],
    };

    await expect(service.accept(input)).resolves.toMatchObject({
      id: 'review-1',
    });
    await expect(service.accept(input)).resolves.toMatchObject({
      id: 'review-1',
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(stored?.encryptedText).not.toBe(input.text);

    await expect(
      service.accept({ ...input, rating: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
