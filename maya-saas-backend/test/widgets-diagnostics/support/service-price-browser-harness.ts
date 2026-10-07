import type {
  Fixtures,
  TenantFixture,
} from '../../widgets-live/support/fixtures';
/**
 * Owned, opt-in browser session. Real AppModule/auth/HTTP/AE/PG and YclientsCRMAdapter;
 * only the model selection, email delivery and external YCLIENTS transport are synthetic.
 * The browser must use the actual React email sign-in and chat/widget submission routes.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ConfigService } from '@nestjs/config';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../../src/common/domain.enums';
import { EmailAuthDeliveryService } from '../../../src/auth/email-auth-delivery.service';
import { AiCoreModelService } from '../../../src/ai-tools/ai-core-model.service';
import { assertNoEnvFiles } from '../../widgets-live/support/environment';
import { assertProofDatabase } from '../../widgets-live/support/proof-db-guard';
import {
  bootFixtureContext,
  type FixtureContext,
} from '../../widgets-live/support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from '../../widgets-live/support/http-bootstrap';

const DATABASE = 'maya_widget_gate_proof_service_price_browser_20261006';
const PORT = '56347';
const PARTNER = 'synthetic-service-price-browser-partner-only';
const SERVICE_ID = '201';
const CASES = ['confirmed', 'rejected', 'unknown'] as const;
type CaseName = (typeof CASES)[number];
type ProviderRow = ReturnType<typeof service>;
type CaseState = {
  name: CaseName;
  tenantId: string;
  tenantSlug: string;
  userId: string;
  email: string;
  companyId: string;
  token: string;
  row: ProviderRow;
  writes: number;
  readsAfterWrite: number;
  nonPriceChecks: boolean[];
};

function service(companyId: string) {
  return {
    id: Number(SERVICE_ID),
    company_id: Number(companyId),
    title: 'Стрижка',
    booking_title: 'Стрижка',
    price_min: 2000,
    price_max: 2000,
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
    comment: 'Synthetic browser proof, preserve non-price fields',
    discount: 7,
    weight: 4,
  };
}

function runDirectory(): string {
  const requested = process.env.WIDGETS_EVIDENCE_DIR;
  if (!requested)
    throw new Error(
      'Set WIDGETS_EVIDENCE_DIR to a fresh output/playwright/service-price-live-* directory',
    );
  const dir = resolve(requested);
  const workspace = resolve(__dirname, '../../../..');
  if (
    dirname(dir) !== resolve(workspace, 'output/playwright') ||
    !/^service-price-live-[a-zA-Z0-9_-]+$/.test(basename(dir))
  )
    throw new Error(
      'Browser run directory must be an owned output/playwright/service-price-live-* directory',
    );
  mkdirSync(dir, { recursive: true });
  if (realpathSync(dir) !== dir)
    throw new Error(
      'Browser run directory must not redirect through a symlink',
    );
  for (const file of [
    'ready.json',
    'mailbox.json',
    'state.json',
    'STOP',
    'SNAPSHOT',
    'RECOVER_UNKNOWN_PROVIDER',
  ])
    if (existsSync(resolve(dir, file)))
      throw new Error(`Fresh browser run required: ${file} already exists`);
  return dir;
}

/** Starts only when explicitly run through service-price-browser.browser-spec.ts. */
export async function runServicePriceBrowserHarness(
  setupEntitlements: (
    fixtures: Fixtures,
    tenant: TenantFixture,
  ) => Promise<void>,
): Promise<void> {
  const admitted = assertProofDatabase();
  const connection = new URL(admitted.connectionString);
  if (
    admitted.mode !== 'local' ||
    admitted.database !== DATABASE ||
    admitted.port !== PORT ||
    decodeURIComponent(connection.username) !== 'pricing_proof'
  )
    throw new Error(
      `Browser harness requires its dedicated ${DATABASE} on 127.0.0.1:${PORT} as pricing_proof`,
    );
  assertNoEnvFiles();
  const runDir = runDirectory();
  const write = (file: string, value: unknown) => {
    const destination = resolve(runDir, file);
    writeFileSync(`${destination}.tmp`, JSON.stringify(value, null, 2) + '\n', {
      mode: 0o600,
    });
    renameSync(`${destination}.tmp`, destination);
  };
  const event = (file: string, value: unknown) =>
    appendFileSync(resolve(runDir, file), JSON.stringify(value) + '\n', {
      mode: 0o600,
    });
  const states: CaseState[] = [];
  const ownedTenantIds: string[] = [];
  const unexpected: Array<{ at: string; kind: string; target: string }> = [];
  const mailbox: Array<{
    email: string;
    code: string;
    created_at: string;
    expires_in_minutes: number;
  }> = [];
  const realFetch = globalThis.fetch;
  let db: FixtureContext | undefined,
    http: HttpHarness | undefined,
    provider: Server | undefined;
  let providerOrigin = '',
    modelCalls = 0,
    snapshotSequence = 0;
  let stopReason = 'startup_failed';
  let unknownProviderRecovered = false;
  const bad = (kind: string, target: string) => {
    unexpected.push({ at: new Date().toISOString(), kind, target });
    write('unexpected-requests.json', unexpected);
  };
  const snapshot = async (reason: string) => {
    if (!db) return;
    const cases = [];
    for (const state of states) {
      const [actions, approvals, receipts, sessions] = await Promise.all([
        db.prisma.actionExecution.findMany({
          where: { tenantId: state.tenantId },
          select: {
            id: true,
            capability: true,
            state: true,
            executionAttemptCount: true,
            finalOutcomeCode: true,
            safeResultSummaryJson: true,
            finalizedAt: true,
          },
        }),
        db.prisma.aiApprovalRequest.findMany({
          where: { tenantId: state.tenantId },
          select: {
            id: true,
            toolName: true,
            status: true,
            payloadHash: true,
            expiresAt: true,
            errorCode: true,
          },
        }),
        db.prisma.widgetIntentReceipt.findMany({
          where: { tenantId: state.tenantId },
          select: {
            id: true,
            widgetId: true,
            outcome: true,
            refusalCode: true,
            actionReceiptRef: true,
            submittedAt: true,
          },
        }),
        db.prisma.authSession.count({ where: { userId: state.userId } }),
      ]);
      cases.push({
        name: state.name,
        tenant_id: state.tenantId,
        user_id: state.userId,
        provider: {
          patch_count: state.writes,
          reads_after_patch: state.readsAfterWrite,
          current_price_rubles: state.row.price_min,
          max_price_rubles: state.row.price_max,
          non_price_preservation_checks: state.nonPriceChecks,
          readback_recovered:
            state.name === 'unknown' && unknownProviderRecovered,
        },
        actions,
        approvals,
        receipts,
        session_count: sessions,
      });
    }
    const value = {
      contract: 'maya.service-price-browser-state/1',
      synthetic: true,
      browser_verdict: 'NOT_ASSESSED',
      observed_at: new Date().toISOString(),
      reason,
      model: { scripted: true, calls: modelCalls },
      cases,
      unexpected_requests: unexpected,
    };
    write('state.json', value);
    write(`state-${String(++snapshotSequence).padStart(3, '0')}.json`, value);
  };
  const providerReply = async (req: IncomingMessage) => {
    const path = new URL(req.url ?? '/', providerOrigin).pathname;
    const match =
      /^\/api\/v1\/(?:user\/permissions\/(\d+)|company\/(\d+)\/services(?:\/(\d+))?|(?:book_services|service_categories)\/(\d+))$/.exec(
        path,
      );
    const state = match
      ? states.find((s) => s.companyId === (match[1] ?? match[2] ?? match[4]))
      : undefined;
    if (
      !state ||
      req.headers.authorization !== `Bearer ${PARTNER}, User ${state.token}`
    ) {
      bad('provider_request_refused', `${req.method} ${path}`);
      return { code: 403, data: null };
    }
    if (match![3] && match![3] !== SERVICE_ID) return { code: 404, data: null };
    if (req.method === 'GET') {
      if (match![1])
        return {
          code: 200,
          data: {
            settings: {
              settings_services_access: true,
              services_edit: true,
              settings_services_edit_price_access: true,
            },
          },
        };
      if (state.writes > 0) {
        state.readsAfterWrite++;
        if (state.name === 'unknown' && !unknownProviderRecovered)
          return { code: 503, data: null };
      }
      if (match![4])
        return {
          code: 200,
          data: path.includes('/book_services/')
            ? { services: [{ ...state.row }] }
            : [{ id: 11, title: 'Synthetic category' }],
        };
      return {
        code: 200,
        data: match![3] ? { ...state.row } : [{ ...state.row }],
      };
    }
    if (req.method === 'PATCH' && match![3] === SERVICE_ID) {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk as Buffer);
        size += bytes.length;
        if (size > 65536)
          throw new Error('Synthetic provider request too large');
        chunks.push(bytes);
      }
      const patch = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as Partial<ProviderRow>;
      const expectedNonPrice = Object.fromEntries(
        Object.entries(state.row).filter(
          ([key]) =>
            ![
              'id',
              'company_id',
              'active',
              'is_chain',
              'is_price_managed_only_in_chain',
              'price_min',
              'price_max',
            ].includes(key),
        ),
      );
      const receivedNonPrice = Object.fromEntries(
        Object.entries(patch).filter(
          ([key]) => !['price_min', 'price_max'].includes(key),
        ),
      );
      const preserved = isDeepStrictEqual(expectedNonPrice, receivedNonPrice);
      state.nonPriceChecks.push(preserved);
      if (!preserved) bad('provider_non_price_fields_changed', state.name);
      state.writes++;
      state.row = { ...state.row, ...patch };
      event('provider-events.jsonl', {
        at: new Date().toISOString(),
        case: state.name,
        method: 'PATCH',
        service_id: SERVICE_ID,
        dispatch_number: state.writes,
        price_min: state.row.price_min,
        price_max: state.row.price_max,
        non_price_preserved: preserved,
        received_field_names: Object.keys(patch).sort(),
        expected_preserved_field_names: Object.keys(expectedNonPrice).sort(),
        missing_preserved_field_names: Object.keys(expectedNonPrice)
          .filter(
            (key) =>
              !Object.prototype.hasOwnProperty.call(receivedNonPrice, key),
          )
          .sort(),
        response:
          state.name === 'unknown'
            ? 'connection_lost_after_write'
            : 'confirmed',
      });
      return {
        code: 200,
        data: { ...state.row },
        destroy: state.name === 'unknown',
      };
    }
    bad('provider_method_refused', `${req.method} ${path}`);
    return { code: 405, data: null };
  };
  try {
    process.env.YCLIENTS_PARTNER_TOKEN = PARTNER;
    jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      if (url.origin !== providerOrigin || !providerOrigin) {
        bad('blocked_fetch', url.origin);
        return Promise.reject(
          new Error('Service-price browser harness refuses external fetch'),
        );
      }
      return realFetch(input, init);
    });
    provider = createServer((req, res) => {
      void providerReply(req).then(
        (reply) => {
          if ('destroy' in reply && reply.destroy) {
            res.destroy();
            return;
          }
          res.writeHead(reply.code, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ success: reply.code === 200, data: reply.data }),
          );
        },
        () => {
          bad('provider_handler_error', 'synthetic_provider');
          res.writeHead(500);
          res.end();
        },
      );
    });
    await new Promise<void>((ready) => provider!.listen(0, '127.0.0.1', ready));
    const address = provider.address();
    if (!address || typeof address === 'string')
      throw new Error('Synthetic provider did not bind IPv4 loopback');
    providerOrigin = `http://127.0.0.1:${address.port}`;
    db = await bootFixtureContext();
    http = await bootHttp();
    const fixtures = fixturesForHttp(db, http);
    const config = http.app.get(ConfigService);
    config.set('EMAIL_LOGIN_ENABLED', 'true');
    config.set(
      'EMAIL_AUTH_SECRET',
      'test-email-auth-secret-service-price-browser-only',
    );
    config.set('EMAIL_AUTH_CODE_TTL', '900');
    const delivery = http.app.get(EmailAuthDeliveryService);
    jest.spyOn(delivery, 'getDeliveryType').mockReturnValue('email');
    jest.spyOn(delivery, 'deliverCode').mockImplementation((value) => {
      if (!states.some((state) => state.email === value.email))
        throw new Error(
          'Only seeded synthetic mailbox recipients are admitted',
        );
      mailbox.push({
        email: value.email,
        code: value.code,
        created_at: new Date().toISOString(),
        expires_in_minutes: value.expiresInMinutes,
      });
      write('mailbox.json', {
        contract: 'maya.service-price-browser-mailbox/1',
        synthetic: true,
        deliveries: mailbox,
      });
      return Promise.resolve({ delivery: 'email' });
    });
    jest
      .spyOn(http.app.get(AiCoreModelService), 'decide')
      .mockImplementation((input) => {
        modelCalls++;
        if (
          !input.tools.some(
            (tool) => tool.name === 'catalog.service.price.update',
          )
        )
          throw new Error(
            'Synthetic owner model did not receive the pricing capability',
          );
        return Promise.resolve({
          reply: 'Подготовлю изменение цены.',
          toolCall: { name: 'catalog.service.price.update', arguments: {} },
          provider: 'openai',
          model: 'scripted-service-price-live-browser',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    for (const [index, name] of CASES.entries()) {
      const tenant = await fixtures.tenant(
        `service-price-browser-${name}`,
        CalendarSource.EXTERNAL,
      );
      ownedTenantIds.push(tenant.id);
      const user = await fixtures.user(tenant, UserRole.TENANT_OWNER, name);
      await setupEntitlements(fixtures, tenant);
      const companyId = String(99101 + index),
        token = `synthetic-browser-user-${companyId}`;
      states.push({
        name,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        userId: user.id,
        email: user.email,
        companyId,
        token,
        row: service(companyId),
        writes: 0,
        readsAfterWrite: 0,
        nonPriceChecks: [],
      });
      await db.prisma.crmIntegration.create({
        data: {
          tenantId: tenant.id,
          provider: CrmProvider.YCLIENTS,
          status: 'active',
          baseUrl: `${providerOrigin}/api/v1`,
          encryptedApiToken: db.encryption.encrypt(token),
          settingsJson: { companyId, currency: 'RUB' },
        },
      });
    }
    write('mailbox.json', {
      contract: 'maya.service-price-browser-mailbox/1',
      synthetic: true,
      deliveries: mailbox,
    });
    write('unexpected-requests.json', unexpected);
    await snapshot('ready_before_browser');
    write('ready.json', {
      contract: 'maya.service-price-browser-harness/1',
      synthetic: true,
      api_origin: await http.listenLoopback(),
      model_scripted: true,
      email_delivery: 'synthetic_mailbox_only',
      database: { name: DATABASE, host: '127.0.0.1', port: Number(PORT) },
      pid: process.pid,
      cases: states.map((state) => ({
        name: state.name,
        email: state.email,
        tenant_slug: state.tenantSlug,
        tenant_id: state.tenantId,
        prompt: 'Поставь цену услуги «Стрижка» 2500 рублей',
        decision: state.name === 'rejected' ? 'reject' : 'approve',
      })),
      mailbox_file: 'mailbox.json',
      state_file: 'state.json',
      snapshot_sentinel: 'SNAPSHOT',
      recovery_sentinel: 'RECOVER_UNKNOWN_PROVIDER',
      stop_sentinel: 'STOP',
      lifetime_minutes: 30,
      browser_verdict: 'NOT_ASSESSED',
    });
    process.stdout.write(
      `Service-price browser harness ready: ${resolve(runDir, 'ready.json')}\n`,
    );
    const deadline = Date.now() + 30 * 60_000;
    while (!existsSync(resolve(runDir, 'STOP')) && Date.now() < deadline) {
      if (existsSync(resolve(runDir, 'RECOVER_UNKNOWN_PROVIDER'))) {
        unlinkSync(resolve(runDir, 'RECOVER_UNKNOWN_PROVIDER'));
        unknownProviderRecovered = true;
        await snapshot('synthetic_provider_reads_recovered_without_dispatch');
      }
      if (existsSync(resolve(runDir, 'SNAPSHOT'))) {
        const label = readFileSync(resolve(runDir, 'SNAPSHOT'), 'utf8')
          .trim()
          .slice(0, 100);
        unlinkSync(resolve(runDir, 'SNAPSHOT'));
        await snapshot(label || 'operator_snapshot');
      }
      await new Promise<void>((ready) => setTimeout(ready, 500));
    }
    stopReason = existsSync(resolve(runDir, 'STOP'))
      ? 'operator_stop'
      : 'lifetime_expired';
    await snapshot(stopReason);
  } catch (error) {
    stopReason = 'harness_failed';
    write('failure.json', {
      at: new Date().toISOString(),
      name: error instanceof Error ? error.name : 'UnknownError',
      message:
        error instanceof Error ? error.message.slice(0, 500) : 'Harness failed',
      browser_verdict: 'NOT_ASSESSED',
    });
    try {
      await snapshot(stopReason);
    } catch {
      /* Keep the original failure. */
    }
    throw error;
  } finally {
    const cleanupErrors: string[] = [];
    if (http)
      try {
        await http.close();
      } catch {
        cleanupErrors.push('http_close');
      }
    if (db) {
      // Keep every authoritative receipt and actor FK. Retire only this run's seeded tenants.
      for (const id of ownedTenantIds)
        try {
          await db.prisma.tenant.update({
            where: { id },
            data: { status: 'cancelled' },
          });
        } catch {
          cleanupErrors.push(`tenant_retire:${id}`);
        }
      try {
        await db.close();
      } catch {
        cleanupErrors.push('database_close');
      }
    }
    if (provider) {
      provider.closeAllConnections();
      await new Promise<void>((ready) => provider!.close(() => ready()));
    }
    jest.restoreAllMocks();
    delete process.env.YCLIENTS_PARTNER_TOKEN;
    write('stopped.json', {
      at: new Date().toISOString(),
      reason: stopReason,
      browser_verdict: 'NOT_ASSESSED',
      receipts_retained: true,
      unexpected_request_count: unexpected.length,
      cleanup_errors: cleanupErrors,
    });
  }
}
