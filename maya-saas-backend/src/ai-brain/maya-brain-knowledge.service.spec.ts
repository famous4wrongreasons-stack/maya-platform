import { BadRequestException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { MayaBrainKnowledgeService } from './maya-brain-knowledge.service';

describe('MayaBrainKnowledgeService', () => {
  const owner: AuthenticatedUser = {
    userId: 'owner-a',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.TENANT_OWNER,
    email: 'owner@example.test',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  it('rejects personal data before encryption or persistence', async () => {
    const mocks = createService();

    await expect(
      mocks.service.create(owner, {
        title: 'Контакты администратора',
        content: 'Позвоните администратору по номеру +7 918 000-00-00.',
        audienceRoles: [UserRole.STAFF],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.prisma.aiKnowledgeSource.create).not.toHaveBeenCalled();
    expect(mocks.encryption.encrypt).not.toHaveBeenCalled();
  });

  it('encrypts tenant knowledge and stores only bounded chunks', async () => {
    const mocks = createService();
    mocks.prisma.aiKnowledgeSource.create.mockResolvedValue({
      id: 'ckbsource1',
    });

    await expect(
      mocks.service.create(owner, {
        title: 'Закрытие смены',
        content:
          'Перед закрытием смены проверьте все оплаты и незавершённые записи.\n\nПосле проверки сформируйте итоговый отчёт.',
        sourceType: 'procedure',
        audienceRoles: [UserRole.TENANT_OWNER, UserRole.STAFF],
      }),
    ).resolves.toEqual({ id: 'ckbsource1', created: true });
    const createCalls = mocks.prisma.aiKnowledgeSource.create.mock
      .calls as unknown as Array<
      [
        {
          data: {
            tenantId: string;
            encryptedTitle: string;
            sourceType: string;
          };
        },
      ]
    >;
    const create = createCalls[0]?.[0];
    expect(create?.data.tenantId).toBe('tenant-a');
    expect(create?.data.encryptedTitle).toMatch(/^enc:/);
    expect(create?.data.sourceType).toBe('procedure');
    expect(JSON.stringify(create?.data)).not.toContain('Перед закрытием смены');
    expect(mocks.encryption.encrypt).toHaveBeenCalledWith(
      expect.stringContaining('Перед закрытием смены'),
    );
  });

  it('returns citations only from sources allowed to the authenticated role', async () => {
    const mocks = createService();
    mocks.prisma.aiKnowledgeSource.findMany.mockResolvedValue([
      {
        id: 'ckbsource1',
        encryptedTitle: encrypted('Стандарт закрытия смены'),
        audienceRolesJson: [UserRole.STAFF],
        chunks: [
          {
            id: 'ckbchunk1',
            ordinal: 0,
            encryptedContent: encrypted(
              'Закрытие смены начинается с проверки оплат и записей.',
            ),
          },
        ],
      },
      {
        id: 'ckbsource2',
        encryptedTitle: encrypted('Финансы владельца'),
        audienceRolesJson: [UserRole.TENANT_OWNER],
        chunks: [
          {
            id: 'ckbchunk2',
            ordinal: 0,
            encryptedContent: encrypted('Закрытие смены владельцем.'),
          },
        ],
      },
    ]);
    const staff = { ...owner, role: UserRole.STAFF };

    const result = await mocks.service.search(
      staff,
      'Как работает закрытие смены?',
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      citationId: 'kb:ckbsource1:ckbchunk1',
      sourceId: 'ckbsource1',
      title: 'Стандарт закрытия смены',
    });
  });

  function createService() {
    const prisma = {
      aiKnowledgeSource: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const encryption = {
      encrypt: jest.fn(
        (value: string) =>
          `enc:${Buffer.from(value, 'utf8').toString('base64')}`,
      ),
      decrypt: jest.fn((value: string) =>
        Buffer.from(value.replace(/^enc:/, ''), 'base64').toString('utf8'),
      ),
    };
    const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    return {
      prisma,
      encryption,
      service: new MayaBrainKnowledgeService(
        prisma as unknown as PrismaService,
        encryption as unknown as EncryptionService,
        auditLog as unknown as AuditLogService,
      ),
    };
  }

  function encrypted(value: string): string {
    return `enc:${Buffer.from(value, 'utf8').toString('base64')}`;
  }
});
