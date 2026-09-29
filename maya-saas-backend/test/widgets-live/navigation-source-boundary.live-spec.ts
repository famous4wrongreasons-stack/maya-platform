import { randomUUID } from 'node:crypto';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { INTENT_TEMPLATE_REGISTRY } from '../../src/widgets/emission/intent-template.registry';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

describe('Production navigation source boundary — STOP proof, not clause closure [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext, http: HttpHarness, fx: Fixtures;
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
  });
  afterAll(async () => {
    await fx?.teardown();
    await http?.close();
    await db?.close();
  });
  it('NAV-SCHEMA-STOP the existing exact journal date cannot be retained on a NAVIGATE record', async () => {
    const tenant = await fx.tenant(
      'NAV persistence boundary',
      CalendarSource.INTERNAL,
    );
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of ['ai.owner', 'booking', 'widgets.runtime'] as const)
      await fx.grantFeature(tenant, feature);
    const token = await http.login(tenant.slug, user.email, user.password);
    const source = await http.executeTool(
      token,
      'operations.journal.read',
      { surface: 'web', arguments: { date: '2026-09-24' } },
      randomUUID(),
    );
    expect(source.status).toBe(201);
    const record = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        effect: 'REFINE',
        capabilityKey: 'operations.journal.read',
      },
    });
    expect(record.retainedLocalBusinessDate).toBe('2026-09-24');
    // Adversarial attempt against the current CHECK, in the isolated proof tenant.
    // It must fail; this is not presented as a production-minted NAVIGATE record.
    await expect(
      db.prisma.widgetIntentRecord.update({
        where: { id: record.id },
        data: {
          effect: 'NAVIGATE',
          capabilitySpace: null,
          capabilityKey: null,
          targetJson: { class: 'detail', ref: 'fs.calendar' },
          sourceCapabilitySpace: 'C9',
          sourceCapabilityKey: 'operations.journal.read',
        },
      }),
    ).rejects.toThrow('WidgetIntentRecord_journal_date_scope_check');
    expect(
      await db.prisma.widgetIntentRecord.findUnique({
        where: { id: record.id },
      }),
    ).toEqual(record);
    expect(
      Object.values(INTENT_TEMPLATE_REGISTRY).filter(
        (row) =>
          row.effect === 'NAVIGATE' &&
          (row.target?.class === 'detail' || row.target?.class === 'w'),
      ),
    ).toEqual([]);
  }, 120_000);
});
