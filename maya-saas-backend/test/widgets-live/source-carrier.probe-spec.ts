/** Read-only presentation integration probe over isolated internal-calendar fixtures.
 * Reaches the unmodified runtime/React drawer. No production grant or external provider. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { localCalendarDate } from '../../src/owner-reports/owner-reports.time';
import { applyWidgetsLiveEnvironment } from './support/environment';
import { bootFixtureContext } from './support/bootstrap';
import { bootHttp, fixturesForHttp } from './support/http-bootstrap';
const object = (v: unknown): Record<string, unknown> => {
  assert(v !== null && typeof v === 'object' && !Array.isArray(v));
  return v as Record<string, unknown>;
};
async function main(mode: 'personal' | 'journal' | 'journal-populated') {
  applyWidgetsLiveEnvironment();
  const db = await bootFixtureContext();
  const http = await bootHttp();
  const fx = fixturesForHttp(db, http);
  const observations: unknown[] = [];
  try {
    const baseUrl = await http.listenLoopback();
    const tenant = await fx.tenant(
      'Approved source carrier probe',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(
      tenant,
      mode === 'personal' ? UserRole.CLIENT : UserRole.TENANT_OWNER,
    );
    const bookingSource =
      mode === 'personal'
        ? await fx.binView().bookingSource(tenant, user)
        : null;
    for (const feature of [
      'widgets.runtime',
      'ai.consultant',
      'ai.owner',
      'booking',
      'booking.customer_app',
      'crm.integration',
    ] as const)
      await fx.grantFeature(tenant, feature);
    // Fixture data only, inside the harness's owned synthetic tenant. No CRM IO.
    const expectedJournal: string[] = [];
    const expectedJournalTitles: string[] = [];
    let journalBefore: unknown = null;
    if (mode === 'journal-populated') {
      const service = await db.prisma.internalService.create({
        data: {
          tenantId: tenant.id,
          name: 'Учебная стрижка',
          price: 1500,
          durationMinutes: 60,
        },
      });
      const provider = await db.prisma.internalProvider.create({
        data: {
          tenantId: tenant.id,
          displayName: 'Учебный мастер',
          active: true,
        },
      });
      const inactive = await db.prisma.internalService.create({
        data: {
          tenantId: tenant.id,
          name: 'Архивная учебная услуга',
          price: 9900,
          durationMinutes: 30,
          active: false,
        },
      });
      const otherTenant = await fx.tenant(
        'Foreign journal catalogue',
        CalendarSource.INTERNAL,
      );
      const foreign = await db.prisma.internalService.create({
        data: {
          tenantId: otherTenant.id,
          name: 'FOREIGN-SERVICE-NOT-FOR-RENDER',
          price: 9900,
          durationMinutes: 30,
        },
      });
      for (const [hour, serviceIds, title, source] of [
        [7, [service.id], 'Учебная стрижка', 'internal'],
        [
          9,
          [inactive.id, service.id],
          'Архивная учебная услуга, Учебная стрижка',
          'internal',
        ],
        [11, [foreign.id, 'deleted-synthetic-service'], 'Запись', 'internal'],
        [13, [service.id], 'Запись', 'external'],
      ] as const) {
        const startAt = new Date(
          `2026-09-24T${String(hour).padStart(2, '0')}:00:00Z`,
        );
        const endAt = new Date(startAt.getTime() + 3600000);
        await db.prisma.appointment.create({
          data: {
            tenantId: tenant.id,
            source,
            staffExternalId: provider.id,
            serviceIds: [...serviceIds],
            startAt,
            endAt,
            blockedStartAt: startAt,
            blockedEndAt: endAt,
            status: 'confirmed',
            totalPriceKopecks: 12345,
            notes: 'SYNTHETIC-PRIVATE-NOTE-NOT-FOR-RENDER',
          },
        });
        expectedJournal.push(
          `2026-09-24 · ${hour + 3}:00–${hour + 4}:00 · Europe/Moscow`,
        );
        expectedJournalTitles.push(title);
      }
      journalBefore = await db.prisma.appointment.findMany({
        where: { tenantId: tenant.id },
        orderBy: { id: 'asc' },
      });
    }
    const accessToken = await http.login(
      tenant.slug,
      user.email,
      user.password,
    );
    const initial = await http.executeTool(
      accessToken,
      mode === 'personal' ? 'catalog.services.read' : 'operations.journal.read',
      {
        arguments: mode === 'personal' ? {} : { date: '2026-09-24' },
        surface: 'web',
      },
      randomUUID(),
    );
    assert.equal(initial.status, 201);
    const envelope = object(
      object(object(initial.body).resolution).receipt,
    ).envelope;
    const observed = await new Promise<unknown>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          path.resolve(
            'test/widgets-live/support/shell-approved-source-probe.mjs',
          ),
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (v: Buffer) => {
        stdout += v.toString();
      });
      child.stderr.on('data', (v: Buffer) => {
        stderr += v.toString();
      });
      child.once('error', reject);
      child.once('close', (code) => {
        try {
          const result = object(JSON.parse(stdout) as unknown);
          const message =
            typeof result.error === 'string'
              ? result.error
              : stderr || 'missing success';
          assert.equal(code, 0, `carrier probe ${mode}: ${message}`);
          assert.equal(result.pass, true, `carrier probe ${mode}: ${message}`);
          resolve(result);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      child.stdin.end(
        JSON.stringify({
          mode: mode === 'personal' ? 'personal' : 'journal',
          expectedJournal,
          expectedJournalTitles,
          baseUrl,
          accessToken,
          tenantName: tenant.slug,
          envelope,
          // An explicit synthetic test-driver READ after the real date question;
          // never an automatic date inferred by the shell or a model proof.
          availabilityRequest:
            bookingSource === null
              ? null
              : {
                  date: localCalendarDate(
                    'Europe/Moscow',
                    new Date(Date.now() + 2 * 86_400_000),
                  ),
                  staff_id: bookingSource.staffId,
                  service_ids: [bookingSource.serviceId],
                },
        }),
      );
    });
    if (mode === 'personal') {
      const state = await fx.binView().bookingProofState(tenant);
      assert.equal(state.appointments.length, 1);
      if (object(observed).createRescheduleCancel === true) {
        assert.equal(state.appointments[0].status, 'canceled');
        assert.equal(state.executions.length, 3);
      }
    }
    if (mode === 'journal-populated') {
      const state = await fx.binView().bookingProofState(tenant);
      assert.equal(
        state.appointments.length,
        4,
        'read/detail cannot create bookings',
      );
      assert.equal(
        state.executions.length,
        0,
        'read/detail cannot dispatch an action',
      );
      assert.equal(state.memberships[0].role, UserRole.TENANT_OWNER);
      assert.deepEqual(
        await db.prisma.appointment.findMany({
          where: { tenantId: tenant.id },
          orderBy: { id: 'asc' },
        }),
        journalBefore,
        'journal and detail reads must not alter stored visits',
      );
    }
    observations.push(observed);
    const out = process.env.GITHUB_SOURCE_PROBE_OUT;
    if (!out) throw new Error('explicit report path required');
    fs.writeFileSync(
      `${out}.${mode}.json`,
      JSON.stringify(
        {
          contract: 'maya.approved-source-carrier-observation/1',
          observations,
        },
        null,
        2,
      ) + '\n',
    );
    assert(
      observations.every(
        (v) =>
          object(v).createRescheduleCancel === true ||
          object(object(v).fullscreen ?? {}).phase === 'open',
      ),
      'source carrier integration incomplete; see observation receipt',
    );
  } finally {
    await fx.teardown();
    await http.close();
    await db.close();
  }
}
it.each(['personal', 'journal', 'journal-populated'] as const)(
  'FBE2E approved %s production source through the unchanged carrier',
  main,
  120_000,
);
