import { ConfigService } from '@nestjs/config';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { MayaBrainMemoryService } from './maya-brain-memory.service';

describe('MayaBrainMemoryService', () => {
  const user: AuthenticatedUser = {
    userId: 'user-a',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  it('persists only allowlisted preference enums, never the raw message', async () => {
    const mocks = createService();

    const result = await mocks.service.captureExplicitPreferences(
      user,
      'Пожалуйста, отвечай кратко и без эмодзи. Клиента зовут Иван.',
    );

    expect(result).toEqual([
      { key: 'response_detail', value: 'compact' },
      { key: 'emoji', value: 'off' },
    ]);
    expect(mocks.prisma.aiMemoryFact.upsert).toHaveBeenCalledTimes(2);
    const serialized = JSON.stringify(
      mocks.prisma.aiMemoryFact.upsert.mock.calls,
    );
    expect(serialized).not.toContain('Иван');
    expect(serialized).not.toContain('отвечай кратко');
    expect(serialized).toContain('enc:compact');
    expect(serialized).toContain('enc:off');
  });

  it('decrypts active allowlisted preferences and skips corrupt rows', async () => {
    const mocks = createService();
    mocks.prisma.aiMemoryFact.findMany.mockResolvedValue([
      { key: 'language', encryptedValue: 'enc:ru' },
      { key: 'unsafe_key', encryptedValue: 'enc:raw text' },
      { key: 'emoji', encryptedValue: 'enc:unknown' },
    ]);

    await expect(mocks.service.list(user)).resolves.toEqual([
      { key: 'language', value: 'ru' },
    ]);
    const findCalls = mocks.prisma.aiMemoryFact.findMany.mock
      .calls as unknown as Array<
      [{ where: { tenantId: string; subjectUserId: string } }]
    >;
    expect(findCalls[0]?.[0].where).toMatchObject({
      tenantId: 'tenant-a',
      subjectUserId: 'user-a',
    });
  });

  it('soft-deletes only the current membership memory', async () => {
    const mocks = createService();
    mocks.prisma.aiMemoryFact.updateMany.mockResolvedValue({ count: 3 });

    await expect(mocks.service.forget(user)).resolves.toBe(3);
    const updateCalls = mocks.prisma.aiMemoryFact.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: {
            tenantId: string;
            subjectUserId: string;
            deletedAt: null;
          };
          data: { deletedAt: Date };
        },
      ]
    >;
    expect(updateCalls[0]?.[0].where).toEqual({
      tenantId: 'tenant-a',
      subjectUserId: 'user-a',
      deletedAt: null,
    });
    expect(updateCalls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
  });

  function createService() {
    const prisma = {
      aiMemoryFact: {
        upsert: jest.fn().mockResolvedValue({ id: 'memory-a' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const encryption = {
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
    };
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    return {
      prisma,
      service: new MayaBrainMemoryService(
        config as unknown as ConfigService,
        prisma as unknown as PrismaService,
        encryption as unknown as EncryptionService,
        auditLog as unknown as AuditLogService,
      ),
    };
  }
});
