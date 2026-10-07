import { ConfigService } from '@nestjs/config';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { OpportunityLifecycleRunner } from '../../src/crm/opportunity-lifecycle.runner';
import { DOMAIN_EVENT_TYPE } from '../../src/domain';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { decodeChatReply } from '../../src/widgets/stores/chat-reply-codec';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './support/fixtures';
import { assertProofDatabase } from './support/proof-db-guard';

import {
  firstOption,
  firstSlot,
  object,
  observe,
  startBooking,
  submit,
} from './support/release-booking-flow';

// Mandatory two-process proof, never an in-memory "restart" fallback. The driver
// creates its own cluster/database, runs prepare, restarts PG, then runs resume.
const stage = process.env.JEST_C9_OCCUPANCY_STAGE;
const receiptPath = process.env.JEST_C9_OCCUPANCY_RECEIPT;
const reportPath = process.env.JEST_C9_OCCUPANCY_REPORT;
if (
  !['prepare', 'resume', 'browser'].includes(stage ?? '') ||
  !receiptPath ||
  !reportPath
)
  throw new Error(
    'Use scripts/c9-occupancy-proof.mjs: explicit stage, private receipt and report required',
  );
const database = assertProofDatabase(process.env);
if (!/^maya_widget_gate_proof_c9occ_[a-z0-9_]+$/.test(database.database))
  throw new Error('C9 occupancy requires its own c9occ proof database');
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
type ChatBody = {
  request_id: string;
  reply: string;
  user_turn: { turnId: string; conversationId: string };
  coordination: {
    run_id: string;
    revision_id: string;
    revision: number;
    current: boolean;
    replayed: boolean;
    scope: string;
  };
  recommendation: {
    outcome: string;
    noSideEffects: boolean;
    executionAuthority: boolean;
    reasoning: string;
    options: Array<{ key: string; title: string }>;
    evidence: {
      workReceiptId: string;
      opportunityRefs: Array<{ sourceType: string; id: string }>;
      asOf: string;
      scheduleRef: string | null;
    };
  };
};
type CarrierObservation = {
  replies: string[];
  exchanges: Array<{ status: number; body: ChatBody }>;
  rendering: string;
  browserAcceptance: false;
};
type Salon = {
  tenant: TenantFixture;
  owner: UserFixture;
  branchId: string;
  appointmentId: string;
  opportunityId: string;
  taskId: string;
  start: string;
  end: string;
};
type Saved = {
  contract: 'maya.c9-occupancy-private-restart/1';
  database: string;
  port: string;
  pid: number;
  postgresStarted: string;
  salon: Salon;
  requestId: string;
  first: ChatBody;
  graph: string;
};

