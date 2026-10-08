import type {
  Fixtures,
  TenantFixture,
} from '../../widgets-live/support/fixtures';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AiCoreModelService } from '../../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../../src/crm/crm-adapter.factory';
import type {
  CRMAdapter,
  StaffScheduleSlot,
} from '../../../src/crm/crm-adapter.interface';
import { staffScheduleRevision } from '../../../src/crm/staff-schedule.utils';
import { servicePriceSnapshot } from '../../../src/crm/yclients-service-price.contract';
import { OpportunityLifecycleRunner } from '../../../src/crm/opportunity-lifecycle.runner';
import { DOMAIN_EVENT_TYPE } from '../../../src/domain';
import { TenantContextService } from '../../../src/tenancy/tenant-context.service';
import { bootFixtureContext } from '../../widgets-live/support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
} from '../../widgets-live/support/http-bootstrap';
import { occupancyFixtureEdge } from '../../widgets-live/support/c9-occupancy-fixture-edge';
import { releaseProof } from '../../widgets-live/support/widget-release-proof';
import { profileCommand } from '../../widgets-live/support/widget-profile-proof';

export const INTEGRATION_PROMPTS = Object.freeze({
  general: 'Здравствуйте',
  occupancy: 'Проверь окна после отмен',
  price: 'Поставь цену услуги «Стрижка» 2500 рублей',
  schedule: 'Сделай Антону Соколову выходной завтра',
});

/** Synthetic CRM boundary only. Auth, C5 lifecycle, C9, timeline, AE and release
 * owners are real. No network provider/model, no candidate certification. */
