import type { StaffScheduleReadScope } from './staff-schedule-read-scope';
import { createHash } from 'node:crypto';
import { canonicalReceiptFixture } from '../../test/fixtures/ai-tool-receipt.fixture';
import { ConflictException, ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { PersonalClientContextService } from '../appointments/personal-client-context.service';
import type { AiReadWidgetTriggerPort } from './ai-read-widget-trigger.port';

const SCOPED_READ_TOOLS = [
  'staff.schedule.read',
  'operations.journal.read',
  'catalog.services.read',
];

const IDEMPOTENCY_KEY = '59f04d18-c04a-4f1d-a529-345fe6f2a65d';

describe('AiToolRuntimeService', () => {
  const customer: AuthenticatedUser = {
    userId: 'customer_12345678',
    sessionId: 'session-a',
    tenantId: 'tenant-a',
    role: UserRole.CUSTOMER,
    email: 'redacted@example.invalid',
    branchId: null,
    membershipId: 'membership-a',
    membershipStatus: 'active',
  };

  it.each(['fresh-source', 'fresh-name', 'saved-source', 'saved-name'])(
    'rejects a pricing source/name mismatch before mint or same-key return: %s',
    async (mode) => {
      const h = createHarness();
      const args = {
        service_id: '42',
        price_rubles: 1500,
        company_id: '123',
        integration_revision: mode.endsWith('source')
          ? 'b'.repeat(64)
          : 'a'.repeat(64),
        current_revision: 'c'.repeat(64),
        current_price_rubles: 2000,
        service_name: mode.endsWith('name') ? 'Другая услуга' : 'Стрижка',
        currency: 'RUB',
      };
      if (mode.startsWith('saved'))
        h.approvalFindUnique.mockResolvedValue(
          approvalRecord({
            toolName: 'catalog.service.price.update',
            encryptedArguments:
              'encrypted:' +
              Buffer.from(JSON.stringify(args)).toString('base64url'),
          }),
        );
      else jest.spyOn(h.handler, 'normalizeArguments').mockResolvedValue(args);
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          h.runtime.execute(
            { ...customer, role: UserRole.TENANT_OWNER },
            'catalog.service.price.update',
            {
              surface: 'web',
              idempotencyKey: IDEMPOTENCY_KEY,
              arguments: { service_id: '42', price_rubles: 1500 },
            },
            {
              servicePriceSourceRevision: 'a'.repeat(64),
              servicePriceServiceName: 'Стрижка',
            },
          ),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(h.approvalCreate).not.toHaveBeenCalled();
      expect(h.handlerExecute).not.toHaveBeenCalled();
    },
  );

  describe('exact local review calendar scope', () => {
    function fixture() {
      const h = createHarness();
      const actor = { ...customer, role: UserRole.TENANT_OWNER };
      const membership = {
        id: 'membership-a',
        tenantId: 'tenant-a',
        userId: actor.userId,
        role: actor.role,
        branchId: null,
        status: 'active',
        user: { status: 'active' },
        tenant: { status: 'active' },
      };
      h.membershipFindUnique.mockResolvedValue(membership);
      const scope = {
        branchId: null,
        timezone: 'UTC',
        period: 'named_month' as const,
        month: '2026-09',
        fromInclusive: '2026-09-01T00:00:00.000Z',
        toExclusive: '2026-10-01T00:00:00.000Z',
        rating: 2,
        limit: 20,
      };
      const resolver = jest
        .spyOn(h.handler, 'resolveReviewCalendarScope')
        .mockImplementation(() => Promise.resolve({ ...scope }));
      let saved: Record<string, unknown> | null = null;
      h.executionFindUnique.mockImplementation(() => Promise.resolve(saved));
      h.executionCreate.mockImplementation((input: unknown) => {
        saved = { ...record(record(input).data), id: 'review-read' };
        return Promise.resolve(saved);
      });
      h.executionUpdate.mockImplementation((input: unknown) => {
        saved = { ...saved, ...record(record(input).data) };
        return Promise.resolve(saved);
      });
      h.handlerExecute.mockResolvedValue({
        source: 'tenant_review_registry',
        count: 0,
        reviews: [],
      });
      const run = (replay = false, expected = { ...scope }) =>
        h.tenantContext.runAsSystemTenant('tenant-a', () => {
          const dto = {
            surface: 'web' as const,
            idempotencyKey: IDEMPOTENCY_KEY,
            arguments: {
              period: 'named_month',
              month: '2026-09',
              rating: 2,
              limit: 20,
            },
          };
          const internal = {
            suppressWidgetTrigger: true,
            reviewCalendarReadScope: expected,
          };
          return replay
            ? h.runtime.replayCompletedRead(
                actor,
                'reviews.list.read',
                dto,
                'review-read',
                internal,
              )
            : h.runtime.execute(actor, 'reviews.list.read', dto, internal);
        });
      return { ...h, scope, resolver, run, membership, actor };
    }
    it('binds actual scope into cache and preserves fresh/canonical replay without another row query', async () => {
      const h = fixture();
      await expect(h.run()).resolves.toMatchObject({
        status: 'completed',
        replayed: false,
      });
      await expect(h.run(true)).resolves.toMatchObject({
        status: 'completed',
        replayed: true,
      });
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      const call = h.handlerExecute.mock.calls[0] as readonly unknown[];
      expect(record(record(call[1]).readAuthority).sourceScopeHash).toMatch(
        /^[a-f0-9]{64}$/,
      );
    });
    it('refuses an expected scope from another branch before any execution', async () => {
      const h = fixture();
      await expect(
        h.run(false, { ...h.scope, timezone: 'Europe/Moscow' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'review_calendar_scope_changed' } },
      });
      expect(h.handlerExecute).not.toHaveBeenCalled();
      expect(h.executionCreate).not.toHaveBeenCalled();
    });
    it('does not disclose cached rows when current scope changes at a policy await', async () => {
      const h = fixture();
      await h.run();
      const expected = { ...h.scope };
      h.policyAssertCanExecute.mockImplementation(() => {
        h.scope.timezone = 'Europe/Moscow';
        return Promise.resolve();
      });
      await expect(h.run(true, expected)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
    it('rejects source drift during the owner query and preserves no verified result', async () => {
      const h = fixture();
      h.handlerExecute.mockImplementation(() => {
        h.scope.timezone = 'Europe/Moscow';
        return Promise.resolve({ reviews: [{ rating: 2 }] });
      });
      await expect(h.run()).rejects.toBeInstanceOf(ConflictException);
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
    it.each(['status', 'user', 'tenant', 'branch'])(
      'rejects current principal %s changes even for replay',
      async (kind) => {
        const h = fixture();
        await h.run();
        if (kind === 'status') h.membership.status = 'revoked';
        if (kind === 'user') h.membership.user.status = 'disabled';
        if (kind === 'tenant') h.membership.tenant.status = 'disabled';
        if (kind === 'branch')
          Object.assign(h.membership, { branchId: 'different' });
        await expect(h.run(true)).rejects.toBeInstanceOf(ForbiddenException);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      },
    );
    it('metadata resolution does not dispatch registry data or create execution', async () => {
      const h = fixture();
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          h.runtime.resolveReviewCalendarScope(h.actor, 'web', {
            period: 'named_month',
            month: '2026-09',
            rating: 2,
            limit: 20,
          }),
        ),
      ).resolves.toEqual(h.scope);
      expect(h.handlerExecute).not.toHaveBeenCalled();
      expect(h.executionCreate).not.toHaveBeenCalled();
    });
  });

  describe.each(SCOPED_READ_TOOLS)(
    'finite current employee READ scope %s',
    (dayTool) => {
      const scope = (): StaffScheduleReadScope => ({
        branchId: 'branch-a',
        sourceRevision: 'a'.repeat(64),
        staffSource: {
          provider: 'yclients',
          staffId: 'local-staff',
          branchId: 'branch-a',
          externalStaffId: '71',
          timezone: 'Europe/Moscow',
          sourceHash: 'b'.repeat(64),
        },
      });
      function fixture(widget?: AiReadWidgetTriggerPort) {
        const h = createHarness(widget);
        const membership = {
          id: 'membership-a',
          tenantId: 'tenant-a',
          userId: customer.userId,
          role: UserRole.TENANT_OWNER,
          branchId: null as string | null,
          status: 'active',
          user: { status: 'active' },
          tenant: { status: 'active' },
        };
        h.membershipFindUnique.mockResolvedValue(membership);
        let saved: Record<string, unknown> | null = null;
        let changed = false;
        h.executionFindUnique.mockImplementation(() => Promise.resolve(saved));
        h.executionCreate.mockImplementation((input: unknown) => {
          saved = { ...record(record(input).data), id: 'schedule-read' };
          return Promise.resolve(saved);
        });
        h.executionUpdate.mockImplementation((input: unknown) => {
          saved = { ...saved, ...record(record(input).data) };
          return Promise.resolve(saved);
        });
        h.handlerExecute.mockResolvedValue({
          staff: [{ id: '71', name: 'PRIVATE_SCOPED_RESULT' }],
        });
        const guard = jest
          .spyOn(h.handler, 'assertStaffScheduleReadScope')
          .mockImplementation(() => {
            if (changed)
              return Promise.reject(
                new ConflictException('staff_schedule_read_source_changed'),
              );
            return Promise.resolve();
          });
        const run = (replay = false, supplied = scope(), name = dayTool) =>
          h.tenantContext.runAsSystemTenant('tenant-a', () => {
            const dto = {
              surface: 'web' as const,
              idempotencyKey: IDEMPOTENCY_KEY,
              arguments: [
                'staff.schedule.read',
                'operations.journal.read',
              ].includes(name)
                ? { staff_id: '71', date: '2026-10-10' }
                : {},
            };
            const internal = {
              staffScheduleReadScope: supplied,
              suppressWidgetTrigger: widget === undefined,
            };
            const actor = { ...customer, role: UserRole.TENANT_OWNER };
            return replay
              ? h.runtime.replayCompletedRead(
                  actor,
                  name,
                  dto,
                  'schedule-read',
                  internal,
                )
              : h.runtime.execute(actor, name, dto, internal);
          });
        return {
          ...h,
          guard,
          run,
          membership,
          saved: () => saved,
          change: () => {
            changed = true;
          },
        };
      }
      it('retains the server witness in the existing authority hash and replays the same source without another handler call', async () => {
        const h = fixture();
        await expect(h.run()).resolves.toMatchObject({
          status: 'completed',
          replayed: false,
        });
        const actor = record(
          (h.handlerExecute.mock.calls[0] as readonly unknown[])[1],
        );
        expect(actor.staffScheduleReadSource).toEqual(scope());
        expect(record(actor.readAuthority).sourceScopeHash).toMatch(
          /^[a-f0-9]{64}$/,
        );
        await expect(h.run(true)).resolves.toMatchObject({
          status: 'completed',
          replayed: true,
        });
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        expect(h.guard.mock.calls.every((call) => call[1] === dayTool)).toBe(
          true,
        );
      });
      it('applies the same bounded current revision to the catalog prerequisite without requiring a staff selection', async () => {
        const h = fixture();
        const source = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
        await expect(
          h.run(false, source, 'catalog.staff.read'),
        ).resolves.toMatchObject({ status: 'completed' });
        await expect(
          h.run(true, source, 'catalog.staff.read'),
        ).resolves.toMatchObject({ replayed: true });
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        expect(
          record((h.handlerExecute.mock.calls[0] as readonly unknown[])[1])
            .staffScheduleReadSource,
        ).toEqual(source);
      });
      it('keeps public projection separate from old branding/catalog cache and replays its exact marker', async () => {
        const scope = {
          branchId: 'branch-a',
          sourceRevision: 'a'.repeat(64),
          publicProjection: 'company_profile' as const,
        };
        const f = fixture();
        await f.run(false, scope, 'catalog.staff.read');
        await expect(
          f.run(true, scope, 'catalog.staff.read'),
        ).resolves.toMatchObject({ replayed: true });
        expect(
          record((f.handlerExecute.mock.calls[0] as readonly unknown[])[1])
            .staffScheduleReadSource,
        ).toEqual(scope);
        expect(f.handlerExecute).toHaveBeenCalledTimes(1);
        await expect(
          f.run(
            true,
            { branchId: scope.branchId, sourceRevision: scope.sourceRevision },
            'catalog.staff.read',
          ),
        ).rejects.toThrow(ConflictException);
        f.change();
        await expect(f.run(true, scope, 'catalog.staff.read')).rejects.toThrow(
          'staff_schedule_read_source_changed',
        );
        expect(f.handlerExecute).toHaveBeenCalledTimes(1);
      });
      it('rejects public projection on day tools or mixed with a staff witness before dispatch', async () => {
        const f = fixture();
        const mixed = {
          ...scope(),
          publicProjection: 'company_profile' as const,
        };
        await expect(f.run(false, mixed)).rejects.toThrow(ConflictException);
        await expect(f.run(false, mixed, 'catalog.staff.read')).rejects.toThrow(
          ConflictException,
        );
        expect(f.handlerExecute).not.toHaveBeenCalled();
      });
      it.each([false, true])(
        'refuses a changed current source before cache lookup/provider, replay=%s',
        async (replay) => {
          const h = fixture();
          await h.run();
          h.executionFindUnique.mockClear();
          h.change();
          await expect(h.run(replay)).rejects.toThrow(
            'staff_schedule_read_source_changed',
          );
          expect(h.executionFindUnique).not.toHaveBeenCalled();
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        },
      );
      it.each([false, true])(
        'does not reuse a completed key under a different valid witness, replay=%s',
        async (replay) => {
          const h = fixture();
          await h.run();
          await expect(
            h.run(replay, { ...scope(), sourceRevision: 'c'.repeat(64) }),
          ).rejects.toThrow(ConflictException);
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        },
      );
      it.each([false, true])(
        'withholds a saved result if source changes while cache lookup awaits, replay=%s',
        async (replay) => {
          const h = fixture();
          await h.run();
          // The canonical receipt fixture wraps the original Prisma mock with
          // its own saved-read lookup; intercept that actual lookup boundary.
          const find = h.prisma.aiToolExecution.findUnique.bind(
            h.prisma.aiToolExecution,
          );
          jest
            .spyOn(h.prisma.aiToolExecution, 'findUnique')
            .mockImplementation((input) => {
              h.change();
              return find(input);
            });
          await expect(h.run(replay)).rejects.toThrow(
            'staff_schedule_read_source_changed',
          );
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        },
      );
      it('rechecks after execution-row creation before invoking the provider handler', async () => {
        const h = fixture();
        h.executionCreate.mockImplementation((input: unknown) => {
          h.change();
          return Promise.resolve({
            ...record(record(input).data),
            id: 'schedule-read',
          });
        });
        await expect(h.run()).rejects.toThrow(
          'staff_schedule_read_source_changed',
        );
        expect(h.handlerExecute).not.toHaveBeenCalled();
      });
      it('withholds result when policy is revoked during source work', async () => {
        const h = fixture();
        h.handlerExecute.mockImplementation(() => {
          h.policyAssertCanExecute.mockRejectedValue(
            new ForbiddenException('revoked'),
          );
          return Promise.resolve({ staff: [{ id: '71' }] });
        });
        await expect(h.run()).rejects.toThrow('revoked');
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      });
      it.each([
        'membership',
        'tenant',
        'actor',
        'role',
        'branch',
        'revoked',
        'disabled-user',
        'disabled-tenant',
      ])(
        'rejects current %s identity drift before source/provider work',
        async (kind) => {
          const h = fixture();
          if (kind === 'membership') h.membership.id = 'replacement-membership';
          if (kind === 'tenant') h.membership.tenantId = 'foreign-tenant';
          if (kind === 'actor') h.membership.userId = 'foreign-user';
          if (kind === 'role') h.membership.role = UserRole.CUSTOMER;
          if (kind === 'branch') h.membership.branchId = 'other-branch';
          if (kind === 'revoked') h.membership.status = 'inactive';
          if (kind === 'disabled-user') h.membership.user.status = 'inactive';
          if (kind === 'disabled-tenant')
            h.membership.tenant.status = 'inactive';
          await expect(h.run()).rejects.toMatchObject({
            response: {
              error: { code: 'staff_schedule_read_principal_changed' },
            },
          });
          expect(h.guard).not.toHaveBeenCalled();
          expect(h.executionFindUnique).not.toHaveBeenCalled();
          expect(h.handlerExecute).not.toHaveBeenCalled();
        },
      );
      it.each([false, true])(
        'withholds cached source after actual membership revocation during lookup, replay=%s',
        async (replay) => {
          const h = fixture();
          await h.run();
          const find = h.prisma.aiToolExecution.findUnique.bind(
            h.prisma.aiToolExecution,
          );
          jest
            .spyOn(h.prisma.aiToolExecution, 'findUnique')
            .mockImplementation((input) => {
              h.membership.status = 'inactive';
              return find(input);
            });
          await expect(h.run(replay)).rejects.toMatchObject({
            response: {
              error: { code: 'staff_schedule_read_principal_changed' },
            },
          });
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        },
      );
      it('withholds newly read data after actual user revocation during provider work', async () => {
        const h = fixture();
        h.handlerExecute.mockImplementation(() => {
          h.membership.user.status = 'inactive';
          return Promise.resolve({ staff: [{ id: '71' }] });
        });
        await expect(h.run()).rejects.toMatchObject({
          response: {
            error: { code: 'staff_schedule_read_principal_changed' },
          },
        });
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      });
      it('passes the source guard to the widget owner and withholds a result after awaited widget drift', async () => {
        let change = () => {};
        const afterCompletedRead = jest.fn().mockImplementation(() => {
          change();
          return Promise.resolve(null);
        });
        const h = fixture({ afterCompletedRead });
        change = h.change;
        await expect(h.run()).rejects.toThrow(
          'staff_schedule_read_source_changed',
        );
        expect(afterCompletedRead).toHaveBeenCalledTimes(1);
        expect(
          record((afterCompletedRead.mock.calls[0] as readonly unknown[])[0])
            .revalidateSource,
        ).toEqual(expect.any(Function));
      });
      it.each([
        'wrong-tool',
        'catalog-staff',
        'missing-staff',
        'foreign-branch',
        'different-id',
        'array-provider',
        'extra',
      ])(
        'rejects malformed/misapplied %s witness before source/cache/provider work',
        async (kind) => {
          const h = fixture();
          let value: unknown = scope();
          let name = dayTool;
          if (kind === 'wrong-tool') name = 'business.rules.read';
          if (kind === 'catalog-staff') name = 'catalog.staff.read';
          if (kind === 'missing-staff')
            value = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
          if (kind === 'foreign-branch')
            value = { ...scope(), branchId: 'foreign' };
          if (kind === 'different-id')
            value = {
              ...scope(),
              staffSource: {
                ...scope().staffSource,
                externalStaffId:
                  dayTool === 'catalog.services.read' ? '' : '72',
              },
            };
          if (kind === 'array-provider')
            value = {
              ...scope(),
              staffSource: { ...scope().staffSource, provider: ['yclients'] },
            };
          if (kind === 'extra') value = { ...scope(), authority: true };
          await expect(
            h.run(false, value as StaffScheduleReadScope, name),
          ).rejects.toThrow(ConflictException);
          expect(h.guard).not.toHaveBeenCalled();
          expect(h.executionFindUnique).not.toHaveBeenCalled();
          expect(h.handlerExecute).not.toHaveBeenCalled();
        },
      );
    },
  );

  describe('goods search cached authority after awaited work', () => {
    it.each([false, true])(
      'withholds cached candidates when the source revision changes during lookup (replay=%s)',
      async (replay) => {
        const h = createHarness();
        let revision = 'initial';
        let saved: Record<string, unknown> | null = null;
        jest
          .spyOn(h.handler, 'normalizeArguments')
          .mockImplementation((_name, _actor, args) =>
            Promise.resolve({ ...args, source_revision: revision }),
          );
        h.executionFindUnique.mockImplementation(() => Promise.resolve(saved));
        h.executionCreate.mockImplementation((input: unknown) => {
          saved = { ...record(record(input).data), id: 'search-execution' };
          return Promise.resolve(saved);
        });
        h.executionUpdate.mockImplementation((input: unknown) => {
          saved = { ...saved, ...record(record(input).data) };
          return Promise.resolve(saved);
        });
        h.handlerExecute.mockResolvedValue({
          rows: [{ kind: 'item', id: '123', title: 'PRIVATE_SAVED_CANDIDATE' }],
        });
        const actor = { ...customer, role: UserRole.TENANT_OWNER };
        const dto = {
          surface: 'web' as const,
          arguments: { query: 'шампунь' },
          idempotencyKey: IDEMPOTENCY_KEY,
        };
        const run = (cachedReplay = false) =>
          h.tenantContext.runAsSystemTenant('tenant-a', () =>
            cachedReplay
              ? h.runtime.replayCompletedRead(
                  actor,
                  'inventory.goods.search',
                  dto,
                  'search-execution',
                  { suppressWidgetTrigger: true },
                )
              : h.runtime.execute(actor, 'inventory.goods.search', dto, {
                  suppressWidgetTrigger: true,
                }),
          );
        await expect(run()).resolves.toMatchObject({ status: 'completed' });
        jest
          .spyOn(h.prisma.aiToolExecution, 'findUnique')
          .mockImplementation(() => {
            revision = 'rotated';
            return Promise.resolve(saved) as never;
          });
        await expect(run(replay)).rejects.toMatchObject({
          status: 409,
          response: { error: { code: 'goods_source_changed' } },
        });
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      },
    );
    it('withholds candidates when access is revoked during async presentation', async () => {
      let revoked = false;
      const afterCompletedRead = jest.fn().mockImplementation(() => {
        revoked = true;
        return Promise.resolve(null);
      });
      const h = createHarness({ afterCompletedRead });
      h.executionCreate.mockImplementation((input: unknown) =>
        Promise.resolve({
          ...record(record(input).data),
          id: 'search-execution',
        }),
      );
      jest
        .spyOn(h.handler, 'normalizeArguments')
        .mockImplementation((_name, _actor, args) =>
          revoked
            ? Promise.reject(
                new ForbiddenException('goods_current_unscoped_owner_required'),
              )
            : Promise.resolve({ ...args, source_revision: 'initial' }),
        );
      h.handlerExecute.mockResolvedValue({
        rows: [{ kind: 'item', id: '123', title: 'PRIVATE_CANDIDATE' }],
      });
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          h.runtime.execute(
            { ...customer, role: UserRole.TENANT_OWNER },
            'inventory.goods.search',
            {
              surface: 'web',
              arguments: { query: 'шампунь' },
              idempotencyKey: IDEMPOTENCY_KEY,
            },
          ),
        ),
      ).rejects.toThrow('goods_current_unscoped_owner_required');
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe.each(['appointments.own.list', 'loyalty.own.read'])(
    'current verified personal READ context: %s',
    (toolName) => {
      function personalHarness(widgetTrigger?: AiReadWidgetTriggerPort) {
        const harness = createHarness(widgetTrigger);
        let saved: Record<string, unknown> | null = null;
        harness.executionFindUnique.mockImplementation(() =>
          Promise.resolve(saved),
        );
        harness.executionCreate.mockImplementation((input: unknown) => {
          saved = { ...record(record(input).data), id: 'personal-execution' };
          return Promise.resolve(saved);
        });
        harness.executionUpdate.mockImplementation((input: unknown) => {
          saved = { ...saved, ...record(record(input).data) };
          return Promise.resolve(saved);
        });
        harness.handlerExecute.mockResolvedValue({
          appointments: [{ id: 'private-appointment' }],
        });
        const dto = {
          surface: 'web' as const,
          arguments: {},
          idempotencyKey: IDEMPOTENCY_KEY,
        };
        const actor = { ...customer, role: UserRole.TENANT_OWNER };
        const run = (replay = false, suppressWidgetTrigger = true) =>
          harness.tenantContext.runAsSystemTenant('tenant-a', () =>
            replay
              ? harness.runtime.replayCompletedRead(
                  actor,
                  toolName,
                  dto,
                  'personal-execution',
                  { suppressWidgetTrigger },
                )
              : harness.runtime.execute(actor, toolName, dto, {
                  suppressWidgetTrigger,
                }),
          );
        return { ...harness, actor, run };
      }
      it.each([false, true])(
        'refuses revoked verified linkage before cached payload on replay=%s even without Client.userId',
        async (replay) => {
          const h = personalHarness();
          await expect(h.run()).resolves.toMatchObject({ status: 'completed' });
          h.personalSelect.mockRejectedValue(
            new ForbiddenException('new_verified_maya_user_binding_required'),
          );
          await expect(h.run(replay)).rejects.toThrow(
            'new_verified_maya_user_binding_required',
          );
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
          expect(h.personalSelect).toHaveBeenCalledWith(
            h.actor,
            'personal_client',
          );
        },
      );
      it('keeps the business actor and binds the read to the server-selected Client', async () => {
        const h = personalHarness();
        await expect(h.run()).resolves.toMatchObject({ status: 'completed' });
        expect(h.personalSelect).toHaveBeenCalledWith(
          h.actor,
          'personal_client',
        );
        expect(h.clientFindMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { tenantId: 'tenant-a', id: 'verified-client' },
          }),
        );
        expect(h.handlerExecute).toHaveBeenCalledWith(
          toolName,
          expect.objectContaining({
            role: UserRole.TENANT_OWNER,
            userId: h.actor.userId,
          }),
          {},
          IDEMPOTENCY_KEY,
        );
        expect(h.personalRevalidate).toHaveBeenCalledTimes(1);
      });
      it('refuses a changed verified Client episode instead of replaying the previous personal result', async () => {
        const h = personalHarness();
        await h.run();
        h.personalSelect.mockResolvedValue({
          ...h.personal,
          linkId: 'successor-link',
          clientId: 'other-verified-client',
        });
        await expect(h.run(true)).rejects.toBeInstanceOf(ConflictException);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      });
      it.each([false, true])(
        'withholds personal data when linkage changes in flight, replay=%s',
        async (replay) => {
          const h = personalHarness();
          if (replay) await h.run();
          h.personalRevalidate.mockRejectedValue(
            new ForbiddenException('personal_client_context_changed'),
          );
          await expect(h.run(replay)).rejects.toThrow(
            'personal_client_context_changed',
          );
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        },
      );
      it('fails closed if the verified personal context owner is not wired', async () => {
        const h = createHarness(undefined, false);
        await expect(
          h.tenantContext.runAsSystemTenant('tenant-a', () =>
            h.runtime.execute(customer, toolName, {
              surface: 'web',
              arguments: {},
            }),
          ),
        ).rejects.toThrow('verified_personal_read_context_required');
        expect(h.handlerExecute).not.toHaveBeenCalled();
        expect(h.executionFindUnique).not.toHaveBeenCalled();
      });
      it('revalidates again after asynchronous widget projection before returning personal data', async () => {
        const afterCompletedRead = jest.fn().mockResolvedValue(null);
        const h = personalHarness({ afterCompletedRead });
        afterCompletedRead.mockImplementation(() => {
          h.personalRevalidate.mockRejectedValue(
            new ForbiddenException('personal_client_context_changed'),
          );
          return Promise.resolve(null);
        });
        await expect(h.run(false, false)).rejects.toThrow(
          'personal_client_context_changed',
        );
        expect(afterCompletedRead).toHaveBeenCalledTimes(1);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      });
    },
  );

  it('executes read-only tools directly and stores only encrypted results', async () => {
    const harness = createHarness();
    harness.handlerExecute.mockResolvedValue({ services: [] });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-a' });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'catalog.services.read',
          { arguments: {}, surface: 'web' },
        ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      execution_id: 'execution-a',
      result: { services: [] },
      replayed: false,
    });
    expect(harness.approvalCreate).not.toHaveBeenCalled();
    const executionUpdateInput = harness.getExecutionUpdateInput();
    const executionUpdateData = record(record(executionUpdateInput).data);
    expect(executionUpdateData.status).toBe('completed');
    expect(executionUpdateData.encryptedResult).toEqual(
      expect.stringMatching(/^encrypted:/),
    );
    expect(JSON.stringify(executionUpdateData)).not.toContain('customer_count');
  });

  it.each([false, true])(
    'old defaulted catalog receipt cannot replay under the qualified READ contract (explicit replay=%s)',
    async (replay) => {
      const h = createHarness();
      // Exact historical read-authority/1 identity before the catalog projection pin.
      const oldHash = createHash('sha256')
        .update(
          '{"actor_user_id":"customer_12345678","arguments":{},"read_authority":{"branchId":null,"contract":"maya.read-authority/1","membershipId":"membership-a","membershipStatus":"active","role":"tenant_owner"},"surface":"web","tool_name":"catalog.services.read"}',
        )
        .digest('hex');
      h.executionFindUnique.mockResolvedValue({
        id: 'old-catalog',
        toolName: 'catalog.services.read',
        actorUserId: customer.userId,
        surface: 'web',
        inputHash: oldHash,
        status: 'completed',
        encryptedResult: 'old-unqualified-result',
      });
      const actor = { ...customer, role: UserRole.TENANT_OWNER },
        input = {
          arguments: {},
          surface: 'web' as const,
          idempotencyKey: IDEMPOTENCY_KEY,
        };
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          replay
            ? h.runtime.replayCompletedRead(
                actor,
                'catalog.services.read',
                input,
                'old-catalog',
              )
            : h.runtime.execute(actor, 'catalog.services.read', input),
        ),
      ).rejects.toThrow(ConflictException);
      expect(h.handlerExecute).not.toHaveBeenCalled();
      expect(h.executionCreate).not.toHaveBeenCalled();
      expect(h.executionUpdate).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'old fabricated salon receipt cannot replay under the qualified READ contract (explicit replay=%s)',
    async (replay) => {
      const h = createHarness();
      // Exact historical read-authority/1 identity before the catalog projection pin.
      const oldHash = createHash('sha256')
        .update(
          '{"actor_user_id":"customer_12345678","arguments":{},"read_authority":{"branchId":null,"contract":"maya.read-authority/1","membershipId":"membership-a","membershipStatus":"active","role":"tenant_owner"},"surface":"web","tool_name":"catalog.staff.read"}',
        )
        .digest('hex');
      h.executionFindUnique.mockResolvedValue({
        id: 'old-catalog',
        toolName: 'catalog.staff.read',
        actorUserId: customer.userId,
        surface: 'web',
        inputHash: oldHash,
        status: 'completed',
        encryptedResult:
          'encrypted:' +
          JSON.stringify({
            salon: {
              name: 'Мужская Эстетика',
              about: ['Лермонтова, 343. Работаем больше шести лет.'],
            },
            staff: [],
          }),
      });
      const actor = { ...customer, role: UserRole.TENANT_OWNER },
        input = {
          arguments: {},
          surface: 'web' as const,
          idempotencyKey: IDEMPOTENCY_KEY,
        };
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          replay
            ? h.runtime.replayCompletedRead(
                actor,
                'catalog.staff.read',
                input,
                'old-catalog',
              )
            : h.runtime.execute(actor, 'catalog.staff.read', input),
        ),
      ).rejects.toThrow(ConflictException);
      expect(h.handlerExecute).not.toHaveBeenCalled();
      expect(h.executionCreate).not.toHaveBeenCalled();
      expect(h.executionUpdate).not.toHaveBeenCalled();
    },
  );

  describe.each(['catalog.services.read', 'catalog.staff.read'])(
    'booking catalog source identity %s',
    (toolName) => {
      it.each([false, true])(
        'refuses cached A under current B without rereading or minting, replay=%s',
        async (replay) => {
          const h = createHarness();
          let row: Record<string, unknown> | null = null;
          h.executionFindUnique.mockImplementation(() => Promise.resolve(row));
          h.executionCreate.mockImplementation((v: unknown) => {
            row = { ...record(record(v).data), id: 'catalog-source-read' };
            return Promise.resolve(row);
          });
          h.executionUpdate.mockImplementation((v: unknown) => {
            row = { ...row, ...record(record(v).data) };
            return Promise.resolve(row);
          });
          h.handlerExecute.mockResolvedValue(
            toolName === 'catalog.services.read'
              ? { services: [{ id: 'old-company-service' }] }
              : { staff: [{ id: 'old-company-staff' }] },
          );
          const actor = { ...customer, role: UserRole.TENANT_OWNER };
          const input = {
            surface: 'web' as const,
            idempotencyKey: IDEMPOTENCY_KEY,
            arguments: {},
          };
          let revision = 'a'.repeat(64);
          const internal = () => ({
            suppressWidgetTrigger: true,
            bookingSelector: {
              tenantId: 'tenant-a',
              scope: { branchId: 'maya-branch', sourceRevision: revision },
              revalidate: () => Promise.resolve(),
            },
          });
          await h.tenantContext.runAsSystemTenant('tenant-a', () =>
            h.runtime.execute(actor, toolName, input, internal()),
          );
          revision = 'b'.repeat(64);
          await expect(
            h.tenantContext.runAsSystemTenant('tenant-a', () =>
              replay
                ? h.runtime.replayCompletedRead(
                    actor,
                    toolName,
                    input,
                    'catalog-source-read',
                    internal(),
                  )
                : h.runtime.execute(actor, toolName, input, internal()),
            ),
          ).rejects.toThrow(ConflictException);
          expect(h.handlerExecute).toHaveBeenCalledTimes(1);
          expect(h.executionCreate).toHaveBeenCalledTimes(1);
        },
      );
    },
  );

  describe('exact-time READ cache identity', () => {
    function fixture() {
      const h = createHarness();
      let row: Record<string, unknown> | null = null;
      h.executionFindUnique.mockImplementation(() => Promise.resolve(row));
      h.executionCreate.mockImplementation((value: unknown) => {
        row = { ...record(record(value).data), id: 'exact-time-read' };
        return Promise.resolve(row);
      });
      h.executionUpdate.mockImplementation((value: unknown) => {
        row = { ...row, ...record(record(value).data) };
        return Promise.resolve(row);
      });
      h.handlerExecute.mockResolvedValue({ slots: [] });
      const run = (time = '14:30', replay = false, actor = customer) =>
        h.tenantContext.runAsSystemTenant('tenant-a', () => {
          const input = {
            surface: 'web' as const,
            idempotencyKey: IDEMPOTENCY_KEY,
            arguments: {
              date: '2026-10-11',
              time,
              staff_id: '71',
              service_ids: ['81'],
              branch_id: 'maya-branch',
            },
          };
          return replay
            ? h.runtime.replayCompletedRead(
                actor,
                'booking.availability.read',
                input,
                'exact-time-read',
                { suppressWidgetTrigger: true },
              )
            : h.runtime.execute(actor, 'booking.availability.read', input, {
                suppressWidgetTrigger: true,
              });
        });
      return { ...h, run };
    }
    it.each([false, true])(
      'refuses the previous time under the same read key, replay=%s',
      async (replay) => {
        const h = fixture();
        await h.run();
        await expect(h.run('15:00', replay)).rejects.toThrow(ConflictException);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
        expect(h.executionCreate).toHaveBeenCalledTimes(1);
      },
    );
    it('binds internal selected-staff calendar changes before replay and preserves policy/tenant denials', async () => {
      const h = fixture();
      h.availabilityTenant.mockResolvedValue({
        calendarSource: 'internal',
        defaultTimezone: 'UTC',
      });
      await h.run();
      h.availabilityPreferenceCalendar.mockResolvedValue({
        branchId: 'other-current-branch',
        timezone: 'Asia/Kathmandu',
      });
      await expect(h.run('14:30', true)).rejects.toThrow(ConflictException);
      h.policyAssertCanExecute.mockRejectedValue(
        new ForbiddenException('revoked'),
      );
      await expect(h.run()).rejects.toThrow(ForbiddenException);
      await expect(
        h.run('14:30', false, { ...customer, tenantId: 'foreign-tenant' }),
      ).rejects.toThrow(ForbiddenException);
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    'booking.availability.read',
    'booking.group-availability.read',
  ])('qualified availability source scope: %s', (toolName) => {
    it.each([false, true])(
      'refuses legacy completed receipt without reread or rewrite, C9 replay=%s',
      async (replay) => {
        const h = createHarness();
        const args = {
          branch_id: 'maya-branch',
          date: '2026-10-08T09:00:00Z',
          ...(toolName === 'booking.group-availability.read'
            ? { party_size: 2 }
            : {}),
        };
        const oldHash = createHash('sha256')
          .update(
            JSON.stringify({
              actor_user_id: customer.userId,
              arguments: args,
              read_authority: {
                branchId: null,
                contract: 'maya.read-authority/1',
                membershipId: 'membership-a',
                membershipStatus: 'active',
                role: 'tenant_owner',
              },
              surface: 'web',
              tool_name: toolName,
            }),
          )
          .digest('hex');
        h.executionFindUnique.mockResolvedValue({
          id: 'old-availability',
          toolName,
          actorUserId: customer.userId,
          surface: 'web',
          inputHash: oldHash,
          status: 'completed',
          encryptedResult:
            'encrypted:' +
            JSON.stringify({
              slots: [
                { branch_id: 'maya-branch', staff_id: 'wrong-company-staff' },
              ],
            }),
        });
        const actor = { ...customer, role: UserRole.TENANT_OWNER };
        const input = {
          arguments: args,
          surface: 'web' as const,
          idempotencyKey: IDEMPOTENCY_KEY,
        };
        await expect(
          h.tenantContext.runAsSystemTenant('tenant-a', () =>
            replay
              ? h.runtime.replayCompletedRead(
                  actor,
                  toolName,
                  input,
                  'old-availability',
                )
              : h.runtime.execute(actor, toolName, input),
          ),
        ).rejects.toThrow(ConflictException);
        expect(h.handlerExecute).not.toHaveBeenCalled();
        expect(h.executionCreate).not.toHaveBeenCalled();
        expect(h.executionUpdate).not.toHaveBeenCalled();
      },
    );
  });

  describe.each([
    'booking.availability.read',
    'booking.group-availability.read',
  ])('current branch-binding READ identity %s', (toolName) => {
    const input = {
      surface: 'web' as const,
      idempotencyKey: IDEMPOTENCY_KEY,
      arguments: {
        branch_id: 'maya-branch',
        date: '2026-10-08T09:00:00Z',
        ...(toolName === 'booking.group-availability.read'
          ? { party_size: 2 }
          : {}),
      },
    };
    const actor = { ...customer, role: UserRole.TENANT_OWNER };
    it('retains the original metadata witness through typed successor emission', async () => {
      const h = createHarness();
      h.handlerExecute.mockResolvedValue({ slots: [] });
      let verify: (() => Promise<void>) | undefined;
      await h.tenantContext.runAsSystemTenant('tenant-a', () =>
        h.runtime.execute(actor, toolName, input, {
          suppressWidgetTrigger: true,
          onAvailabilityScope: (check) => {
            verify = check;
          },
        }),
      );
      expect(verify).toBeDefined();
      h.availabilityTenant.mockResolvedValue({
        calendarSource: 'internal',
        defaultTimezone: 'UTC',
      });
      await expect(
        h.tenantContext.runAsSystemTenant('tenant-a', () => verify!()),
      ).rejects.toMatchObject({
        response: { error: { code: 'ai_tool_availability_source_changed' } },
      });
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
    function fixture() {
      const h = createHarness();
      let row: Record<string, unknown> | null = null;
      h.executionFindUnique.mockImplementation(() => Promise.resolve(row));
      h.executionCreate.mockImplementation((v: unknown) => {
        row = { ...record(record(v).data), id: 'binding-read' };
        return Promise.resolve(row);
      });
      h.executionUpdate.mockImplementation((v: unknown) => {
        row = { ...row, ...record(record(v).data) };
        return Promise.resolve(row);
      });
      h.handlerExecute.mockResolvedValue({ slots: [] });
      const run = (replay = false) =>
        h.tenantContext.runAsSystemTenant('tenant-a', () =>
          replay
            ? h.runtime.replayCompletedRead(
                actor,
                toolName,
                input,
                'binding-read',
                { suppressWidgetTrigger: true },
              )
            : h.runtime.execute(actor, toolName, input, {
                suppressWidgetTrigger: true,
              }),
        );
      return { ...h, run };
    }
    it.each([false, true])(
      'rejects cached source after mapping/credential revision change, replay=%s',
      async (replay) => {
        const h = fixture();
        await h.run();
        h.availabilityIntegration.mockResolvedValue({
          id: 'crm',
          provider: 'yclients',
          status: 'active',
          updatedAt: new Date('2026-10-07T01:00:00Z'),
          settingsJson: { companyId: 43 },
        });
        await expect(h.run(replay)).rejects.toThrow(ConflictException);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      },
    );
    it.each(['updatedAt', 'baseUrl'])(
      'invalidates replay when only %s changes',
      async (field) => {
        const h = fixture();
        const before = {
          id: 'crm',
          provider: 'yclients',
          status: 'active',
          updatedAt: new Date('2026-10-07T00:00:00Z'),
          baseUrl: null,
          settingsJson: { companyId: 42 },
        };
        h.availabilityIntegration.mockResolvedValue(before);
        await h.run();
        h.availabilityIntegration.mockResolvedValue({
          ...before,
          [field]:
            field === 'updatedAt'
              ? new Date('2026-10-07T01:00:00Z')
              : 'https://synthetic-other.invalid',
        });
        await expect(h.run(true)).rejects.toThrow(ConflictException);
        expect(h.handlerExecute).toHaveBeenCalledTimes(1);
      },
    );
    it('invalidates cached fallback branch time after tenant timezone changes', async () => {
      const h = fixture();
      h.availabilityBranch.mockResolvedValue({
        id: 'maya-branch',
        timezone: null,
      });
      h.availabilityTenant.mockResolvedValue({
        calendarSource: 'external',
        defaultTimezone: 'UTC',
      });
      await h.run();
      h.availabilityTenant.mockResolvedValue({
        calendarSource: 'external',
        defaultTimezone: 'Europe/Moscow',
      });
      await expect(h.run(true)).rejects.toThrow(ConflictException);
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
    it('withholds response if selected branch disappears in flight', async () => {
      const h = fixture();
      h.handlerExecute.mockImplementation(() => {
        h.availabilityBranch.mockResolvedValue(null);
        return Promise.resolve({ slots: [] });
      });
      await expect(h.run()).rejects.toThrow(ConflictException);
      expect(h.handlerExecute).toHaveBeenCalledTimes(1);
    });
  });

  it('SH-19 attaches the authorized widget resolution to a completed model-free read', async () => {
    const afterCompletedRead: jest.MockedFunction<
      AiReadWidgetTriggerPort['afterCompletedRead']
    > = jest.fn().mockResolvedValue({
      matched: true,
      receipt: { widget_id: 'widget-a' },
      dismiss_widget_id: null,
    });
    const trigger = {
      afterCompletedRead,
    } as unknown as AiReadWidgetTriggerPort;
    const harness = createHarness(trigger);
    harness.handlerExecute.mockResolvedValue({ services: [] });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-a' });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'catalog.services.read',
          { arguments: {}, surface: 'web' },
        ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      resolution: {
        matched: true,
        receipt: { widget_id: 'widget-a' },
      },
    });
    expect(afterCompletedRead).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'catalog.services.read',
        executionId: 'execution-a',
        trigger: 'T-2b',
        requestId: 'system:tenant-a',
      }),
    );
    const completedReadCall = afterCompletedRead.mock.calls[0]?.[0];
    expect(completedReadCall).toEqual(expect.any(Object));
    const conversationId = (completedReadCall as Record<string, unknown>)[
      'conversationId'
    ];
    expect(typeof conversationId).toBe('string');
    expect(conversationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('D-17 binds a T-2b mint to the current server request trace when the caller supplies no internal trace', async () => {
    const afterCompletedRead = jest.fn().mockResolvedValue(null);
    const harness = createHarness({ afterCompletedRead });
    harness.handlerExecute.mockResolvedValue({ services: [] });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-traced' });

    await harness.tenantContext.run('request-d17', () =>
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'catalog.services.read',
          { arguments: {}, surface: 'web' },
        ),
      ),
    );

    expect(afterCompletedRead).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'T-2b',
        requestId: 'request-d17',
      }),
    );
  });

  it('returns the latest verified analytics snapshot when the CRM read fails', async () => {
    const afterCompletedRead = jest.fn();
    const harness = createHarness({ afterCompletedRead });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-failed' });
    harness.handlerExecute.mockRejectedValue(new Error('crm timeout'));
    harness.executionFindFirst.mockResolvedValue({
      id: 'execution-snapshot',
      encryptedResult: encryptFixture({
        verified: true,
        period: { timezone: 'Europe/Moscow' },
        metrics: { unique_clients: 41 },
      }),
      completedAt: new Date('2026-08-06T12:00:00.000Z'),
    });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(
          { ...customer, role: UserRole.TENANT_OWNER },
          'analytics.business.query',
          {
            arguments: {
              period: 'month_to_date',
              comparison: 'previous_period',
            },
            surface: 'native',
          },
        ),
    );

    expect(result).toMatchObject({
      status: 'completed',
      execution_id: 'execution-snapshot',
      replayed: true,
      stale: true,
      result: {
        verified: true,
        metrics: { unique_clients: 41 },
        freshness: {
          status: 'stale',
          snapshot_at: '2026-08-06T12:00:00.000Z',
          reason: 'ai_tool_execution_failed',
        },
      },
    });
    expect(harness.getLastAuditLogInput()).toEqual(
      expect.objectContaining({
        action: 'ai.tool_execution_stale_replayed',
        entityId: 'execution-failed',
      }),
    );
    expect(afterCompletedRead).not.toHaveBeenCalled();
  });

  it('creates an approval without executing a write tool', async () => {
    const harness = createHarness();
    let capturedApprovalData: Record<string, unknown> = {};
    harness.approvalFindUnique.mockResolvedValue(null);
    harness.approvalCreate.mockImplementation((input: unknown) => {
      capturedApprovalData = record(record(input).data);
      return Promise.resolve(approvalRecord(capturedApprovalData));
    });

    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_12345678' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
    );

    expect(result).toMatchObject({
      status: 'approval_required',
      approval: {
        id: 'approval-a',
        tool_name: 'appointments.own.cancel',
        payload_preview: {
          action: 'cancel_appointment',
          appointment_id: 'appointment_12345678',
        },
      },
      replayed: false,
    });
    expect(harness.handlerExecute).not.toHaveBeenCalled();
    expect(harness.executionCreate).not.toHaveBeenCalled();
    expect(capturedApprovalData.encryptedArguments).toEqual(
      expect.stringMatching(/^encrypted:/),
    );
    expect(capturedApprovalData.payloadHash).toEqual(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('executes an actor-approved write exactly once', async () => {
    const harness = createHarness();
    let createdApproval = approvalRecord({});
    harness.approvalFindUnique
      .mockResolvedValueOnce(null)
      .mockImplementation(() => Promise.resolve(createdApproval));
    harness.approvalCreate.mockImplementation((input: unknown) => {
      createdApproval = approvalRecord(record(record(input).data));
      return Promise.resolve(createdApproval);
    });
    harness.approvalUpdateMany.mockResolvedValue({ count: 1 });
    harness.approvalFindUniqueOrThrow.mockImplementation(() =>
      Promise.resolve({ ...createdApproval, status: 'approved' }),
    );
    harness.membershipFindUnique.mockResolvedValue({
      role: UserRole.CUSTOMER,
      status: 'active',
      user: {
        id: customer.userId,
        status: 'active',
      },
    });
    harness.executionFindUnique.mockResolvedValue(null);
    harness.executionCreate.mockResolvedValue({ id: 'execution-approved' });
    harness.handlerExecute.mockResolvedValue({
      id: 'appointment_12345678',
      status: 'canceled',
    });

    const request = (await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_12345678' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
    )) as { approval: { payload_hash: string } };
    const result = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.approve(customer, createdApproval.id, {
          payloadHash: request.approval.payload_hash,
        }),
    );

    expect(result).toMatchObject({
      status: 'completed',
      execution_id: 'execution-approved',
      result: { id: 'appointment_12345678', status: 'canceled' },
    });
    expect(harness.handlerExecute).toHaveBeenCalledTimes(1);
    expect(harness.policyAssertCanDecide).toHaveBeenCalledTimes(1);
    const approvalUpdateInput = harness.getApprovalUpdateInput();
    expect(record(record(approvalUpdateInput).data).status).toBe('completed');
  });

  it('blocks approval when the immutable payload hash is changed', async () => {
    const harness = createHarness();
    const approval = approvalRecord({ payloadHash: 'a'.repeat(64) });
    harness.approvalFindUnique.mockResolvedValue(approval);

    await expect(
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.approve(customer, approval.id, {
          payloadHash: 'b'.repeat(64),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.approvalUpdateMany).not.toHaveBeenCalled();
    expect(harness.handlerExecute).not.toHaveBeenCalled();
  });

  it('rejects reusing an approval key for a different payload', async () => {
    const harness = createHarness();
    harness.approvalFindUnique.mockResolvedValue(
      approvalRecord({
        payloadHash: 'a'.repeat(64),
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    );

    await expect(
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_87654321' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.approvalCreate).not.toHaveBeenCalled();
    expect(harness.handlerExecute).not.toHaveBeenCalled();
  });

  it('replays a completed approved result without a second domain call', async () => {
    const harness = createHarness();
    let createdApproval = approvalRecord({});
    harness.approvalFindUnique.mockResolvedValue(null);
    harness.approvalCreate.mockImplementation((input: unknown) => {
      createdApproval = approvalRecord(record(record(input).data));
      return Promise.resolve(createdApproval);
    });

    await harness.tenantContext.runAsSystemTenant('tenant-a', () =>
      harness.runtime.execute(customer, 'appointments.own.cancel', {
        arguments: { appointment_id: 'appointment_12345678' },
        surface: 'native',
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    );
    harness.approvalFindUnique.mockResolvedValue({
      ...createdApproval,
      status: 'completed',
    });
    harness.executionFindUnique.mockResolvedValue({
      id: 'execution-replay',
      toolName: 'appointments.own.cancel',
      encryptedResult: encryptFixture({
        id: 'appointment_12345678',
        status: 'canceled',
      }),
    });

    const replay = await harness.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        harness.runtime.execute(customer, 'appointments.own.cancel', {
          arguments: { appointment_id: 'appointment_12345678' },
          surface: 'native',
          idempotencyKey: IDEMPOTENCY_KEY,
        }),
    );

    expect(replay).toMatchObject({
      status: 'completed',
      execution_id: 'execution-replay',
      replayed: true,
      result: { id: 'appointment_12345678', status: 'canceled' },
    });
    expect(harness.handlerExecute).not.toHaveBeenCalled();
    expect(harness.executionCreate).not.toHaveBeenCalled();
  });

  it('fails closed on cross-tenant principals before policy or handlers', async () => {
    const harness = createHarness();

    await expect(
      harness.tenantContext.runAsSystemTenant('tenant-a', () =>
        harness.runtime.execute(
          { ...customer, tenantId: 'tenant-b' },
          'appointments.own.list',
          { arguments: {}, surface: 'web' },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(harness.policyAssertCanExecute).not.toHaveBeenCalled();
    expect(harness.handlerExecute).not.toHaveBeenCalled();
  });
});

function createHarness(
  widgetTrigger?: AiReadWidgetTriggerPort,
  withPersonalContext = true,
) {
  type WriteMock = (input: unknown) => Promise<Record<string, unknown>>;
  const approvalFindUnique = jest.fn();
  const approvalCreate = jest.fn<
    ReturnType<WriteMock>,
    Parameters<WriteMock>
  >();
  const approvalUpdateMany = jest.fn();
  const approvalFindUniqueOrThrow = jest.fn();
  let approvalUpdateInput: unknown;
  const approvalUpdate = jest.fn<ReturnType<WriteMock>, Parameters<WriteMock>>(
    (input) => {
      approvalUpdateInput = input;
      return Promise.resolve({});
    },
  );
  const executionFindUnique = jest.fn();
  const executionFindFirst = jest.fn();
  const executionCreate = jest.fn();
  let executionUpdateInput: unknown;
  const executionUpdate = jest.fn<ReturnType<WriteMock>, Parameters<WriteMock>>(
    (input) => {
      executionUpdateInput = input;
      return Promise.resolve({});
    },
  );
  const membershipFindUnique = jest.fn();
  const clientFindMany = jest.fn().mockResolvedValue([]);
  const personalRevalidate = jest.fn().mockResolvedValue(undefined);
  const personal = {
    kind: 'personal_client',
    clientId: 'verified-client',
    linkId: 'verified-link',
    verificationEvidenceHash: 'a'.repeat(64),
    revalidate: personalRevalidate,
  };
  const personalSelect = jest.fn().mockResolvedValue(personal);
  const availabilityTenant = jest
    .fn()
    .mockResolvedValue({ calendarSource: 'external' });
  const availabilityIntegration = jest.fn().mockResolvedValue({
    id: 'crm',
    provider: 'yclients',
    status: 'active',
    updatedAt: new Date('2026-10-07T00:00:00Z'),
    settingsJson: { companyId: 42 },
  });
  const availabilityBranch = jest
    .fn()
    .mockResolvedValue({ id: 'maya-branch', timezone: 'Europe/Moscow' });
  const prisma = {
    tenant: { findUnique: availabilityTenant },
    crmIntegration: { findUnique: availabilityIntegration },
    branch: { findFirst: availabilityBranch },
    aiApprovalRequest: {
      findUnique: approvalFindUnique,
      create: approvalCreate,
      updateMany: approvalUpdateMany,
      findUniqueOrThrow: approvalFindUniqueOrThrow,
      update: approvalUpdate,
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiToolExecution: {
      findUnique: executionFindUnique,
      findFirst: executionFindFirst,
      create: executionCreate,
      update: executionUpdate,
    },
    membership: { findUnique: membershipFindUnique },
    staff: { findMany: jest.fn().mockResolvedValue([]) },
    crmStaffAccess: { findMany: jest.fn().mockResolvedValue([]) },
    client: { findMany: clientFindMany },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
  } as unknown as PrismaService;
  const tenantContext = new TenantContextService();
  const policyBuildPrincipal = jest.fn(
    (
      tenantId: string,
      userId: string,
      role: UserRole,
      surface: 'native' | 'web' | 'telegram' | 'voice',
    ) => ({ tenantId, userId, role, surface }),
  );
  const policyAssertCanExecute = jest.fn().mockResolvedValue(undefined);
  const policyAssertCanDecide = jest.fn();
  const policy = {
    buildPrincipal: policyBuildPrincipal,
    assertCanExecute: policyAssertCanExecute,
    assertCanDecide: policyAssertCanDecide,
    canDecide: jest.fn().mockReturnValue(false),
    listAllowed: jest.fn().mockResolvedValue([]),
  } as unknown as AiToolPolicyService;
  const handlerExecute = jest.fn();
  const availabilityPreferenceCalendar = jest
    .fn()
    .mockResolvedValue({ branchId: 'maya-branch', timezone: 'Europe/Moscow' });
  const handler = {
    servicePriceReadIdentity: jest.fn().mockResolvedValue('a'.repeat(64)),
    assertStaffScheduleReadScope: jest.fn().mockResolvedValue(undefined),
    resolveReviewCalendarScope: jest.fn(),
    availabilityPreferenceCalendar,
    execute: handlerExecute,
    // Доводка аргументов и обогащение карточки — тождественные для всего,
    // кроме записи расхода; настоящее поведение проверяется в её собственных
    // прогонах, здесь важно только что рантайм их зовёт.
    normalizeArguments: jest.fn(
      (_toolName: string, _principal: unknown, args: unknown) =>
        Promise.resolve(args),
    ),
    enrichApprovalPreview: jest.fn(
      (
        _toolName: string,
        _principal: unknown,
        _args: unknown,
        payload: unknown,
      ) => Promise.resolve(payload),
    ),
  } as unknown as AiToolHandlerService;
  const encryption = {
    encrypt: jest.fn(
      (value: string) =>
        `encrypted:${Buffer.from(value, 'utf8').toString('base64url')}`,
    ),
    decrypt: jest.fn((value: string) =>
      Buffer.from(value.slice('encrypted:'.length), 'base64url').toString(
        'utf8',
      ),
    ),
  } as unknown as EncryptionService;
  let lastAuditLogInput: unknown;
  const auditLogLog = jest.fn((input: unknown): Promise<{ id: string }> => {
    lastAuditLogInput = input;
    return Promise.resolve({ id: 'audit-a' });
  });
  const auditLog = { log: auditLogLog } as unknown as AuditLogService;

  return {
    runtime: new AiToolRuntimeService(
      prisma,
      tenantContext,
      new AiToolRegistryService(),
      policy,
      handler,
      encryption,
      auditLog,
      canonicalReceiptFixture(prisma, encryption),
      widgetTrigger === undefined
        ? undefined
        : ({ get: jest.fn().mockReturnValue(widgetTrigger) } as never),
      withPersonalContext
        ? ({
            select: personalSelect,
          } as unknown as PersonalClientContextService)
        : undefined,
    ),
    tenantContext,
    prisma,
    approvalFindUnique,
    approvalCreate,
    approvalUpdateMany,
    approvalFindUniqueOrThrow,
    approvalUpdate,
    executionFindUnique,
    executionFindFirst,
    executionCreate,
    executionUpdate,
    membershipFindUnique,
    clientFindMany,
    availabilityTenant,
    availabilityIntegration,
    availabilityBranch,
    personalSelect,
    personalRevalidate,
    personal,
    handlerExecute,
    handler,
    availabilityPreferenceCalendar,
    policyAssertCanExecute,
    policyAssertCanDecide,
    getLastAuditLogInput: () => lastAuditLogInput,
    getApprovalUpdateInput: () => approvalUpdateInput,
    getExecutionUpdateInput: () => executionUpdateInput,
  };
}

function approvalRecord(overrides: Record<string, unknown>) {
  const now = new Date('2026-07-15T12:00:00.000Z');
  return {
    id: 'approval-a',
    tenantId: 'tenant-a',
    requestedByUserId: 'customer_12345678',
    requestedByTenantId: 'tenant-a',
    decidedByUserId: null,
    decidedByTenantId: null,
    toolName: 'appointments.own.cancel',
    surface: 'native',
    riskTier: 'medium_write',
    approvalPolicy: 'actor',
    status: 'pending',
    summary: 'Cancel the selected appointment.',
    payloadHash: 'a'.repeat(64),
    payloadPreviewJson: {
      action: 'cancel_appointment',
      appointment_id: 'appointment_12345678',
    },
    encryptedArguments:
      'encrypted:eyJhcHBvaW50bWVudF9pZCI6ImFwcG9pbnRtZW50XzEyMzQ1Njc4In0',
    idempotencyKey: IDEMPOTENCY_KEY,
    expiresAt: new Date(Date.now() + 60_000),
    decidedAt: null,
    executedAt: null,
    errorCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function encryptFixture(value: unknown): string {
  return `encrypted:${Buffer.from(JSON.stringify(value), 'utf8').toString(
    'base64url',
  )}`;
}