describe('explicit cancellation window [HTTP] [PostgreSQL] [two processes] [native CRM, synthetic transport, zero model]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures, saved: Saved;
  const providerReads: string[] = [];
  const reads: string[] = [],
    unexpectedEdges: string[] = [];
  const observations: Record<string, unknown> = {};
  const touchedTenants: string[] = [];
  const unavailableTenants = new Set<string>();
  let model: jest.SpyInstance;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    // Actual native adapter, only its finite transport is synthetic.
    expect(process.env.YCLIENTS_PARTNER_TOKEN).toBeUndefined();
    jest
      .spyOn(http.app.get(CrmAdapterFactory), 'create')
      .mockImplementation((provider, config) => {
        expect(provider).toBe(CrmProvider.YCLIENTS);
        expect(config.apiToken).toBe(
          'c9-occupancy-synthetic-no-provider-credential',
        );
        expect(touchedTenants).toContain(config.tenantId);
        process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_C9_PARTNER';
        try {
          return new YclientsCRMAdapter({
            ...config,
            baseUrl: `https://${config.tenantId}.synthetic-occupancy.invalid/api/v1`,
          });
        } finally {
          delete process.env.YCLIENTS_PARTNER_TOKEN;
        }
      });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      const tenantId = url.hostname.replace('.synthetic-occupancy.invalid', '');
      if (
        !touchedTenants.includes(tenantId) ||
        url.hostname !== tenantId + '.synthetic-occupancy.invalid' ||
        init?.method !== 'GET' ||
        init.body !== undefined
      ) {
        unexpectedEdges.push('external-or-provider-write');
        throw new Error('Unexpected transport');
      }
      const appointment = await db.prisma.appointment.findFirstOrThrow({
        where: { tenantId, status: 'canceled' },
      });
      const route = url.pathname.replace('/api/v1/', '');
      providerReads.push(route);
      const integration = await db.prisma.crmIntegration.findUniqueOrThrow({
        where: { tenantId },
      });
      const company = (integration.settingsJson as { companyId: number })
        .companyId;
      expect([424242, 424243]).toContain(company);
      const day = appointment.startAt.toISOString().slice(0, 10);
      let data: unknown;
      if (route === `schedule/${company}/71/${day}/${day}`) {
        reads.push('schedule:' + tenantId);
        if (unavailableTenants.has(tenantId))
          throw new Error('Synthetic source unavailable');
        data = [
          {
            date: day,
            is_working: true,
            slots: [{ from: '12:00', to: '13:00' }],
          },
        ];
      } else if (route === `book_times/${company}/71/${day}`) {
        reads.push('availability:' + tenantId);
        expect(url.searchParams.getAll('service_ids[]')).toEqual(['81']);
        const filled = await db.prisma.appointment.count({
          where: {
            tenantId,
            staffExternalId: '71',
            status: 'confirmed',
            blockedStartAt: { lt: appointment.blockedEndAt },
            blockedEndAt: { gt: appointment.blockedStartAt },
          },
        });
        data = filled ? [] : [{ time: '12:00', seance_length: 3600 }];
      } else if (route === `book_services/${company}`) {
        data = {
          services: [
            {
              id: 81,
              title: 'Synthetic service',
              price_min: 1000,
              price_max: 1000,
              seance_length: 3600,
            },
          ],
        };
      } else if (route === `company/${company}/staff`) {
        data = [{ id: 71, name: 'Synthetic master', bookable: true }];
      } else if (route === `service_categories/${company}`) {
        data = [];
      } else {
        unexpectedEdges.push('unknown-provider-read');
        throw new Error('Unexpected synthetic read: ' + route);
      }
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
      });
    });
    model = jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation(() => {
        unexpectedEdges.push('model');
        throw new Error('Exact explicit request must not call a model');
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    // Retain synthetic rows for readback, as C9 has independent RESTRICT/retention
    // ownership. The driver stops only its cluster; it never truncates another DB.
    if (stage === 'resume' || stage === 'browser')
      for (const tenantId of touchedTenants)
        await db.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'cancelled' },
        });
    await http?.close();
    await db?.close();
  });
  async function branchPreviewNegatives() {
    const salon = await makeSalon();
    await fx.bookingSource(salon.tenant, salon.owner, true);
    const token = await login(salon);
    const dto = {
      staffId: '71',
      serviceIds: ['81'],
      start: salon.start,
      branchId: salon.branchId,
    };
    const personal = (route: string, body: object) =>
      request(http.app.getHttpServer())
        .post('/api/personal-client/' + route)
        .set('authorization', 'Bearer ' + token)
        .set('x-maya-authority-context', 'personal_client')
        .set('idempotency-key', randomUUID())
        .send(body);
    const preview = await personal('appointments/preview', dto);
    expect({
      status: preview.status,
      body: preview.body as unknown,
    }).toMatchObject({
      status: 201,
      body: {
        timezone: 'Europe/Moscow',
        start: salon.start,
        availability: 'available_at_read',
      },
    });
    const factsHash = (preview.body as { factsHash: string }).factsHash;
    const settings = (companyId: number, present: boolean) => ({
      companyId,
      currency: 'RUB',
      branchBinding: present
        ? {
            contract: 'maya.crm-branch-binding/1',
            companyId,
            branchId: salon.branchId,
          }
        : null,
    });
    const available = await checkedChat(salon, token);
    const graphBefore = await graph(
      salon.tenant.id,
      available.coordination.run_id,
    );
    // Controlled changes of owned synthetic source state, not A17 owner acceptance.
    await db.prisma.crmIntegration.update({
      where: { tenantId: salon.tenant.id },
      data: { settingsJson: settings(424243, true) },
    });
    const changed = await personal('appointments', {
      ...dto,
      previewFactsHash: factsHash,
    });
    expect({
      status: changed.status,
      body: changed.body as unknown,
    }).toMatchObject({
      status: 409,
      body: { error: { code: 'booking_preview_stale' } },
    });
    await db.prisma.crmIntegration.update({
      where: { tenantId: salon.tenant.id },
      data: { settingsJson: settings(424243, false) },
    });
    const removed = await personal('appointments', {
      ...dto,
      previewFactsHash: factsHash,
    });
    expect({
      status: removed.status,
      body: removed.body as unknown,
    }).toMatchObject({
      status: 503,
      body: { error: { code: 'booking_branch_source_unavailable' } },
    });
    const mark = providerReads.length;
    const historical = await checkedChat(salon, token, available.request_id);
    expect(historical.coordination).toMatchObject({
      revision_id: available.coordination.revision_id,
      replayed: true,
      current: false,
    });
    expect(await graph(salon.tenant.id, available.coordination.run_id)).toBe(
      graphBefore,
    );
    const unavailable = await checkedChat(salon, token);
    expect(unavailable.recommendation.outcome).toBe('UNAVAILABLE');
    expect(unavailable.coordination.current).toBe(false);
    expect(providerReads.length).toBe(mark);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: salon.tenant.id },
      }),
    ).toBe(0);
    expect(
      await db.prisma.appointment.count({
        where: { tenantId: salon.tenant.id },
      }),
    ).toBe(1);
    const lifecycle = await observeLifecycle('removed_binding_source', salon);
    expect(lifecycle.result).toMatchObject({
      completeness: 'provider_failure',
      resolved: 0,
    });
    observations.branchPreview = {
      previewStatus: preview.status,
      branchTimezone: (preview.body as { timezone: string }).timezone,
      companyChangeStatus: changed.status,
      removalStatus: removed.status,
      historicalRevision: historical.coordination.revision,
      historicalCurrent: false,
      newRequestOutcome: unavailable.recommendation.outcome,
      providerReadsAfterRemoval: providerReads.length - mark,
      actionExecutions: 0,
      providerWrites: 0,
    };
  }
  async function cancelledSlotAdmission() {
    const { AiToolRuntimeService } = createRequire(__filename)(
      '../../src/ai-tools/ai-tool-runtime.service',
    ) as typeof import('../../src/ai-tools/ai-tool-runtime.service');
    const runtime = http.app.get(AiToolRuntimeService);
    const original = runtime.execute.bind(runtime);
    const cases = [];
    for (const failureAt of [2, 3]) {
      const s = await startBooking(fx, http);
      touchedTenants.push(s.tenant.id);
      const branch = await db.prisma.branch.create({
        data: {
          tenantId: s.tenant.id,
          name: 'Synthetic internal branch',
          timezone: 'Europe/Moscow',
        },
      });
      await db.prisma.internalProvider.update({
        where: { id: s.source.staffId },
        data: { branchId: branch.id },
      });
      await observe(http, s.token, s.envelope);
      const staff = object(
        (
          await submit(
            http,
            s.token,
            s.envelope,
            'REFINE',
            firstOption(s.envelope),
          )
        ).next_envelope,
      );
      await observe(http, s.token, staff);
      let validations = 0;
      const spy = jest
        .spyOn(runtime, 'execute')
        .mockImplementation((actor, name, dto, internal = {}) =>
          original(actor, name, dto, {
            ...internal,
            onAvailabilityScope: (check) =>
              internal.onAvailabilityScope?.(async () => {
                validations += 1;
                if (validations === failureAt)
                  await db.prisma.branch.update({
                    where: { id: branch.id },
                    data: { timezone: 'UTC' },
                  });
                await check();
              }),
          }),
        );
      let declined: Record<string, unknown>;
      try {
        declined = await submit(
          http,
          s.token,
          staff,
          'REFINE',
          firstOption(staff),
        );
      } finally {
        spy.mockRestore();
      }
      expect(declined.next_envelope ?? null).toBeNull();
      expect(validations).toBe(failureAt);
      const rows = await db.prisma.widgetEmission.findMany({
        where: { tenantId: s.tenant.id, kind: 'TIME_SLOT_SELECTOR' },
        include: { renderReceipts: true },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].lifecycleState).toBe('CANCELLED');
      const slot = object(rows[0].renderReceipts[0].emittedEnvelopeJson);
      const restored = await http.resolveWidgets(s.token, {
        thread_page: { limit: 50 },
      });
      expect(restored.status).toBe(200);
      // Even the original valid sealed DRAFT cannot turn cancelled history into a preview.
      const denied = await submit(
        http,
        s.token,
        slot,
        'DRAFT',
        firstSlot(slot).slot_ref,
      );
      expect(denied.outcome).toBe('EXPIRED');
      expect(
        await db.prisma.widgetEmission.count({
          where: { tenantId: s.tenant.id, kind: 'BOOKING_CONFIRMATION' },
        }),
      ).toBe(0);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: s.tenant.id },
        }),
      ).toBe(0);
      cases.push({
        failureAt,
        state: rows[0].lifecycleState,
        restoreStatus: restored.status,
        draftOutcome: denied.outcome,
        confirmations: 0,
        actionExecutions: 0,
      });
    }
    observations.cancelledSlotAdmission = cases;
  }
  async function postgresStarted() {
    const rows = await db.prisma.$queryRaw<
      Array<{ started: string }>
    >`SELECT pg_postmaster_start_time()::text AS started`;
    return rows[0].started;
  }
  async function makeSalon(expired = false): Promise<Salon> {
    const tenant = await fx.tenant(
      'C9 occupancy synthetic',
      CalendarSource.EXTERNAL,
    );
    touchedTenants.push(tenant.id);
    const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of [
      'ai.consultant',
      'ai.owner',
      'widgets.runtime',
      'booking',
      'booking.customer_app',
      'crm.integration',
      'analytics.business',
    ] as const)
      await fx.grantFeature(tenant, feature);
    await db.prisma.tenant.update({
      where: { id: tenant.id },
      data: { defaultTimezone: 'UTC' },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    });
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + (expired ? -2 : 2));
    start.setUTCHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 3_600_000);
    const asOf = expired ? new Date(start.getTime() - 3_600_000) : new Date();
    // Historical source fixtures let real PostgreSQL clock observe expiry. No
    // Date/DB clock, expiry column, immutable C9 row or production owner is mocked.
    const watchStartedAt = new Date(asOf.getTime() - 120_000);
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        encryptedApiToken: db.encryption.encrypt(
          'c9-occupancy-synthetic-no-provider-credential',
        ),
        watchStartedAt,
        settingsJson: {
          companyId: 424242,
          currency: 'RUB',
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: 424242,
            branchId: branch.id,
          },
        },
      },
    });
    const appointment = await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        staffExternalId: '71',
        serviceIds: ['81'],
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
        occurredAt: new Date(asOf.getTime() - 60_000),
        receivedAt: asOf,
        source: 'yclients',
        ingestionMethod: 'reconciliation',
        observation: 'after_watch_started',
        dedupFingerprint: digest([tenant.id, appointment.id]),
        payload: {},
      },
    });
    const config = http.app.get(ConfigService);
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
    const opportunity = await db.prisma.opportunity.findFirstOrThrow({
      where: { tenantId: tenant.id },
      include: { agentTasks: true },
    });
    expect(opportunity.agentTasks).toHaveLength(1);
    expect(opportunity.agentTasks[0]).toMatchObject({
      status: 'current',
      autonomyLevel: 'L2_5_SHADOW',
    });
    expect(
      await db.prisma.c9Run.count({ where: { tenantId: tenant.id } }),
    ).toBe(0);
    return {
      tenant,
      owner,
      branchId: branch.id,
      appointmentId: appointment.id,
      opportunityId: opportunity.id,
      taskId: opportunity.agentTasks[0].id,
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }
  function login(salon: Salon) {
    return http.login(
      salon.tenant.slug,
      salon.owner.email,
      salon.owner.password,
    );
  }
  /** Exercise the existing C5 system hook. It may persist C5 state, never admit a C9 request. */
  async function observeLifecycle(
    name: string,
    salon: Salon,
    sourceCompleteness: 'complete' | 'partial' = 'complete',
  ) {
    const where = { tenantId: salon.tenant.id };
    const beforeRuns = await db.prisma.c9Run.count({ where });
    const readMark = reads.length;
    const integration = await db.prisma.crmIntegration.findUniqueOrThrow({
      where: { tenantId: salon.tenant.id },
    });
    const config = http.app.get(ConfigService);
    config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'true');
    config.set(
      'OPPORTUNITY_LIFECYCLE_CUTOVER_AT',
      integration.watchStartedAt!.toISOString(),
    );
    let result;
    try {
      result = await http.app
        .get(TenantContextService)
        .runAsSystemTenant(salon.tenant.id, () =>
          http.app.get(OpportunityLifecycleRunner).run({
            tenantId: salon.tenant.id,
            asOf: new Date(),
            sourceCompleteness,
          }),
        );
    } finally {
      config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'false');
    }
    expect(result).toMatchObject({
      status: 'ran',
      actionIntentsExecuted: 0,
      externalSideEffects: 0,
    });
    const opportunities = await db.prisma.opportunity.findMany({ where });
    const tasks = await db.prisma.agentTask.findMany({ where });
    expect(opportunities).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(opportunities[0].id).toBe(salon.opportunityId);
    expect(tasks[0].id).toBe(salon.taskId);
    const afterRuns = await db.prisma.c9Run.count({ where });
    expect(afterRuns).toBe(beforeRuns);
    expect(reads.length - readMark).toBeLessThanOrEqual(2);
    expect(await db.prisma.actionExecution.count({ where })).toBe(0);
    observations[name] = {
      lifecycle: result,
      opportunity: {
        id: opportunities[0].id,
        revision: opportunities[0].revision,
        status: opportunities[0].status,
        terminalAt: opportunities[0].terminalAt,
        terminalReasonCode: opportunities[0].terminalReasonCode,
        terminalEvidenceFingerprint:
          opportunities[0].terminalEvidenceFingerprint,
      },
      task: {
        id: tasks[0].id,
        status: tasks[0].status,
        autonomy: tasks[0].autonomyLevel,
      },
      c9RunsBefore: beforeRuns,
      c9RunsAfter: afterRuns,
      sourceReadCalls: reads.length - readMark,
      actionExecutions: 0,
    };
    return { result, opportunity: opportunities[0], task: tasks[0] };
  }
  /** Real authorized C7 live observation; no invented MeasurementRevision or recovery attribution. */
  async function measureShadow(
    name: string,
    salon: Salon,
    accessToken: string,
    status: 'active' | 'resolved' | 'expired',
  ) {
    const before = await businessState(salon.tenant.id);
    const now = new Date();
    const response = await request(http.app.getHttpServer())
      .get('/api/analytics/measurements')
      .set('authorization', `Bearer ${accessToken}`)
      .query({
        kind: 'execution_funnel',
        from: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
        to: new Date(now.getTime() + 86_400_000).toISOString(),
      });
    expect(response.status).toBe(200);
    const view = response.body as {
      metrics: Array<{ key: string; value: unknown; state: string }>;
      limitations: string[];
    };
    expect(view).toMatchObject({
      contract: 'c7.measurement.read/1',
      mode: 'live',
      revisionId: null,
      completeness: 'PARTIAL',
      attribution: 'NOT_APPLICABLE',
    });
    const metric = (key: string, value: number) =>
      expect(view.metrics.filter((m) => m.key === key)).toEqual([
        expect.objectContaining({ value: String(value), state: 'COMPLETE' }),
      ]);
    metric('opportunity_revision_count', 1);
    metric('opportunity_logical_count', 1);
    for (const candidate of ['active', 'resolved', 'expired', 'superseded'])
      metric(`opportunity_${candidate}_count`, candidate === status ? 1 : 0);
    metric('task_assignment_count', 1);
    metric('task_current_count', status === 'active' ? 1 : 0);
    metric('task_invalidated_count', status === 'active' ? 0 : 1);
    for (const key of [
      'action_admitted_count',
      'action_dry_run_count',
      'action_real_success_count',
      'execution_attempt_count',
    ])
      metric(key, 0);
    expect(view.limitations).toEqual(
      expect.arrayContaining([
        'proposal_admission_denominator_unavailable',
        'incremental_revenue_not_measured',
      ]),
    );
    expect(await businessState(salon.tenant.id)).toBe(before);
    expect(
      await db.prisma.measurementRevision.count({
        where: { tenantId: salon.tenant.id },
      }),
    ).toBe(0);
    observations[name] = view;
  }
  async function businessState(tenantId: string) {
    const where = { tenantId };
    const state = await Promise.all([
      db.prisma.appointment.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.opportunity.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.agentTask.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.domainEvent.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.actionExecution.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.inboxItem.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.marketingCampaign.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.marketingCampaignRecipient.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      db.prisma.marketingDeliveryAttempt.findMany({
        where,
        orderBy: { id: 'asc' },
      }),
      db.prisma.teamMessage.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.operationalAlertRun.findMany({ where, orderBy: { id: 'asc' } }),
      db.prisma.expenseReminderRun.findMany({ where, orderBy: { id: 'asc' } }),
    ]);
    for (const effects of state.slice(4)) expect(effects).toHaveLength(0);
    return digest(state);
  }
  async function graph(tenantId: string, runId: string) {
    const revisions = await db.prisma.c9StrategyRevision.findMany({
      where: { tenantId, runId },
      orderBy: { revision: 'asc' },
      include: { c9PlanSteps: { orderBy: { id: 'asc' } } },
    });
    const receipts = await db.prisma.c9WorkReceipt.findMany({
      where: { tenantId, runId },
      orderBy: { id: 'asc' },
    });
    expect(revisions).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].state).toBe('SETTLED');
    return digest({ revisions, receipts });
  }
  async function carrier(
    accessToken: string,
    requestId: string,
    mode = 'chat',
  ) {
    const baseUrl = await http.listenLoopback();
    return new Promise<CarrierObservation>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.resolve('../maya-carrier-react/test/occupancy-probe.mjs')],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stdout = '',
        stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Owned carrier probe timed out'));
      }, 25_000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (code !== 0)
          return reject(new Error(`Current carrier probe failed: ${stderr}`));
        try {
          resolve(JSON.parse(stdout) as CarrierObservation);
        } catch (error) {
          reject(error as Error);
        }
      });
      child.stdin.end(
        JSON.stringify({ baseUrl, accessToken, requestId, mode }),
      );
    });
  }
  async function checkedChat(
    salon: Salon,
    accessToken: string,
    requestId: string = randomUUID(),
  ) {
    const before = await businessState(salon.tenant.id),
      mark = http.recorder.mark();
    const observed = await carrier(accessToken, requestId);
    expect(await businessState(salon.tenant.id)).toBe(before);
    const businessWrites = http.recorder
      .since(mark)
      .filter(
        (op) =>
          op.write &&
          (op.model
            ? /^(Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder)/.test(
                op.model,
              )
            : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder)/i.test(
                op.sql ?? '',
              )),
      );
    expect(businessWrites).toEqual([]);
    expect(unexpectedEdges).toEqual([]);
    expect(model).not.toHaveBeenCalled();
    const body = observed.exchanges[0].body;
    expect(body.coordination).toMatchObject({
      scope: 'explicit_occupancy',
      revision: 1,
    });
    expect(body.recommendation).toMatchObject({
      noSideEffects: true,
      executionAuthority: false,
      reasoning: 'deterministic',
    });
    expect(body.reply).toContain('Предложение сохранено, версия 1');
    expect(observed.replies).toEqual([body.reply]);
    observations[`${requestId}:${Object.keys(observations).length}`] = observed;
    return body;
  }
  async function browserAcceptance() {
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set('EMAIL_AUTH_PROVIDER', 'debug');
    const salon = await makeSalon(),
      expired = await makeSalon(true);
    const before = await businessState(salon.tenant.id);
    const expiredBefore = await businessState(expired.tenant.id);
    const mark = http.recorder.mark();
    reads.length = 0;
    let first: ChatBody | undefined, firstGraph: string | undefined;
    const expected = [
      'available',
      'history',
      'offline',
      'reconnected',
      'unbound',
      'revoked',
      'expired',
    ];
    const completed: string[] = [];
    const backendOrigin = await http.listenLoopback();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/occupancy-browser-probe.mjs',
          ),
        ],
        {
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        },
      );
      let stderr = '',
        failure: Error | undefined;
      let pending = Promise.resolve();
      const fail = (error: unknown) => {
        failure ??= error instanceof Error ? error : new Error(String(error));
        child.kill('SIGTERM');
      };
      const timer = setTimeout(
        () => fail(new Error('Owned browser acceptance timed out')),
        180_000,
      );
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('message', (raw: unknown) => {
        pending = pending
          .then(async () => {
            const message = raw as {
              type: string;
              name: string;
              body?: ChatBody;
            };
            if (message.type === 'ready') {
              child.send({
                type: 'start',
                backendOrigin,
                ownerEmail: salon.owner.email,
                expiredEmail: expired.owner.email,
                output: path.dirname(reportPath!),
              });
              return;
            }
            expect(message.type).toBe('checkpoint');
            expect(message.name).toBe(expected[completed.length]);
            expect(await businessState(salon.tenant.id)).toBe(before);
            expect(await businessState(expired.tenant.id)).toBe(expiredBefore);
            expect(unexpectedEdges).toEqual([]);
            expect(model).not.toHaveBeenCalled();
            const body = message.body;
            if (body) {
              const currentSalon = message.name === 'expired' ? expired : salon;
              const root = await db.prisma.c9Run.findUniqueOrThrow({
                where: { id: body.coordination.run_id },
              });
              expect(root).toMatchObject({
                tenantId: currentSalon.tenant.id,
                principalJson: { userId: currentSalon.owner.id },
                currentRevision: 1,
              });
              expect(
                body.recommendation.evidence.opportunityRefs.map(
                  (ref) => ref.id,
                ),
              ).toEqual(
                ['expired', 'unbound'].includes(message.name)
                  ? []
                  : [currentSalon.opportunityId, currentSalon.taskId],
              );
              const persisted = await graph(currentSalon.tenant.id, root.id);
              if (message.name === 'available') {
                first = body;
                firstGraph = persisted;
              }
              observations[message.name] = body;
            }
            expect(first).toBeDefined();
            expect(
              await graph(salon.tenant.id, first!.coordination.run_id),
            ).toBe(firstGraph);
            const runCount = await db.prisma.c9Run.count({
              where: { tenantId: salon.tenant.id },
            });
            expect(runCount).toBe(
              ['available', 'history', 'offline'].includes(message.name)
                ? 1
                : message.name === 'reconnected'
                  ? 2
                  : 3,
            );
            expect(reads).toHaveLength(
              ['available', 'history', 'offline'].includes(message.name)
                ? 2
                : 4,
            );
            expect(reads.every((read) => read.endsWith(salon.tenant.id))).toBe(
              true,
            );
            if (message.name === 'reconnected') {
              expect(body!.coordination.run_id).not.toBe(
                first!.coordination.run_id,
              );
              await db.prisma.crmIntegration.update({
                where: { tenantId: salon.tenant.id },
                data: {
                  settingsJson: {
                    companyId: 424242,
                    currency: 'RUB',
                    branchBinding: null,
                  },
                },
              });
            }
            if (message.name === 'unbound') {
              expect(body!.recommendation.outcome).toBe('UNAVAILABLE');
              expect(body!.coordination.current).toBe(false);
              await db.prisma.membership.updateMany({
                where: { tenantId: salon.tenant.id, userId: salon.owner.id },
                data: { status: 'suspended' },
              });
            }
            completed.push(message.name);
            child.send({ type: 'continue:' + message.name });
          })
          .catch(fail);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        void pending.then(() => {
          if (failure) reject(failure);
          else if (code !== 0)
            reject(new Error(`Browser child exited ${code}: ${stderr}`));
          else resolve();
        });
      });
    });
    expect(completed).toEqual(expected);
    const writes = http.recorder
      .since(mark)
      .filter(
        (op) =>
          op.write &&
          (op.model
            ? /^(Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder)/.test(
                op.model,
              )
            : /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(?:Appointment|Opportunity|AgentTask|DomainEvent|Action|Inbox|Notification|Delivery|Outbox|Marketing|Team|OperationalAlert|ExpenseReminder)/i.test(
                op.sql ?? '',
              )),
      );
    expect(writes).toEqual([]);
    writeFileSync(
      reportPath!,
      JSON.stringify(
        {
          contract: 'maya.explicit-occupancy-browser-http-pg-proof/1',
          stage,
          pid: process.pid,
          postgresStarted: await postgresStarted(),
          database: database.database,
          syntheticCrmAdapter: false,
          nativeYclientsAdapter: true,
          syntheticProviderTransport: true,
          tenantTimezone: 'UTC',
          selectedBranchTimezone: 'Europe/Moscow',
          externalProviderAcceptance: false,
          realModelAcceptance: false,
          providerReadCalls: providerReads.length,
          providerWriteCalls: 0,
          modelCalls: model.mock.calls.length,
          businessWrites: writes.length,
          browserAcceptance: true,
          completed,
          observations,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  }
  it('persists one request/proposal/evidence graph, resumes without reread, isolates and refuses revoked authority', async () => {
    if (stage === 'browser') {
      await browserAcceptance();
      return;
    }
    if (stage === 'prepare') {
      const salon = await makeSalon(),
        accessToken = await login(salon),
        requestId = randomUUID();
      const duplicate = await observeLifecycle('same_event_repeat', salon);
      expect(duplicate.result.duplicateAttemptsCollapsed).toBe(1);
      expect(duplicate.opportunity.status).toBe('active');
      expect(duplicate.task.status).toBe('current');
      await measureShadow('c7_detected', salon, accessToken, 'active');
      reads.length = 0;
      const first = await checkedChat(salon, accessToken, requestId);
      expect(first.recommendation.outcome).toBe('AVAILABLE');
      expect(first.reply).toContain('12:00');
      expect(first.reply).toContain('13:00');
      expect(first.reply).toContain('Europe/Moscow');
      expect(first.coordination).toMatchObject({
        current: true,
        replayed: false,
      });
      expect(
        first.recommendation.evidence.opportunityRefs.map(
          (ref) => ref.sourceType,
        ),
      ).toEqual(['Opportunity', 'AgentTask']);
      expect(
        first.recommendation.evidence.opportunityRefs.map((ref) => ref.id),
      ).toEqual([salon.opportunityId, salon.taskId]);
      const root = await db.prisma.c9Run.findUniqueOrThrow({
        where: { id: first.coordination.run_id },
      });
      expect(root).toMatchObject({
        tenantId: salon.tenant.id,
        principalJson: { userId: salon.owner.id },
        currentRevision: 1,
      });
      const work = await db.prisma.c9WorkReceipt.findUniqueOrThrow({
        where: { id: first.recommendation.evidence.workReceiptId },
      });
      expect(work).toMatchObject({
        tenantId: salon.tenant.id,
        runId: root.id,
        state: 'SETTLED',
      });
      expect(reads.sort()).toEqual([
        'availability:' + salon.tenant.id,
        'schedule:' + salon.tenant.id,
      ]);
      const persisted = await graph(salon.tenant.id, first.coordination.run_id);
      reads.length = 0;
      const repeat = await checkedChat(salon, accessToken, requestId);
      expect(repeat.coordination).toEqual({
        ...first.coordination,
        current: false,
        replayed: true,
      });
      expect(repeat.reply).toContain(
        'сохранённый результат предыдущей проверки',
      );
      expect(await graph(salon.tenant.id, first.coordination.run_id)).toBe(
        persisted,
      );
      expect(reads).toEqual([]);
      await measureShadow('c7_proposed', salon, accessToken, 'active');
      saved = {
        contract: 'maya.c9-occupancy-private-restart/1',
        database: database.database,
        port: database.port,
        pid: process.pid,
        postgresStarted: await postgresStarted(),
        salon,
        requestId,
        first,
        graph: persisted,
      };
      // Synthetic login password only; no bearer/session token. Never publish this file.
      writeFileSync(receiptPath, JSON.stringify(saved), {
        mode: 0o600,
        flag: 'wx',
      });
    } else {
      saved = JSON.parse(readFileSync(receiptPath, 'utf8')) as Saved;
      expect(saved.contract).toBe('maya.c9-occupancy-private-restart/1');
      expect([saved.database, saved.port]).toEqual([
        database.database,
        database.port,
      ]);
      expect(process.pid).not.toBe(saved.pid);
      expect(await postgresStarted()).not.toBe(saved.postgresStarted);
      touchedTenants.push(saved.salon.tenant.id);
      const salon = saved.salon,
        accessToken = await login(salon);
      expect(
        await graph(salon.tenant.id, saved.first.coordination.run_id),
      ).toBe(saved.graph);
      const replay = await checkedChat(salon, accessToken, saved.requestId);
      expect(replay.coordination).toEqual({
        ...saved.first.coordination,
        current: false,
        replayed: true,
      });
      expect(replay.recommendation.evidence).toEqual(
        saved.first.recommendation.evidence,
      );
      expect(replay.reply).toContain(
        'сохранённый результат предыдущей проверки',
      );
      expect(await graph(salon.tenant.id, replay.coordination.run_id)).toBe(
        saved.graph,
      );
      expect(reads).toEqual([]);
      const history = await carrier(accessToken, randomUUID(), 'history');
      // The current carrier restores only the latest completion per user turn.
      // Older immutable replies remain in the encrypted audit history.
      expect(history.replies).toEqual([replay.reply]);
      const auditReplies = await db.prisma.widgetTimelineTurn.findMany({
        where: {
          tenantId: salon.tenant.id,
          conversationId: saved.first.user_turn.conversationId,
          role: 'assistant',
        },
        orderBy: { turnIndex: 'asc' },
      });
      expect(
        auditReplies.map((turn) =>
          decodeChatReply(db.encryption, turn.textContent!),
        ),
      ).toEqual([saved.first.reply, replay.reply]);
      observations.persistedHistory = history;
      const restarted = await observeLifecycle(
        'same_event_after_restart',
        salon,
      );
      expect(restarted.result.duplicateAttemptsCollapsed).toBe(1);
      expect(restarted.opportunity.status).toBe('active');
      await measureShadow('c7_after_restart', salon, accessToken, 'active');
      expect(await graph(salon.tenant.id, replay.coordination.run_id)).toBe(
        saved.graph,
      );
      reads.length = 0;
      // Simulate later provider state, not a booking action by MAYA. Only this
      // fixture client inserts the occupied interval; the next HTTP request reads it.
      await db.prisma.appointment.create({
        data: {
          tenantId: salon.tenant.id,
          branchId: salon.branchId,
          staffExternalId: '71',
          serviceIds: ['81'],
          status: 'confirmed',
          startAt: salon.start,
          endAt: salon.end,
          blockedStartAt: salon.start,
          blockedEndAt: salon.end,
          source: 'external',
          crmProvider: CrmProvider.YCLIENTS,
          crmExternalId: randomUUID(),
        },
      });
      const occupied = await checkedChat(salon, accessToken);
      expect(occupied.recommendation.outcome).toBe('OCCUPIED');
      expect(occupied.coordination.run_id).not.toBe(replay.coordination.run_id);
      expect(
        occupied.recommendation.options.map((option) => option.key),
      ).toEqual(['c9.no_action']);
      expect(reads).toHaveLength(2);
      const partial = await observeLifecycle(
        'occupied_partial_source',
        salon,
        'partial',
      );
      expect(partial.result).toMatchObject({
        completeness: 'partial',
        resolved: 0,
      });
      expect(partial.opportunity.status).toBe('active');
      expect(partial.task.status).toBe('current');
      unavailableTenants.add(salon.tenant.id);
      try {
        const unavailable = await observeLifecycle(
          'occupied_source_unavailable',
          salon,
        );
        expect(unavailable.result).toMatchObject({
          completeness: 'provider_failure',
          resolved: 0,
        });
        expect(unavailable.opportunity.status).toBe('active');
      } finally {
        unavailableTenants.delete(salon.tenant.id);
      }
      const resolved = await observeLifecycle(
        'occupied_complete_source',
        salon,
      );
      expect(resolved.result.resolved).toBe(1);
      expect(resolved.opportunity).toMatchObject({
        status: 'resolved',
        terminalReasonCode: 'provider_schedule_or_available_slot_absent',
        terminalEvidenceFingerprint: expect.stringMatching(
          /^resolution-evidence_[a-f0-9]{64}$/,
        ) as unknown,
      });
      expect(resolved.task.status).toBe('invalidated');
      await measureShadow('c7_resolved', salon, accessToken, 'resolved');
      reads.length = 0;
      expect(
        (await checkedChat(salon, accessToken)).recommendation.outcome,
      ).toBe('CLOSED');
      expect(reads).toEqual([]);
      expect(await graph(salon.tenant.id, replay.coordination.run_id)).toBe(
        saved.graph,
      );
      const expired = await makeSalon(true),
        expiredToken = await login(expired);
      reads.length = 0;
      expect(
        (await checkedChat(expired, expiredToken)).recommendation.outcome,
      ).toBe('EXPIRED');
      expect(reads).toEqual([]);
      const expiredState = await observeLifecycle(
        'expired_current_source',
        expired,
      );
      expect(expiredState.result.expired).toBe(1);
      expect(expiredState.opportunity).toMatchObject({
        status: 'expired',
        terminalReasonCode: 'family_expiry_reached',
      });
      expect(expiredState.task.status).toBe('invalidated');
      await measureShadow('c7_expired', expired, expiredToken, 'expired');
      const repeatedExpiry = await observeLifecycle('expired_repeat', expired);
      expect(repeatedExpiry.result).toMatchObject({
        expired: 0,
        currentTasks: 0,
      });
      await branchPreviewNegatives();
      await cancelledSlotAdmission();
      reads.length = 0;
      const foreign = await request(http.app.getHttpServer())
        .get(`/api/orchestration/runs/${replay.coordination.run_id}`)
        .set('authorization', `Bearer ${expiredToken}`);
      expect(foreign.status).toBe(400);
      expect(foreign.body).toMatchObject({ message: 'c9_run_authority' });
      expect(JSON.stringify(foreign.body)).not.toContain(salon.appointmentId);
      const runsBefore = await db.prisma.c9Run.count({
        where: { tenantId: salon.tenant.id },
      });
      await db.prisma.membership.updateMany({
        where: { tenantId: salon.tenant.id, userId: salon.owner.id },
        data: { status: 'suspended' },
      });
      const revoked = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('authorization', `Bearer ${accessToken}`)
        .send({
          surface: 'web',
          requestId: saved.requestId,
          messages: [{ role: 'user', content: 'Проверь окна после отмен' }],
        });
      expect([401, 403]).toContain(revoked.status);
      const revokedRun = await request(http.app.getHttpServer())
        .get(`/api/orchestration/runs/${replay.coordination.run_id}`)
        .set('authorization', `Bearer ${accessToken}`);
      expect([401, 403]).toContain(revokedRun.status);
      expect(
        await db.prisma.c9Run.count({ where: { tenantId: salon.tenant.id } }),
      ).toBe(runsBefore);
      expect(reads).toEqual([]);
      observations.refusals = {
        foreignTenant: foreign.status,
        revokedChat: revoked.status,
        revokedRun: revokedRun.status,
      };
      expect(unexpectedEdges).toEqual([]);
    }
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          contract: 'maya.explicit-occupancy-http-pg-proof/1',
          stage,
          pid: process.pid,
          postgresStarted: await postgresStarted(),
          database: database.database,
          syntheticCrmAdapter: false,
          nativeYclientsAdapter: true,
          syntheticProviderTransport: true,
          tenantTimezone: 'UTC',
          selectedBranchTimezone: 'Europe/Moscow',
          c10AutonomousAdmission: false,
          c6ShadowAdmission: false,
          c7Measurement:
            'existing execution_funnel live read, no stored revision',
          c9Initiator: 'explicit authenticated owner chat only',
          externalProviderAcceptance: false,
          providerReadCalls: providerReads.length,
          providerWriteCalls: 0,
          modelCalls: model.mock.calls.length,
          browserAcceptance: false,
          observations,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  });
});
