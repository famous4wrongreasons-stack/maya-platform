import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiMemoryService } from './ai-memory.service';

interface StoredFact {
  id: string;
  tenantId: string;
  subjectUserId: string;
  scope: string;
  key: string;
  encryptedValue: string;
  valueHash: string;
  source: string;
  confidence: number;
  retentionDays: number;
  expiresAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
}

type FactIdentity = Pick<
  StoredFact,
  'tenantId' | 'subjectUserId' | 'scope' | 'key'
>;
type FactCreate = Omit<StoredFact, 'id' | 'deletedAt' | 'updatedAt'>;

interface UpsertArgs {
  where: { tenantId_subjectUserId_scope_key: FactIdentity };
  create: FactCreate;
  update: Partial<FactCreate> & { deletedAt?: Date | null };
}

interface FindManyArgs {
  where: Omit<FactIdentity, 'key'> & {
    deletedAt: null;
    expiresAt: { gt: Date };
  };
  take: number;
}

interface UpdateManyArgs {
  where: Omit<FactIdentity, 'key'> & { deletedAt: null };
  data: { deletedAt: Date };
}

describe('AiMemoryService', () => {
  const rows: StoredFact[] = [];
  const log = jest.fn().mockResolvedValue(undefined);
  const upsert = jest.fn((args: UpsertArgs) => {
    const identity = args.where.tenantId_subjectUserId_scope_key;
    let row = rows.find(
      (candidate) =>
        candidate.tenantId === identity.tenantId &&
        candidate.subjectUserId === identity.subjectUserId &&
        candidate.scope === identity.scope &&
        candidate.key === identity.key,
    );
    if (row) {
      Object.assign(row, args.update, { updatedAt: new Date() });
      return Promise.resolve(row);
    }
    row = {
      id: `memory-${rows.length + 1}`,
      ...args.create,
      deletedAt: null,
      updatedAt: new Date(),
    };
    rows.push(row);
    return Promise.resolve(row);
  });
  const findMany = jest.fn((args: FindManyArgs) =>
    Promise.resolve(
      rows
        .filter(
          (row) =>
            row.tenantId === args.where.tenantId &&
            row.subjectUserId === args.where.subjectUserId &&
            row.scope === args.where.scope &&
            row.deletedAt === null &&
            row.expiresAt > args.where.expiresAt.gt,
        )
        .sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
        )
        .slice(0, args.take)
        .map((row) => ({ encryptedValue: row.encryptedValue })),
    ),
  );
  const updateMany = jest.fn((args: UpdateManyArgs) => {
    let count = 0;
    for (const row of rows) {
      if (
        row.tenantId === args.where.tenantId &&
        row.subjectUserId === args.where.subjectUserId &&
        row.scope === args.where.scope &&
        row.deletedAt === null
      ) {
        row.deletedAt = args.data.deletedAt;
        count += 1;
      }
    }
    return Promise.resolve({ count });
  });
  const encryption = {
    encrypt: jest.fn((value: string) =>
      Buffer.from(value, 'utf8').toString('base64url'),
    ),
    decrypt: jest.fn((value: string) =>
      Buffer.from(value, 'base64url').toString('utf8'),
    ),
  };
  const service = new AiMemoryService(
    {
      aiMemoryFact: { upsert, findMany, updateMany },
    } as unknown as PrismaService,
    {
      assertTenantId: jest.fn((tenantId: string) => tenantId),
    } as unknown as TenantContextService,
    encryption as unknown as EncryptionService,
    { log } as unknown as AuditLogService,
  );

  beforeEach(() => {
    rows.splice(0, rows.length);
    jest.clearAllMocks();
  });

  it('stores an explicit note encrypted and idempotently', async () => {
    const first = await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'ЗАПОМНИ: я предпочитаю короткие ответы',
    );
    await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'запомни я предпочитаю короткие ответы',
    );

    expect(first).toEqual(expect.objectContaining({ kind: 'remembered' }));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.encryptedValue).not.toContain('предпочитаю');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        action: 'ai.memory.remembered',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('предпочитаю');
  });

  it('isolates notes by tenant and authenticated user', async () => {
    await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'ЗАПОМНИ отвечать кратко',
    );
    await service.handleExplicitCommand(
      'tenant-b',
      'user-b',
      'ЗАПОМНИ отвечать подробно',
    );

    await expect(service.listForModel('tenant-a', 'user-a')).resolves.toEqual([
      'отвечать кратко',
    ]);
    await expect(service.listForModel('tenant-a', 'user-b')).resolves.toEqual(
      [],
    );
  });

  it('rejects secrets and contact data without writing them', async () => {
    const result = await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'ЗАПОМНИ API token secret-value-123',
    );

    expect(result).toEqual(expect.objectContaining({ kind: 'rejected' }));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('explains that an expense-like memory is not a financial entry', async () => {
    const result = await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'ЗАПОМНИ аренда салона ежемесячная',
    );

    expect(result?.reply).toContain('не проводка');
    expect(result?.reply).toContain('Запиши расход');
  });

  it('soft-deletes only the current user memory', async () => {
    await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'ЗАПОМНИ первая заметка',
    );
    await service.handleExplicitCommand(
      'tenant-a',
      'user-b',
      'ЗАПОМНИ чужая заметка',
    );

    const result = await service.handleExplicitCommand(
      'tenant-a',
      'user-a',
      'Забудь всё, что ты запомнила',
    );

    expect(result).toEqual(expect.objectContaining({ kind: 'cleared' }));
    await expect(service.listForModel('tenant-a', 'user-a')).resolves.toEqual(
      [],
    );
    await expect(service.listForModel('tenant-a', 'user-b')).resolves.toEqual([
      'чужая заметка',
    ]);
  });
});