export async function developmentIntegrationFixture(
  setupEntitlements: (
    fixtures: Fixtures,
    tenant: TenantFixture,
  ) => Promise<void>,
) {
  const db = await bootFixtureContext();
  let http: Awaited<ReturnType<typeof bootHttp>>;
  try {
    http = await bootHttp();
  } catch (error) {
    await db.close();
    throw error;
  }
  const fx = fixturesForHttp(db, http);
  const config = http.app.get(ConfigService);
  const unexpected: string[] = [];
  const states = new Map<
    string,
    {
      price: number;
      priceWrites: number;
      scheduleWrites: number;
      slots: StaffScheduleSlot[];
      start: Date;
      end: Date;
      branchId: string;
      priceUnknown: boolean;
      occupied: boolean;
    }
  >();
  const owned: string[] = [];
  let modelCalls = 0;
  jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    unexpected.push('external_fetch');
    throw new Error('Combined synthetic fixture refuses all external fetch');
  });
  jest
    .spyOn(http.app.get(AiCoreModelService), 'decide')
    .mockImplementation((input) => {
      modelCalls++;
      const text = input.messages
        .filter((message) => message.role === 'user')
        .at(-1)?.content;
      if (
        !(
          [INTEGRATION_PROMPTS.general, INTEGRATION_PROMPTS.price] as string[]
        ).includes(text ?? '')
      ) {
        unexpected.push('unexpected_model_turn');
        throw new Error(
          'Only exact general/pricing turns may use the scripted model',
        );
      }
      return Promise.resolve({
        reply:
          text === INTEGRATION_PROMPTS.general
            ? 'Здравствуйте. Чем помочь?'
            : 'Подготовлю изменение цены.',
        toolCall:
          text === INTEGRATION_PROMPTS.price
            ? { name: 'catalog.service.price.update', arguments: {} }
            : null,
        provider: 'openai',
        model: 'SCRIPTED_SYNTHETIC_COMBINED',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    });
  jest
    .spyOn(http.app.get(CrmAdapterFactory), 'create')
    .mockImplementation((provider, configuration) => {
      if (
        provider !== CrmProvider.YCLIENTS ||
        configuration.apiToken !== 'combined-synthetic-no-credential'
      )
        throw new Error('Only the owned synthetic CRM integration is admitted');
      const tenantId = String(configuration.settings?.syntheticTenantId);
      const state = states.get(tenantId);
      if (!state) throw new Error('Foreign synthetic CRM tenant');
      const bound = (requested: string) => {
        if (requested !== tenantId) throw new Error('Cross-tenant CRM access');
      };
      const day = (staffId: string, date: string) => {
        if (staffId !== '71') throw new Error('Foreign staff');
        return {
          staff_id: staffId,
          date,
          is_working: state.slots.length > 0,
          slots: state.slots.map((slot) => ({ ...slot })),
          revision: staffScheduleRevision(staffId, date, state.slots),
        };
      };
      const snapshot = () =>
        servicePriceSnapshot(
          {
            id: 201,
            company_id: 99101,
            title: 'Стрижка',
            booking_title: 'Стрижка',
            price_min: state.price,
            price_max: state.price,
            category_id: 11,
            duration: 1800,
            active: 1,
            is_chain: false,
            is_price_managed_only_in_chain: false,
            is_multi: false,
            tax_variant: 1,
            vat_id: 2,
            is_need_limit_date: false,
            seance_search_start: 0,
            seance_search_finish: 86400,
            step: 900,
            seance_search_step: 900,
            technical_break_duration: 300,
            staff: [{ id: 71, seance_length: 1800 }],
          },
          '99101',
          '201',
          'RUB',
        );
      const edge: Pick<
        CRMAdapter,
        | 'getServices'
        | 'getStaff'
        | 'getServicePriceSnapshot'
        | 'updateServiceFixedPrice'
        | 'getStaffScheduleDay'
        | 'previewStaffScheduleDayChange'
        | 'applyStaffScheduleDayChange'
        | 'getAvailableSlots'
      > = {
        getServices: (requested) => {
          bound(requested);
          return Promise.resolve([
            {
              id: '201',
              name: 'Стрижка',
              price: state.price,
              duration_minutes: 30,
              currency: 'RUB',
            },
          ]);
        },
        getStaff: (requested) => {
          bound(requested);
          return Promise.resolve([{ id: '71', name: 'Антон Соколов' }]);
        },
        getServicePriceSnapshot: (serviceId) => {
          if (serviceId !== '201') throw new Error('Foreign service');
          if (state.priceUnknown && state.priceWrites)
            throw new Error('Synthetic readback unavailable');
          return Promise.resolve(snapshot());
        },
        updateServiceFixedPrice: (input) => {
          if (
            input.serviceId !== '201' ||
            input.expectedRevision !== snapshot().revision
          )
            throw new Error('Stale synthetic service revision');
          state.priceWrites++;
          state.price = input.priceMinor / 100;
          if (state.priceUnknown)
            throw new Error('Synthetic response lost after dispatch');
          return Promise.resolve(snapshot());
        },
        getStaffScheduleDay: (input) => {
          bound(input.tenantId);
          return Promise.resolve(day(input.staffId, input.date));
        },
        previewStaffScheduleDayChange: (input) => {
          bound(input.tenantId);
          const current = day(input.staffId, input.date);
          return Promise.resolve({
            current,
            proposed: {
              ...current,
              slots: input.slots,
              is_working: input.slots.length > 0,
            },
            conflict_times: [],
          });
        },
        applyStaffScheduleDayChange: (input) => {
          bound(input.tenantId);
          if (
            input.expectedRevision !== day(input.staffId, input.date).revision
          )
            throw new Error('Stale schedule');
          state.scheduleWrites++;
          state.slots = input.slots;
          return Promise.resolve({
            ...day(input.staffId, input.date),
            verified: true,
            existing_appointments_preserved: true,
          });
        },
        getAvailableSlots: (input) => {
          bound(input.tenantId);
          if (
            input.staffId !== '71' ||
            input.branchId !== state.branchId ||
            input.serviceIds?.join(',') !== '201'
          )
            throw new Error('Availability source scope mismatch');
          return Promise.resolve(
            state.occupied
              ? []
              : [
                  {
                    staff_id: '71',
                    branch_id: state.branchId,
                    start: state.start.toISOString(),
                    end: state.end.toISOString(),
                  },
                ],
          );
        },
      };
      return occupancyFixtureEdge(edge as CRMAdapter, (key) =>
        unexpected.push(key),
      );
    });
  async function salon() {
    const tenant = await fx.tenant(
      'Combined synthetic development',
      CalendarSource.EXTERNAL,
    );
    owned.push(tenant.id);
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    await setupEntitlements(fx, tenant);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'Europe/Moscow' },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    });
    const staff = await fx.staff(tenant, owner, 'Антон Соколов');
    await db.prisma.staff.update({
      where: { id: staff.id },
      data: { branchId: branch.id },
    });
    await db.prisma.staffProviderLink.create({
      data: {
        tenantId: tenant.id,
        staffId: staff.id,
        provider: CrmProvider.YCLIENTS,
        externalId: '71',
      },
    });
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 2);
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000),
      asOf = new Date(),
      watchStartedAt = new Date(asOf.getTime() - 120000);
    const state = {
      price: 2000,
      priceWrites: 0,
      scheduleWrites: 0,
      slots: [{ from: '10:00', to: '20:00' }],
      start,
      end,
      branchId: branch.id,
      priceUnknown: false,
      occupied: false,
    };
    states.set(tenant.id, state);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        watchStartedAt,
        encryptedApiToken: db.encryption.encrypt(
          'combined-synthetic-no-credential',
        ),
        settingsJson: {
          syntheticTenantId: tenant.id,
          companyId: '99101',
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: '99101',
            branchId: branch.id,
          },
          currency: 'RUB',
        },
      },
    });
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        staffExternalId: '71',
        serviceIds: ['201'],
        status: 'canceled',
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        source: 'external',
        crmProvider: CrmProvider.YCLIENTS,
        crmExternalId: randomUUID(),
      },
    });
    await db.prisma.domainEvent.create({
      data: {
        tenantId: tenant.id,
        type: DOMAIN_EVENT_TYPE.appointmentRemoved,
        entityType: 'appointment',
        entityId: appointment.id,
        occurredAt: new Date(asOf.getTime() - 60000),
        receivedAt: asOf,
        source: 'yclients',
        ingestionMethod: 'reconciliation',
        observation: 'after_watch_started',
        dedupFingerprint: randomUUID(),
        payload: {},
      },
    });
    config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'true');
    config.set(
      'OPPORTUNITY_LIFECYCLE_CUTOVER_AT',
      watchStartedAt.toISOString(),
    );
    try {
      const result = await http.app
        .get(TenantContextService)
        .runAsSystemTenant(tenant.id, () =>
          http.app
            .get(OpportunityLifecycleRunner)
            .run({ tenantId: tenant.id, asOf, sourceCompleteness: 'complete' }),
        );
      expect(result).toMatchObject({
        status: 'ran',
        detectedNow: 1,
        actionIntentsExecuted: 0,
        externalSideEffects: 0,
      });
    } finally {
      config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'false');
    }
    return { tenant, owner, branch, state, appointment };
  }
  type Salon = Awaited<ReturnType<typeof salon>>;
  async function restrict(s: Salon) {
    // Existing synthetic mechanism fixture; no real identities, candidate cert or production grant.
    const operator = await fx.user(s.tenant, UserRole.PLATFORM_OWNER);
    await db.prisma.user.update({
      where: { id: operator.id },
      data: { tenantId: null },
    });
    const login = await request(http.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: operator.email, password: operator.password });
    expect(login.status).toBe(201);
    const token = (login.body as { access_token: string }).access_token;
    const proof = releaseProof(process.env.DATABASE_URL!, operator.id);
    for (const key of [
      'WIDGET_RELEASE_ENVIRONMENT',
      'WIDGET_RELEASE_CANDIDATE_SHA',
      'WIDGET_RELEASE_TRUST_JSON',
    ])
      config.set(key, proof.config.get(key));
    const base = `/api/platform/widget-release/${s.tenant.id}`;
    const status = await request(http.app.getHttpServer())
      .get(base + '/status')
      .set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    const result = await request(http.app.getHttpServer())
      .post(base + '/grant')
      .set('Authorization', `Bearer ${token}`)
      .send(
        profileCommand(
          proof,
          s.tenant.id,
          (status.body as { version: string }).version,
        ),
      );
    expect(result.status).toBe(201);
  }
  const login = (s: Salon) =>
    http.login(s.tenant.slug, s.owner.email, s.owner.password);
  const businessState = (s: Salon, includeActions = true) => {
    const where = { tenantId: s.tenant.id },
      orderBy = { id: 'asc' as const };
    return Promise.all([
      db.prisma.appointment.findMany({ where, orderBy }),
      db.prisma.opportunity.findMany({ where, orderBy }),
      db.prisma.agentTask.findMany({ where, orderBy }),
      db.prisma.domainEvent.findMany({ where, orderBy }),
      includeActions
        ? db.prisma.actionExecution.findMany({ where, orderBy })
        : Promise.resolve(null),
      db.prisma.inboxItem.findMany({ where, orderBy }),
      db.prisma.marketingCampaign.findMany({ where, orderBy }),
      db.prisma.marketingCampaignRecipient.findMany({ where, orderBy }),
      db.prisma.marketingDeliveryAttempt.findMany({ where, orderBy }),
      db.prisma.teamMessage.findMany({ where, orderBy }),
      db.prisma.operationalAlertRun.findMany({ where, orderBy }),
      db.prisma.expenseReminderRun.findMany({ where, orderBy }),
    ]);
  };
  const businessWrites = (mark: number, allowActionChain = false) => {
    const family = allowActionChain
      ? 'Appointment|Opportunity|AgentTask|DomainEvent|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder'
      : 'Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder';
    return http.recorder
      .since(mark)
      .filter(
        (op) =>
          op.write &&
          (op.model
            ? new RegExp('^(' + family + ')').test(op.model)
            : new RegExp(
                '\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+"?(?:' +
                  family +
                  ')',
                'i',
              ).test(op.sql ?? '')),
      );
  };

  return {
    db,
    http,
    fx,
    config,
    salon,
    restrict,
    login,
    businessState,
    businessWrites,
    unexpected,
    modelCalls: () => modelCalls,
    async close() {
      try {
        for (const id of owned)
          await db.prisma.tenant.update({
            where: { id },
            data: { status: 'cancelled' },
          });
      } finally {
        jest.restoreAllMocks();
        await http.close();
        await db.close();
      }
    },
  };
}
