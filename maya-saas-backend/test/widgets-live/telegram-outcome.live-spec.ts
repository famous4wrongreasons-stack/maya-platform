import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CommunicationDeliveryService } from '../../src/communication-delivery/communication-delivery.service';
import { ActionEngineRuntimeService } from '../../src/action-engine';
import { TenantContextService } from '../../src/tenancy/tenant-context.service';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { WIDGETS_LIVE_TEST_LITERALS } from './support/environment';

describe('single Telegram outcome [PostgreSQL] [real Action Engine] [fake provider edge]', () => {
  let db: FixtureContext,
    http: HttpHarness,
    fx: Fixtures,
    service: CommunicationDeliveryService;
  const tenants: string[] = [];
  beforeAll(async () => {
    db = await bootFixtureContext();
    http = await bootHttp();
    fx = fixturesForHttp(db, http);
    service = new CommunicationDeliveryService(
      db.prisma,
      http.app.get(ActionEngineRuntimeService),
      new ConfigService({
        ...WIDGETS_LIVE_TEST_LITERALS,
        MAYA_INBOX_BRIDGE_TOKEN: 'single-telegram-proof-only-bridge-token',
        MAYA_PRIVACY_TELEGRAM_EXECUTOR_URL:
          'http://telegram.invalid/privacy-proof',
      }),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    for (const id of tenants)
      await db.prisma.tenant.update({
        where: { id },
        data: { status: 'cancelled' },
      });
    await http?.close();
    await db?.close();
  });
  it.each([
    [408, { error: 'invalid_request' }, 'UNKNOWN'],
    [400, { error: 'upstream_timeout' }, 'UNKNOWN'],
    [200, { message_id: 'not-a-provider-reference' }, 'UNKNOWN'],
    [400, { error: 'invalid_request' }, 'FAILED'],
    [200, { message_id: '123' }, 'ACCEPTED'],
  ])(
    'HTTP %s yields durable %s without a second provider attempt',
    async (status, body, state) => {
      const tenant = await fx.tenant('single Telegram outcome');
      tenants.push(tenant.id);
      await fx.grantFeature(tenant, 'notifications.core');
      const send = jest.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        if (url !== 'http://telegram.invalid/privacy-proof')
          throw new Error('Unexpected external I/O');
        return Promise.resolve(new Response(JSON.stringify(body), { status }));
      });
      const event = `proof:${randomUUID()}`;
      const run = () =>
        http.app.get(TenantContextService).runAsPublicTenant(tenant.id, () =>
          service.deliverPrivacyTelegram({
            tenantId: tenant.id,
            telegramChatId: '91010',
            sourceEventId: event,
          }),
        );
      if (state === 'ACCEPTED')
        expect(await run()).toMatchObject({
          status: 'accepted',
          providerReference: '123',
        });
      else await expect(run()).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
      const execution = await db.prisma.actionExecution.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          capability: 'communication.operational-single.privacy.execute.v1',
        },
      });
      expect(execution.state).toBe(state === 'ACCEPTED' ? 'SUCCEEDED' : state);
      const leaf = await db.prisma.marketingCampaignRecipient.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          campaign: { actionExecutionId: execution.id },
        },
      });
      expect(leaf.deliveryState).toBe(state);
      if (state === 'UNKNOWN')
        expect(leaf.reconciliationState).toBe('MANUAL_REQUIRED');
      await run().catch(() => undefined);
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        await db.prisma.actionExecution.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(1);
      expect(
        await db.prisma.marketingDeliveryAttempt.count({
          where: { tenantId: tenant.id },
        }),
      ).toBe(1);
    },
  );
});
