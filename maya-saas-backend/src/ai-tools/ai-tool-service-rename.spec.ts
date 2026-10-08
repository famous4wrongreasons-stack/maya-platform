// Synthetic owner/runtime boundary proof. No provider, model, database or mutation.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AuditLogService } from '../audit-log/audit-log.service';
import { OperationsAnalyticsService } from '../analytics/operations-analytics.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentPeriodReader } from '../business-facts/appointment-period.reader';
import { ClientRecencyFactsService } from '../business-facts/client-recency-facts.service';
import { BusinessStateService } from '../business-state/business-state.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { CustomersService } from '../customers/customers.service';
import { EncryptionService } from '../encryption/encryption.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ExpensesService } from '../expenses/expenses.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolReceiptService } from './ai-tool-receipt.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import type { AiToolPrincipal } from './ai-tool.types';

const TOOL = 'catalog.service.rename.preview';
const REQUEST = { service_id: '42', new_title: 'Новое название' };
const KEY = 'service-rename-explicit-preview';
const actor = {
  tenantId: 'tenant-a',
  userId: 'owner-a',
  role: UserRole.TENANT_OWNER,
  membershipId: 'membership-a',
  membershipStatus: 'active',
  branchId: null,
} as AuthenticatedUser;
const principal: AiToolPrincipal = {
  ...actor,
  tenantId: 'tenant-a',
  surface: 'web',
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

function harness() {
  let revision = 'a'.repeat(64),
    revoked = false;
  let saved: Record<string, unknown> | null = null;
  const crm = {
    readServiceCatalog: jest.fn(() =>
      Promise.resolve({
        source: 'external_crm',
        source_revision: revision,
        services: [{ id: '42', name: 'CATALOG_FROM_ORIGINAL_SOURCE' }],
      }),
    ),
    serviceRenameReadIdentity: jest.fn(() =>
      revoked
        ? Promise.reject(
            new ForbiddenException('service_rename_owner_required'),
          )
        : Promise.resolve(revision),
    ),
    previewServiceRenameForActor: jest.fn(
      (
        _tenant: string,
        _user: string,
        serviceId: string,
        newTitle: string,
        witness: string,
      ) => {
        if (witness !== revision)
          return Promise.reject(
            new ConflictException('service_rename_source_changed'),
          );
        return Promise.resolve({
          contract: 'maya.service-rename.preview/1',
          source: 'external_crm',
          scope: 'single_existing_service_title',
          as_of: '2026-10-08T12:00:00Z',
          company_id: '123',
          service_id: serviceId,
          old_title: 'Старое название',
          new_title: newTitle,
          booking_title: 'Название онлайн-записи',
          source_revision: witness,
          current_revision: 'b'.repeat(64),
          preserved_fields_hash: 'c'.repeat(64),
          blocked_reason: 'approval_lane_not_registered',
          preview_only: true,
          noSideEffects: true,
          limitations: ['preview_only'],
        });
      },
    ),
  };
  const registry = new AiToolRegistryService();
  const context = new TenantContextService();
  const entitlements = {
    assertFeature: jest.fn().mockResolvedValue(undefined),
  };
  const policy = new AiToolPolicyService(
    context,
    entitlements as unknown as EntitlementsService,
    registry,
  );
  const handler = new AiToolHandlerService(
    crm as unknown as CrmService,
    {} as AppointmentsService,
    {} as LoyaltyService,
    {} as OperationsAnalyticsService,
    {} as ExpensesService,
    {} as PrismaService,
    {} as CustomersService,
    {} as StaffService,
    {} as BusinessStateService,
    {} as AppointmentPeriodReader,
    {} as ClientRecencyFactsService,
  );
  const prisma = {
    aiToolExecution: {
      findUnique: jest.fn(() => Promise.resolve(saved)),
      findFirst: jest.fn(),
      create: jest.fn((input: unknown) => {
        saved = { ...record(record(input).data), id: 'rename-read-execution' };
        return Promise.resolve(saved);
      }),
      update: jest.fn((input: unknown) => {
        saved = { ...saved, ...record(record(input).data) };
        return Promise.resolve(saved);
      }),
    },
    aiApprovalRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue({ id: 'audit' }) };
  const receipts = { read: jest.fn(), begin: jest.fn() };
  const trigger = { afterCompletedRead: jest.fn().mockResolvedValue(null) };
  const moduleRef = { get: jest.fn().mockReturnValue(trigger) };
  const runtime = new AiToolRuntimeService(
    prisma as unknown as PrismaService,
    context,
    registry,
    policy,
    handler,
    {
      encrypt: (value: string) => value,
      decrypt: (value: string) => value,
    } as EncryptionService,
    audit as unknown as AuditLogService,
    receipts as unknown as AiToolReceiptService,
    moduleRef as unknown as ModuleRef,
  );
  const run = (
    replay = false,
    user = actor,
    args = REQUEST,
    internal: Parameters<AiToolRuntimeService['execute']>[3] = {},
  ) =>
    context.runAsSystemTenant('tenant-a', () =>
      replay
        ? runtime.replayCompletedRead(
            user,
            TOOL,
            { surface: 'web', arguments: args, idempotencyKey: KEY },
            'rename-read-execution',
            internal,
          )
        : runtime.execute(
            user,
            TOOL,
            {
              surface: 'web',
              arguments: args,
              idempotencyKey: KEY,
            },
            internal,
          ),
    );
  return {
    crm,
    registry,
    context,
    entitlements,
    policy,
    handler,
    prisma,
    audit,
    receipts,
    trigger,
    moduleRef,
    runtime,
    run,
    rotate: () => {
      revision = 'd'.repeat(64);
    },
    revoke: () => {
      revoked = true;
    },
    saved: () => saved,
  };
}

describe('catalog.service.rename.preview READ boundary', () => {
  it('exposes two requested fields and no write, approval, retry or stale fallback', () => {
    const h = harness(),
      definition = h.registry.get(TOOL);
    expect(definition).toMatchObject({
      allowedRoles: [UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER],
      requiredFeatures: ['crm.integration'],
      riskTier: 'read',
      approvalPolicy: 'none',
      idempotency: 'none',
      retryPolicy: 'none',
      fallbackPolicy: 'fail_closed',
      inputSchema: {
        additionalProperties: false,
        required: ['service_id', 'new_title'],
      },
    });
    expect(Object.keys(record(definition.inputSchema.properties))).toEqual([
      'service_id',
      'new_title',
    ]);
    expect(() => h.registry.get('catalog.service.rename.commit')).toThrow();
    expect(
      h.registry.validateArguments(TOOL, {
        ...REQUEST,
        new_title: ' Новое название ',
      }),
    ).toEqual(REQUEST);
  });

  it.each([
    'source_revision',
    'company_id',
    'tenantId',
    'userId',
    'branch_id',
    'booking_title',
    'price',
    'patch_body',
  ])('rejects caller-supplied %s before source access', async (key) => {
    const h = harness();
    await expect(
      h.run(false, actor, { ...REQUEST, [key]: 'foreign' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.crm.serviceRenameReadIdentity).not.toHaveBeenCalled();
    expect(h.crm.previewServiceRenameForActor).not.toHaveBeenCalled();
  });

  it.each([
    { service_id: '0', new_title: 'Title' },
    { service_id: '42/43', new_title: 'Title' },
    { service_id: '42', new_title: '' },
    { service_id: '42', new_title: '   ' },
    { service_id: '42', new_title: 'New\nTitle' },
    { service_id: '42', new_title: 'x'.repeat(241) },
  ])('refuses incomplete or unsafe requested text %#', async (args) => {
    const h = harness();
    await expect(h.run(false, actor, args)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.crm.serviceRenameReadIdentity).not.toHaveBeenCalled();
  });

  it.each([
    UserRole.TENANT_ADMIN,
    UserRole.MANAGER,
    UserRole.PROVIDER,
    UserRole.CLIENT,
    UserRole.PLATFORM_ADMIN,
  ])('refuses non-owner role %s before source access', async (role) => {
    const h = harness();
    await expect(h.run(false, { ...actor, role })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(h.crm.serviceRenameReadIdentity).not.toHaveBeenCalled();
    expect(h.crm.previewServiceRenameForActor).not.toHaveBeenCalled();
  });

  it('requires the current tenant and CRM feature; disabled source cannot become a fallback preview', async () => {
    const h = harness();
    await expect(
      h.run(false, { ...actor, tenantId: 'tenant-b' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    h.entitlements.assertFeature.mockRejectedValueOnce(
      new ForbiddenException('feature_disabled'),
    );
    await expect(h.run()).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.crm.previewServiceRenameForActor).not.toHaveBeenCalled();
  });

  it('injects fresh server source only and delegates exact requested title to the current CRM owner', async () => {
    const h = harness();
    const normalized = await h.handler.normalizeArguments(TOOL, principal, {
      ...REQUEST,
      source_revision: 'forged',
      company_id: 'foreign',
    });
    expect(normalized).toEqual({ ...REQUEST, source_revision: 'a'.repeat(64) });
    const result = await h.handler.execute(TOOL, principal, normalized, KEY);
    expect(h.crm.serviceRenameReadIdentity).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
    );
    expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      '42',
      'Новое название',
      'a'.repeat(64),
    );
    expect(result).toMatchObject({
      contract: 'maya.service-rename.preview/1',
      preview_only: true,
      noSideEffects: true,
      blocked_reason: 'approval_lane_not_registered',
    });
    expect(record(result).patch_body).toBeUndefined();
  });

  it.each([UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER])(
    'returns a preview for %s without resolving any widget or approval owner',
    async (role) => {
      const h = harness();
      await expect(h.run(false, { ...actor, role })).resolves.toMatchObject({
        status: 'completed',
        replayed: false,
        result: {
          contract: 'maya.service-rename.preview/1',
          preview_only: true,
          noSideEffects: true,
          old_title: 'Старое название',
          new_title: 'Новое название',
          booking_title: 'Название онлайн-записи',
          blocked_reason: 'approval_lane_not_registered',
        },
      });
      expect(h.entitlements.assertFeature).toHaveBeenCalledWith(
        'tenant-a',
        'crm.integration',
      );
      expect(h.moduleRef.get).not.toHaveBeenCalled();
      expect(h.trigger.afterCompletedRead).not.toHaveBeenCalled();
      expect(h.prisma.aiApprovalRequest.create).not.toHaveBeenCalled();
      expect(h.receipts.begin).not.toHaveBeenCalled();
      expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'replays only the same current source without another provider GET (replay=%s)',
    async (replay) => {
      const h = harness();
      await h.run();
      await expect(h.run(replay)).resolves.toMatchObject({
        status: 'completed',
        replayed: true,
      });
      expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledTimes(1);
      expect(h.crm.serviceRenameReadIdentity.mock.calls.length).toBeGreaterThan(
        2,
      );
      expect(h.trigger.afterCompletedRead).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'rejects changed normalization identity under the same key (replay=%s)',
    async (replay) => {
      const h = harness();
      await h.run();
      h.rotate();
      await expect(h.run(replay)).rejects.toMatchObject({
        response: { error: { code: 'ai_tool_idempotency_conflict' } },
      });
      expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledTimes(1);
    },
  );

  it.each([false, true])(
    'withholds saved preview when source changes during awaited cache lookup (replay=%s)',
    async (replay) => {
      const h = harness();
      await h.run();
      h.prisma.aiToolExecution.findUnique.mockImplementationOnce(() => {
        h.rotate();
        return Promise.resolve(h.saved());
      });
      await expect(h.run(replay)).rejects.toMatchObject({
        response: { error: { code: 'service_rename_source_changed' } },
      });
      expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledTimes(1);
      expect(h.trigger.afterCompletedRead).not.toHaveBeenCalled();
    },
  );

  it.each(['source', 'role'])(
    'withholds fresh result after %s changes during completion persistence',
    async (change) => {
      const h = harness();
      h.audit.log.mockImplementation((input: unknown) => {
        if (record(input).action === 'ai.tool_execution_completed') {
          if (change === 'source') h.rotate();
          else h.revoke();
        }
        return Promise.resolve({ id: 'audit' });
      });
      await expect(h.run()).rejects.toThrow(
        change === 'source' ? ConflictException : ForbiddenException,
      );
      expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledTimes(1);
      expect(h.trigger.afterCompletedRead).not.toHaveBeenCalled();
    },
  );

  it('propagates source failure and refuses failed same-key replay without stale fallback or retry', async () => {
    const h = harness();
    h.crm.previewServiceRenameForActor.mockRejectedValueOnce(
      new ServiceUnavailableException('service_rename_incomplete_source'),
    );
    await expect(h.run()).rejects.toThrow('service_rename_incomplete_source');
    expect(h.saved()?.status).toBe('failed');
    await expect(h.run(true)).rejects.toMatchObject({
      response: { error: { code: 'ai_tool_read_replay_unavailable' } },
    });
    expect(h.crm.previewServiceRenameForActor).toHaveBeenCalledTimes(1);
    expect(h.prisma.aiToolExecution.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.aiApprovalRequest.create).not.toHaveBeenCalled();
  });
});

describe('internal catalog-to-rename source witness', () => {
  const sourceA = 'a'.repeat(64),
    sourceB = 'd'.repeat(64);
  const catalog = (
    h: ReturnType<typeof harness>,
    witness: string,
    replay = false,
  ) =>
    h.context.runAsSystemTenant('tenant-a', () =>
      replay
        ? h.runtime.replayCompletedRead(
            actor,
            'catalog.services.read',
            { surface: 'web', arguments: {}, idempotencyKey: KEY },
            'rename-read-execution',
            { serviceRenameSourceRevision: witness },
          )
        : h.runtime.execute(
            actor,
            'catalog.services.read',
            { surface: 'web', arguments: {}, idempotencyKey: KEY },
            { serviceRenameSourceRevision: witness },
          ),
    );

  it.each([false, true])(
    'rejects catalog cache from A when the current witness is B (replay=%s)',
    async (replay) => {
      const h = harness();
      await expect(catalog(h, sourceA)).resolves.toMatchObject({
        status: 'completed',
        result: { source_revision: sourceA },
      });
      h.rotate();
      await expect(catalog(h, sourceB, replay)).rejects.toMatchObject({
        response: { error: { code: 'ai_tool_idempotency_conflict' } },
      });
      expect(h.crm.readServiceCatalog).toHaveBeenCalledTimes(1);
      expect(h.moduleRef.get).not.toHaveBeenCalled();
      expect(h.crm.previewServiceRenameForActor).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'rejects catalog source drift during awaited cache lookup (replay=%s)',
    async (replay) => {
      const h = harness();
      await catalog(h, sourceA);
      h.prisma.aiToolExecution.findUnique.mockImplementationOnce(() => {
        h.rotate();
        return Promise.resolve(h.saved());
      });
      await expect(catalog(h, sourceA, replay)).rejects.toMatchObject({
        response: { error: { code: 'service_rename_source_changed' } },
      });
      expect(h.crm.readServiceCatalog).toHaveBeenCalledTimes(1);
      expect(h.trigger.afterCompletedRead).not.toHaveBeenCalled();
    },
  );

  it('refuses source drift during execution start persistence before the catalog provider read', async () => {
    const h = harness();
    h.audit.log.mockImplementation((input: unknown) => {
      if (record(input).action === 'ai.tool_execution_started') h.rotate();
      return Promise.resolve({ id: 'audit' });
    });
    await expect(catalog(h, sourceA)).rejects.toMatchObject({
      response: { error: { code: 'service_rename_source_changed' } },
    });
    expect(h.crm.readServiceCatalog).not.toHaveBeenCalled();
    expect(h.trigger.afterCompletedRead).not.toHaveBeenCalled();
  });

  it('refuses a stale exact rename witness before normalization, cache or provider access', async () => {
    const h = harness();
    h.rotate();
    await expect(
      h.run(false, actor, REQUEST, { serviceRenameSourceRevision: sourceA }),
    ).rejects.toMatchObject({
      response: { error: { code: 'service_rename_source_changed' } },
    });
    expect(h.prisma.aiToolExecution.findUnique).not.toHaveBeenCalled();
    expect(h.crm.previewServiceRenameForActor).not.toHaveBeenCalled();
  });

  it('does not replace mismatched normalized rename source with current internal witness', async () => {
    const h = harness();
    jest
      .spyOn(h.handler, 'normalizeArguments')
      .mockResolvedValue({ ...REQUEST, source_revision: sourceB });
    await expect(
      h.run(false, actor, REQUEST, { serviceRenameSourceRevision: sourceA }),
    ).rejects.toMatchObject({
      response: { error: { code: 'service_rename_source_changed' } },
    });
    expect(h.prisma.aiToolExecution.findUnique).not.toHaveBeenCalled();
    expect(h.crm.previewServiceRenameForActor).not.toHaveBeenCalled();
  });

  it.each(['', 'a', 'A'.repeat(64), 'x'.repeat(64)])(
    'rejects malformed internal witness %s',
    async (witness) => {
      const h = harness();
      await expect(catalog(h, witness)).rejects.toMatchObject({
        response: { error: { code: 'service_rename_source_context_invalid' } },
      });
      expect(h.crm.serviceRenameReadIdentity).not.toHaveBeenCalled();
      expect(h.crm.readServiceCatalog).not.toHaveBeenCalled();
    },
  );

  it('cannot use rename witness to broaden any other tool family', async () => {
    const h = harness();
    await expect(
      h.context.runAsSystemTenant('tenant-a', () =>
        h.runtime.execute(
          actor,
          'inventory.goods.read',
          {
            surface: 'web',
            arguments: { goods_id: '42' },
          },
          { serviceRenameSourceRevision: sourceA },
        ),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'service_rename_source_context_invalid' } },
    });
    expect(h.crm.serviceRenameReadIdentity).not.toHaveBeenCalled();
  });

  it('keeps same-witness completed catalog replay read-only without selector presentation', async () => {
    const h = harness();
    await catalog(h, sourceA);
    await expect(catalog(h, sourceA, true)).resolves.toMatchObject({
      status: 'completed',
      replayed: true,
    });
    expect(h.crm.readServiceCatalog).toHaveBeenCalledTimes(1);
    expect(h.moduleRef.get).not.toHaveBeenCalled();
    expect(h.prisma.aiApprovalRequest.create).not.toHaveBeenCalled();
  });
});
