/** Finite synthetic sources for the frozen authored development corpus.
 * Auth/policy/C7/C8/Opportunity owners stay real. These fixtures authorize no provider effect. */
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../../src/common/domain.enums';
import type { MayaFeatureKey } from '../../../src/common/feature-catalog';
import { DOMAIN_EVENT_TYPE } from '../../../src/domain';
import { MeasurementReportReader } from '../../../src/measurement/measurement.report';
import { OpportunityLifecycleRunner } from '../../../src/crm/opportunity-lifecycle.runner';
import {
  Package5Wave1ExecutableService,
  Package5Wave1ShadowService,
} from '../../../src/package5-wave1/package5-wave1.service';
import { TenantContextService } from '../../../src/tenancy/tenant-context.service';
import type { FixtureContext } from './bootstrap';
import type { HttpHarness } from './http-bootstrap';
import type { Fixtures, TenantFixture, UserFixture } from './fixtures';

export type CorpusCase = {
  id: string;
  role: string;
  group: string;
  variant: string;
  userTurns: string[];
  fixture: { clock: string };
};
export type CandidateSource = {
  item: CorpusCase;
  tenant: TenantFixture;
  user: UserFixture;
  token: string;
  company: string;
  branchId: string;
  features: MayaFeatureKey[];
  sourceRefs: Array<{ owner: string; id: string; status: string }>;
  privateValues: string[];
  startsAt: string;
  endsAt: string;
  occupied: boolean;
  reads: string[];
  clockBinding: Record<string, unknown>;
};
const roles: Record<string, UserRole> = {
  owner: UserRole.TENANT_OWNER,
  admin: UserRole.ADMINISTRATOR,
  client: UserRole.CLIENT,
  employee: UserRole.EMPLOYEE,
};
const features: Record<string, MayaFeatureKey[]> = {
  booking: [
    'ai.consultant',
    'booking',
    'booking.customer_app',
    'crm.integration',
    'widgets.runtime',
  ],
  personal: [
    'ai.consultant',
    'booking',
    'booking.customer_app',
    'crm.integration',
    'widgets.runtime',
  ],
  admin: ['ai.admin', 'booking', 'crm.integration', 'widgets.runtime'],
  staff_config: [
    'ai.admin',
    'ai.owner',
    'booking',
    'crm.integration',
    'widgets.runtime',
  ],
  bi: ['ai.owner', 'analytics.business', 'widgets.runtime'],
  lifecycle: [
    'ai.owner',
    'analytics.business',
    'customers.core',
    'widgets.runtime',
  ],
  occupancy: [
    'ai.owner',
    'analytics.business',
    'booking',
    'crm.integration',
    'widgets.runtime',
  ],
  goods: ['ai.owner', 'commerce.store', 'crm.integration', 'widgets.runtime'],
};
export async function bindCandidateSource(
  db: FixtureContext,
  http: HttpHarness,
  fx: Fixtures,
  item: CorpusCase,
  sources: Map<string, CandidateSource>,
): Promise<CandidateSource> {
  const internal = ['booking', 'personal', 'bi', 'lifecycle'].includes(
    item.group,
  );
  const tenant = await fx.tenant(
    'Development corpus ' + item.id,
    internal ? CalendarSource.INTERNAL : CalendarSource.EXTERNAL,
  );
  const user = await fx.user(tenant, roles[item.role]);
  for (const feature of features[item.group])
    await fx.grantFeature(tenant, feature);
  await db.prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      defaultTimezone: 'Europe/Moscow',
      currentPeriodEnd: new Date('2099-01-01'),
    },
  });
  const branch = await db.prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Synthetic authorized branch',
      timezone: 'Europe/Moscow',
    },
  });
  const now = new Date();
  const tomorrow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now.getTime() + 86400000));
  const source: CandidateSource = {
    item,
    tenant,
    user,
    token: '',
    company: String(sources.size + 88100),
    branchId: branch.id,
    features: features[item.group],
    sourceRefs: [],
    privateValues: [tenant.id, user.id, branch.id, user.email],
    startsAt: `${tomorrow}T17:00:00+03:00`,
    endsAt: `${tomorrow}T17:30:00+03:00`,
    occupied: item.group === 'occupancy' && item.variant === 'negative',
    reads: [],
    clockBinding: {
      authoredClock: item.fixture.clock,
      runtimeClock: now.toISOString(),
      mode: 'REAL_APP_AND_PG_CLOCKS_RELATIVE_FIXTURE_DATES_BOUND_EXPLICITLY',
      businessTimezone: 'Europe/Moscow',
      tomorrow,
      absoluteOctoberPeriod: '2026-10-01/2026-10-31',
      absolutePeriodNotShifted: true,
      corpusTurnsUnchanged: true,
    },
  };
  sources.set(tenant.id, source);
  if (!internal) {
    const integration = await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: CrmProvider.YCLIENTS,
        status: 'active',
        encryptedApiToken: db.encryption.encrypt(
          'CANDIDATE_SYNTHETIC_PRIVATE_TOKEN_NEVER_TRANSMIT',
        ),
        watchStartedAt: new Date(now.getTime() - 120000),
        settingsJson: {
          companyId: source.company,
          syntheticTenantId: tenant.id,
          // C5/C9 must qualify the selected branch through the same canonical
          // metadata owner even with this older synthetic domain-port adapter.
          // Other corpus groups keep their existing unbound-source negatives.
          ...(item.group === 'occupancy'
            ? {
                branchBinding: {
                  contract: 'maya.crm-branch-binding/1',
                  companyId: Number(source.company),
                  branchId: branch.id,
                },
              }
            : {}),
        },
      },
    });
    source.sourceRefs.push({
      owner: 'CRM_SYNTHETIC_YCLIENTS_EDGE',
      id: integration.id,
      status: 'CURRENT_READS_ONLY',
    });
    source.privateValues.push(
      'CANDIDATE_SYNTHETIC_PRIVATE_TOKEN_NEVER_TRANSMIT',
    );
  }
  if (['booking', 'personal'].includes(item.group)) {
    const booking = await fx.bookingSource(tenant, user, true);
    await db.prisma.internalService.update({
      where: { id: booking.serviceId },
      data: { name: 'Мужская стрижка' },
    });
    await db.prisma.internalProvider.update({
      where: { id: booking.staffId },
      data: { displayName: 'Артём' },
    });
    await db.prisma.internalAvailabilityRule.updateMany({
      where: { tenantId: tenant.id },
      data: { startMinute: 1020, endMinute: 1200 },
    });
    const other = await db.prisma.internalProvider.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Максим',
        active: true,
        slotIntervalMinutes: 30,
      },
    });
    await db.prisma.internalProviderService.create({
      data: {
        tenantId: tenant.id,
        providerId: other.id,
        serviceId: booking.serviceId,
      },
    });
    await db.prisma.internalAvailabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        tenantId: tenant.id,
        providerId: other.id,
        weekday,
        startMinute: 1020,
        endMinute: 1200,
      })),
    });
    source.privateValues.push(booking.serviceId, booking.staffId, other.id);
    source.sourceRefs.push({
      owner: 'INTERNAL_CATALOG',
      id: booking.serviceId,
      status: 'SYNTHETIC_VERIFIED_CLIENT_LINK_AND_TWO_STAFF',
    });
    if (item.group === 'personal') {
      const own = await db.prisma.client.findFirstOrThrow({
        where: { tenantId: tenant.id, userId: user.id },
      });
      const foreign = await db.prisma.client.create({
        data: { tenantId: tenant.id },
      });
      for (const client of [
        foreign,
        ...(item.variant === 'negative' ? [] : [own]),
      ]) {
        const start = new Date(source.startsAt),
          end = new Date(source.endsAt);
        const row = await db.prisma.appointment.create({
          data: {
            tenantId: tenant.id,
            mayaClientId: client.id,
            source: 'internal',
            staffExternalId: client.id === own.id ? booking.staffId : other.id,
            serviceIds: [booking.serviceId],
            status: 'confirmed',
            startAt: start,
            endAt: end,
            blockedStartAt: start,
            blockedEndAt: end,
          },
        });
        source.sourceRefs.push({
          owner: 'PERSONAL_CLIENT',
          id: row.id,
          status: client.id === own.id ? 'OWN' : 'OTHER_CLIENT_DENIED',
        });
        source.privateValues.push(row.id, client.id);
      }
    }
  }
  if (item.role === 'employee') {
    const staff = await fx.staff(tenant, user, 'Synthetic employee');
    await db.prisma.staffProviderLink.create({
      data: {
        tenantId: tenant.id,
        staffId: staff.id,
        provider: CrmProvider.YCLIENTS,
        externalId: '71',
      },
    });
    await db.prisma.crmStaffAccess.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        externalStaffId: '71',
        staffId: staff.id,
        encryptedDisplayName: db.encryption.encrypt('Synthetic employee'),
        role: UserRole.EMPLOYEE,
        status: 'active',
      },
    });
    source.sourceRefs.push({
      owner: 'CRM_STAFF_ACCESS',
      id: staff.id,
      status: 'SELF_ONLY',
    });
  }
  if (item.group === 'staff_config' && item.variant === 'negative') {
    await db.prisma.membership.update({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      data: { branchId: branch.id },
    });
    const outside = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic unavailable branch',
        timezone: 'Europe/Moscow',
      },
    });
    source.privateValues.push(outside.id);
    source.sourceRefs.push({
      owner: 'MEMBERSHIP_BRANCH_SCOPE',
      id: outside.id,
      status: 'OUTSIDE_MEMBERSHIP_BRANCH_PUBLIC_READ_DENIAL_UNPROVEN',
    });
  }
  const contacts = { address: 'Тестовый адрес, дом 1', city: 'Тестовый город' };
  await db.prisma.brandingSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      appName: 'Тестовый салон',
      contactDetailsJson: contacts,
    },
    update: { appName: 'Тестовый салон', contactDetailsJson: contacts },
  });
  const currentUser = await db.prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  if (currentUser.phone) source.privateValues.push(currentUser.phone);
  source.token = await http.login(tenant.slug, user.email, user.password);
  const run = <T>(fn: () => Promise<T>) =>
    http.app.get(TenantContextService).runAsSystemTenant(tenant.id, fn);
  if (item.group === 'bi') {
    if (item.variant !== 'negative') {
      const start = new Date('2026-10-02T12:00:00Z'),
        end = new Date('2026-10-02T13:00:00Z');
      await db.prisma.appointment.create({
        data: {
          tenantId: tenant.id,
          source: 'internal',
          staffExternalId: 'synthetic',
          serviceIds: [],
          startAt: start,
          endAt: end,
          blockedStartAt: start,
          blockedEndAt: end,
          attendance: 'arrived',
          totalPriceKopecks: 12345,
          currency: 'RUB',
        },
      });
      const report = await run(() =>
        http.app.get(MeasurementReportReader).snapshot(
          tenant.id,
          'candidate-' + randomUUID(),
          {
            from: '2026-10-01T00:00:00+03:00',
            // The report reader converts this inclusive instant with +1 ms.
            // Keep the exact local month frame; observed coverage remains asOf.
            to: '2026-10-31T23:59:59.999+03:00',
          },
          now,
        ),
      );
      if (!report.revisionId) throw new Error('candidate_c7_revision_missing');
      source.sourceRefs.push({
        owner: 'C7',
        id: report.revisionId,
        status:
          now < new Date('2026-11-01T00:00:00+03:00')
            ? 'PUBLISHED_PERIOD_STILL_OPEN_NOT_FULL_MONTH_ACCEPTANCE'
            : 'PUBLISHED_SYNTHETIC',
      });
    } else
      source.sourceRefs.push({
        owner: 'C7',
        id: 'absent',
        status: 'MISSING_PERIOD_NO_ESTIMATE',
      });
  }
  if (item.group === 'lifecycle') {
    const policy = {
      version: 1,
      valueMeasures: [],
      predictionTargets: [],
      dormancyRules: [
        {
          ruleKey: 'barber_cadence',
          serviceScope: [],
          elapsed: { unit: 'day', count: 30 },
          comparison: 'gt',
          evidence: 'proven_attendance',
          minimumCoverage: 'PARTIAL',
        },
      ],
      rankingObjectives: [],
      minimumEvidence: [],
      exclusions: {
        serviceScope: [],
        branchIds: [],
        subjectStates: [],
        requiredFeatures: [],
      },
      opportunityAdmission: { enabled: false, rules: [] },
      modelUse: [],
    };
    await run(async () =>
      http.app.get(Package5Wave1ExecutableService).execute(
        await http.app
          .get(Package5Wave1ShadowService)
          .buildGoverned(
            tenant.id,
            user.id,
            'tenant_business_configuration',
            'candidate-' + randomUUID(),
            randomUUID(),
            {
              confirmed: true,
              namespace: 'c8_valuation',
              expectedRevision: 0,
              previousRevisionId: null,
              content: policy,
            },
          ),
      ),
    );
    const client = await db.prisma.client.create({
      data: { tenantId: tenant.id },
    });
    const start = new Date(now.getTime() - 40 * 86400000),
      end = new Date(start.getTime() + 3600000);
    await db.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        mayaClientId: client.id,
        source: 'internal',
        staffExternalId: 'synthetic',
        serviceIds: [],
        startAt: start,
        endAt: end,
        blockedStartAt: start,
        blockedEndAt: end,
        attendance: 'arrived',
        totalPriceKopecks: 12345,
        currency: 'RUB',
      },
    });
    const result = await request(http.app.getHttpServer())
      .post('/api/analytics/valuations/compute')
      .set('Authorization', `Bearer ${source.token}`)
      .send({
        subjectKind: 'client',
        subjectId: client.id,
        capability: 'dormancy/barber_cadence',
        branchIds: [],
      });
    if (result.status !== 201)
      throw new Error('candidate_c8_fixture_failed:' + result.status);
    source.sourceRefs.push({
      owner: 'C8',
      id: (result.body as { id: string }).id,
      status: 'PUBLISHED_SYNTHETIC_POLICY_SIGNAL',
    });
    source.privateValues.push(client.id);
    if (item.variant === 'negative')
      await db.prisma.membership.update({
        where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
        data: { status: 'suspended' },
      });
  }
  if (item.group === 'occupancy' && item.variant !== 'finance_schedule_only') {
    const start = new Date(source.startsAt),
      end = new Date(source.endsAt);
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
        occurredAt: new Date(now.getTime() - 60000),
        receivedAt: now,
        source: 'yclients',
        ingestionMethod: 'reconciliation',
        observation: 'after_watch_started',
        dedupFingerprint: createHash('sha256')
          .update(tenant.id + appointment.id)
          .digest('hex'),
        payload: {},
      },
    });
    const config = http.app.get(ConfigService);
    config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'true');
    config.set(
      'OPPORTUNITY_LIFECYCLE_CUTOVER_AT',
      new Date(now.getTime() - 120000).toISOString(),
    );
    try {
      await run(() =>
        http.app.get(OpportunityLifecycleRunner).run({
          tenantId: tenant.id,
          asOf: now,
          sourceCompleteness: 'complete',
        }),
      );
    } finally {
      config.set('OPPORTUNITY_LIFECYCLE_ENABLED', 'false');
    }
    const rows = await db.prisma.opportunity.findMany({
      where: { tenantId: tenant.id },
    });
    for (const row of rows)
      source.sourceRefs.push({
        owner: 'OPPORTUNITY',
        id: row.id,
        status: source.occupied ? 'OCCUPIED' : 'CURRENT_SYNTHETIC_CANCELLATION',
      });
    if (!source.occupied && !rows.length)
      throw new Error('candidate_opportunity_missing');
  }
  return source;
}
