import { ConflictException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { goodsHash, GOODS_RECEIPT_TOOL } from '../crm/goods-receipt.contract';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolReceiptService } from './ai-tool-receipt.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';

const actor = {
  tenantId: 'tenant',
  userId: 'owner',
  role: UserRole.TENANT_OWNER,
} as AuthenticatedUser;
const proposal = {
  goods_id: '123',
  store_id: '9',
  quantity: '2.5',
  unit_id: '11',
  unit_cost: '10.25',
  currency: 'RUB',
  price_kind: 'receipt_purchase_unit',
  received_at: '2026-10-08T09:00:00Z',
  photo_sha256: 'a'.repeat(64),
  source_line: 1,
  review_version: 1,
};
const key = 'goods-photo-test-key';
function setup(currentStatus: string) {
  const payloadHash = goodsHash({
    actor_user_id: actor.userId,
    arguments: proposal,
    surface: 'web',
    tool_name: GOODS_RECEIPT_TOOL,
  });
  const saved = {
    id: 'approval',
    tenantId: 'tenant',
    requestedByUserId: 'owner',
    toolName: GOODS_RECEIPT_TOOL,
    surface: 'web',
    payloadHash,
    encryptedArguments: JSON.stringify(proposal),
    status: 'pending',
    expiresAt: new Date(Date.now() + 600_000),
    idempotencyKey: key,
  };
  const prisma = {
    aiApprovalRequest: {
      findUnique: jest.fn().mockResolvedValue(saved),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...saved, status: currentStatus }),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    aiToolExecution: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'saved-execution',
        toolName: GOODS_RECEIPT_TOOL,
        encryptedResult: JSON.stringify({ historical: true }),
      }),
      create: jest.fn(),
    },
  };
  const tenantContext = new TenantContextService();
  const handler = {
    normalizeArguments: jest.fn(
      (_name: string, _principal: unknown, args: unknown) =>
        Promise.resolve(args),
    ),
    execute: jest.fn(),
  };
  const policy = {
    buildPrincipal: (
      tenantId: string,
      userId: string,
      role: UserRole,
      surface: string,
    ) => ({ tenantId, userId, role, surface }),
    assertCanExecute: jest.fn().mockResolvedValue(undefined),
    assertCanDecide: jest.fn(),
  };
  const runtime = new AiToolRuntimeService(
    prisma as unknown as PrismaService,
    tenantContext,
    new AiToolRegistryService(),
    policy as unknown as AiToolPolicyService,
    handler as unknown as AiToolHandlerService,
    { decrypt: (value: string) => value } as EncryptionService,
    { log: jest.fn() } as unknown as AuditLogService,
    { read: () => null } as unknown as AiToolReceiptService,
  );
  const run = (args = proposal) =>
    tenantContext.runAsSystemTenant('tenant', () =>
      runtime.execute(
        actor,
        GOODS_RECEIPT_TOOL,
        { surface: 'web', arguments: args, idempotencyKey: key },
        { goodsReviewOnly: true },
      ),
    );
  return { runtime, tenantContext, prisma, handler, run, saved };
}

describe('Canonical goods review-only retry boundary, no provider', () => {
  it.each(['approved', 'executing'])(
    'holds current %s after stale pending lookup without dispatch or execution creation',
    async (status) => {
      const h = setup(status);
      await expect(h.run()).resolves.toEqual({
        status: 'held',
        replayed: true,
      });
      expect(
        h.prisma.aiApprovalRequest.findUniqueOrThrow,
      ).toHaveBeenCalledTimes(1);
      expect(h.handler.execute).not.toHaveBeenCalled();
      expect(h.prisma.aiToolExecution.create).not.toHaveBeenCalled();
      expect(h.prisma.aiApprovalRequest.updateMany).not.toHaveBeenCalled();
    },
  );

  it('reads a completed saved result without executing another effect', async () => {
    const h = setup('completed');
    await expect(h.run()).resolves.toMatchObject({
      status: 'completed',
      result: { historical: true },
      replayed: true,
    });
    expect(h.prisma.aiToolExecution.findUnique).toHaveBeenCalledTimes(1);
    expect(h.handler.execute).not.toHaveBeenCalled();
    expect(h.prisma.aiToolExecution.create).not.toHaveBeenCalled();
  });

  it('keeps exact same-version proposal conflict before any effect continuation', async () => {
    const h = setup('executing');
    await expect(
      h.run({ ...proposal, unit_cost: '11' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.prisma.aiApprovalRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(h.handler.execute).not.toHaveBeenCalled();
  });

  it('does not widen review-only metadata to other tool families', async () => {
    const h = setup('pending');
    await expect(
      h.tenantContext.runAsSystemTenant('tenant', () =>
        h.runtime.execute(
          actor,
          'inventory.goods.read',
          { surface: 'web', arguments: { goods_id: '123' } },
          { goodsReviewOnly: true },
        ),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'goods_review_context_invalid' } },
    });
    expect(h.handler.execute).not.toHaveBeenCalled();
  });
});
