import { randomUUID } from 'node:crypto';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';

describe('NS-1 retained journal date migration and adversarial source [HTTP] [PostgreSQL]', () => {
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
  async function fixture() {
    const tenant = await fx.tenant('NS boundary', CalendarSource.INTERNAL);
    const user = await fx.user(tenant, UserRole.TENANT_OWNER);
    for (const feature of ['ai.owner', 'booking', 'widgets.runtime'] as const)
      await fx.grantFeature(tenant, feature);
    const access = await http.login(tenant.slug, user.email, user.password);
    const response = await http.executeTool(
      access,
      'operations.journal.read',
      { surface: 'web', arguments: { date: '2026-09-24' } },
      randomUUID(),
    );
    expect(response.status).toBe(201);
    const source = (
      response.body as {
        resolution: {
          receipt: {
            envelope: {
              widget_id: string;
              intents: Array<{
                effect: string;
                intent_token: string;
                target: { class: string } | null;
              }>;
            };
          };
        };
      }
    ).resolution.receipt.envelope;
    const intent = source.intents.find((v) => v.target?.class === 'detail')!;
    expect(intent).toBeDefined();
    const record = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: tenant.id,
        widgetId: source.widget_id,
        effect: 'NAVIGATE',
      },
    });
    const submit = () =>
      http.postIntent(access, {
        widget_id: source.widget_id,
        intent_token: intent.intent_token,
      });
    return { tenant, user, access, source, record, submit };
  }
  it('NS-CHECK admits exact detail date and preserves REFINE; all near-miss shapes remain forbidden', async () => {
    const f = await fixture();
    expect(f.record.retainedLocalBusinessDate).toBe('2026-09-24');
    const refine = await db.prisma.widgetIntentRecord.findFirstOrThrow({
      where: {
        tenantId: f.tenant.id,
        widgetId: f.source.widget_id,
        effect: 'REFINE',
      },
    });
    expect(refine.retainedLocalBusinessDate).toBe('2026-09-24');
    for (const data of [
      { targetJson: { class: 'detail', ref: 'fs.other' } },
      { targetJson: { class: 'w', ref: randomUUID() } },
      { sourceCapabilityKey: 'company.business-hours.read' },
      { sourceCapabilitySpace: null },
      { sourceCapabilityKey: null },
      { widgetKind: 'METRIC' },
      { effect: 'CONTROL' },
      { capabilitySpace: 'C9', capabilityKey: 'operations.journal.read' },
      { inputSchemaHash: 'a'.repeat(64) },
    ]) {
      await expect(
        db.prisma.widgetIntentRecord.update({
          where: { id: f.record.id },
          data,
        }),
      ).rejects.toThrow();
      expect(
        await db.prisma.widgetIntentRecord.findUnique({
          where: { id: f.record.id },
        }),
      ).toEqual(f.record);
    }
  });
  it.each([
    'date',
    'erased',
    'expired',
    'body',
    'seal',
    'foreign-principal',
  ] as const)(
    'NS-REFUSE %s cannot project a historical source',
    async (kind) => {
      const f = await fixture();
      if (kind === 'date')
        await db.prisma.widgetIntentRecord.update({
          where: { id: f.record.id },
          data: { retainedLocalBusinessDate: '2026-09-25' },
        });
      if (kind === 'erased')
        await db.prisma.widgetEmission.updateMany({
          where: { tenantId: f.tenant.id, widgetId: f.source.widget_id },
          data: { erasedAt: new Date() },
        });
      if (kind === 'expired')
        await db.prisma.widgetEmission.updateMany({
          where: { tenantId: f.tenant.id, widgetId: f.source.widget_id },
          data: { retentionUntil: new Date(Date.now() + 1) },
        });
      if (kind === 'body')
        await db.prisma.widgetEmission.updateMany({
          where: { tenantId: f.tenant.id, widgetId: f.source.widget_id },
          data: { bodyJson: { tampered: true } },
        });
      if (kind === 'seal')
        await db.prisma.widgetEmission.updateMany({
          where: { tenantId: f.tenant.id, widgetId: f.source.widget_id },
          data: { envelopeSeal: 'forged' },
        });
      let result;
      if (kind === 'foreign-principal') {
        const other = await fx.user(f.tenant, UserRole.TENANT_OWNER);
        const token = await http.login(
          f.tenant.slug,
          other.email,
          other.password,
        );
        result = await http.postIntent(token, {
          widget_id: f.source.widget_id,
          intent_token: f.source.intents.find(
            (v) => v.target?.class === 'detail',
          )!.intent_token,
        });
      } else result = await f.submit();
      expect(result.status).toBe(200);
      expect(result.body).not.toMatchObject({ receipt_outcome: 'ACCEPTED' });
      expect(result.body).toMatchObject({ next_envelope: null });
    },
  );
  it('NS-PARENT rechecks parent availability when the new exact return link is used', async () => {
    const f = await fixture();
    const detail = await f.submit();
    expect(detail.body).toMatchObject({ receipt_outcome: 'ACCEPTED' });
    const next = (
      detail.body as {
        next_envelope: {
          widget_id: string;
          intents: Array<{
            intent_token: string;
            target: { class: string } | null;
          }>;
        };
      }
    ).next_envelope;
    const back = next.intents.find((v) => v.target?.class === 'w')!;
    await db.prisma.widgetEmission.updateMany({
      where: { tenantId: f.tenant.id, widgetId: f.source.widget_id },
      data: { erasedAt: new Date() },
    });
    const result = await http.postIntent(f.access, {
      widget_id: next.widget_id,
      intent_token: back.intent_token,
    });
    expect(result.body).toMatchObject({
      receipt_outcome: 'REFUSED',
      resolved_widget: null,
      next_envelope: null,
    });
  });
});
