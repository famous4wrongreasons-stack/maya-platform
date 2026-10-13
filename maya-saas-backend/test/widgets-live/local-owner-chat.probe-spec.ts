/** Real HTTP/auth/AiCore/C9/native adapter/isolated PostgreSQL. Scripted planner
 * and synthetic provider only: no real credential, paid model or owner database. */
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type {
  Request,
  Response as ExpressResponse,
  NextFunction,
} from 'express';
import type {
  AiCoreModelInput,
  AiCoreModelDecision,
} from '../../src/ai-tools/ai-core.types';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import { bootHttp, type HttpHarness } from './support/http-bootstrap';
import { AiCoreService } from '../../src/ai-tools/ai-core.service';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import { AiToolRuntimeService } from '../../src/ai-tools/ai-tool-runtime.service';
import { ActionEngineRuntimeService } from '../../src/action-engine/action-engine.runtime';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { assertProofDatabase } from './support/proof-db-guard';
interface OwnerChatScope {
  stateDirectory: string;
  initialManifestSha256: string;
  privateStateSha256: string;
  restartReceiptPath: string;
  restartReceiptSha256: string;
  tenantId: string;
  userId: string;
  branchId: string;
  tenantSlug: string;
  companyId: string;
}
interface InstalledOwnerChat {
  fetch: typeof fetch;
  stop(): void;
  allowProvider(request: unknown): Promise<boolean>;
}
interface OwnerChatRuntimeModule {
  installOwnerChat(
    this: void,
    input: {
      app: HttpHarness['app'];
      prisma: PrismaService;
      require(file: string): Record<string, unknown>;
      backend: string;
      launch: {
        manifest: {
          ownerScope: OwnerChatScope;
          limits: { model: string; outputPerAttempt: number };
        };
        admission: { expiresAt: number };
        assertCurrent(): void;
      };
      providerFetch: typeof fetch;
    },
  ): Promise<InstalledOwnerChat>;
}
interface OwnerChatPolicyModule {
  OWNER_CHAT_QUESTIONS: readonly string[];
  OWNER_CHAT_TOOLS: readonly string[];
  ownerChatIngress(
    this: void,
    method: string,
    path: string,
    headers: Request['headers'],
    body: unknown,
    origin: string,
    scope: OwnerChatScope,
  ): string | null;
}
interface ReadTransportModule {
  createReadTransport(
    this: void,
    native: typeof fetch,
    company: () => Promise<string>,
    clock: () => number,
    trace: () => void,
    options: { allowOwnerChat(request: unknown): Promise<boolean> },
  ): {
    fetch: typeof fetch;
    run(request: Request, response: ExpressResponse, next: NextFunction): void;
  };
}
const requireNative = createRequire(__filename);
const { installOwnerChat } = requireNative(
  path.resolve('scripts/local-owner-chat-runtime.mjs'),
) as OwnerChatRuntimeModule;
const { ownerChatIngress, OWNER_CHAT_QUESTIONS, OWNER_CHAT_TOOLS } =
  requireNative(
    path.resolve('scripts/local-owner-chat-policy.mjs'),
  ) as OwnerChatPolicyModule;
const { createReadTransport } = requireNative(
  path.resolve('scripts/local-yclients-read-transport.mjs'),
) as ReadTransportModule;

describe('owner catalog local qualification boundary — synthetic HTTP', () => {
  let db: FixtureContext,
    http: HttpHarness,
    scope: OwnerChatScope,
    token: string,
    foreignToken: string,
    installed: InstalledOwnerChat;
  let originalFetch: typeof fetch, originalPartner: string | undefined;
  let modelCalls = 0,
    providerCalls = 0;
  const observations: unknown[] = [];
  const providerPaths: string[] = [];
  const origin = 'http://127.0.0.1:58099';
  const body = (i: number) => ({
    surface: 'web',
    requestId: randomUUID(),
    messages: [{ role: 'user', content: OWNER_CHAT_QUESTIONS[i] }],
  });
  beforeAll(async () => {
    assertProofDatabase(process.env);
    db = await bootFixtureContext();
    const tenant = await db.prisma.tenant.create({
      data: {
        name: 'Synthetic local owner salon',
        slug: 'widgets-live-' + randomUUID(),
        status: 'trial',
        trialEndsAt: new Date(Date.now() + 86400000),
        calendarSource: 'external',
        trialFullAccess: true,
      },
    });
    const branch = await db.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Synthetic branch',
        timezone: 'Europe/Moscow',
      },
    });
    const password = 'synthetic-local-owner-' + randomUUID();
    const owner = await db.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'owner-' + randomUUID() + '@example.invalid',
        passwordHash: await bcrypt.hash(password, 10),
        role: 'tenant_owner',
        status: 'active',
      },
    });
    await db.prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        role: 'tenant_owner',
        status: 'active',
      },
    });
    await db.prisma.crmIntegration.create({
      data: {
        tenantId: tenant.id,
        provider: 'yclients',
        status: 'active',
        verifiedAt: new Date(),
        encryptedApiToken: db.encryption.encrypt('SYNTHETIC_USER_NOT_REAL_321'),
        settingsJson: {
          companyId: '321',
          acceptedImportSnapshotHash: 'd'.repeat(64),
          branchBinding: {
            contract: 'maya.crm-branch-binding/1',
            companyId: '321',
            branchId: branch.id,
          },
        },
      },
    });
    scope = {
      stateDirectory: '/private/tmp/synthetic-owner-chat-http',
      initialManifestSha256: 'a'.repeat(64),
      privateStateSha256: 'b'.repeat(64),
      restartReceiptPath: '/private/tmp/synthetic-owner-restart/restart.json',
      restartReceiptSha256: 'c'.repeat(64),
      tenantId: tenant.id,
      userId: owner.id,
      branchId: branch.id,
      tenantSlug: tenant.slug,
      companyId: '321',
    };
    const foreign = await db.prisma.tenant.create({
      data: {
        name: 'Foreign synthetic',
        slug: 'widgets-live-' + randomUUID(),
        status: 'active',
        trialFullAccess: false,
      },
    });
    const other = await db.prisma.user.create({
      data: {
        tenantId: foreign.id,
        email: 'foreign-' + randomUUID() + '@example.invalid',
        passwordHash: await bcrypt.hash(password, 10),
        role: 'tenant_owner',
        status: 'active',
      },
    });
    await db.prisma.membership.create({
      data: {
        tenantId: foreign.id,
        userId: other.id,
        role: 'tenant_owner',
        status: 'active',
      },
    });
    originalFetch = globalThis.fetch;
    originalPartner = process.env.YCLIENTS_PARTNER_TOKEN;
    process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_PARTNER_NOT_REAL_321';
    const native: typeof fetch = (raw) => {
      if (typeof raw !== 'string' && !(raw instanceof URL))
        throw new Error('Unexpected synthetic request shape');
      providerCalls++;
      const url = new URL(String(raw));
      providerPaths.push(url.pathname);
      let data: unknown;
      if (url.pathname.endsWith('/book_services/321'))
        data = {
          services: [
            {
              id: 1,
              title: 'Synthetic cut',
              price_min: 1700,
              price_max: 1700,
              duration: 1800,
            },
          ],
        };
      else if (url.pathname.endsWith('/service_categories/321')) data = [];
      else if (
        url.pathname.endsWith('/company/321/staff') ||
        url.pathname.endsWith('/staff/321')
      )
        data = [
          {
            id: 2,
            company_id: 321,
            name: 'Synthetic public master',
            bookable: true,
            fired: false,
          },
        ];
      else if (url.pathname.endsWith('/company/321'))
        data = {
          id: 321,
          title: 'Synthetic local owner salon',
          address: 'Synthetic public address',
          timezone_name: 'Europe/Moscow',
        };
      else throw Error('unplanned_synthetic_provider_route');
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data, meta: {} }), {
          status: 200,
        }),
      );
    };
    const map = {
      ConfigService,
      ForbiddenException,
      AiCoreService,
      AiToolRuntimeService,
      ActionEngineRuntimeService,
    };
    const sourceRequire = (file: string) => {
      const name =
        file === '@nestjs/config'
          ? 'ConfigService'
          : file === '@nestjs/common'
            ? 'ForbiddenException'
            : file.endsWith('/ai-core.service.js')
              ? 'AiCoreService'
              : file.endsWith('/ai-tool-runtime.service.js')
                ? 'AiToolRuntimeService'
                : 'ActionEngineRuntimeService';
      return { [name]: map[name] };
    };
    const launch = {
      manifest: {
        ownerScope: scope,
        limits: { model: 'deepseek-v4-pro', outputPerAttempt: 2048 },
      },
      admission: { expiresAt: Date.now() + 600000 },
      assertCurrent() {},
    };
    http = await bootHttp(undefined, async (app) => {
      const guard = createReadTransport(
        native,
        () => Promise.resolve(scope.companyId),
        Date.now,
        () => {},
        { allowOwnerChat: (req: unknown) => installed.allowProvider(req) },
      );
      installed = await installOwnerChat({
        app,
        prisma: app.get(PrismaService),
        require: sourceRequire,
        backend: process.cwd(),
        launch,
        providerFetch: guard.fetch,
      });
      globalThis.fetch = installed.fetch;
      app.use((req: Request, res: ExpressResponse, next: NextFunction) => {
        const reason = ownerChatIngress(
          req.method,
          req.originalUrl,
          req.headers,
          req.body,
          origin,
          scope,
        );
        if (reason) return res.status(403).json({ error: { code: reason } });
        return guard.run(req, res, next);
      });
      const model = app.get(AiCoreModelService);
      const parser = model as unknown as {
        validatePlanningResponse(
          text: string,
          input: AiCoreModelInput,
        ): Pick<AiCoreModelDecision, 'toolCall' | 'semanticPlan'>;
      };
      jest.spyOn(model, 'decide').mockImplementation((input) => {
        modelCalls++;
        expect(
          input.tools.every((t) => OWNER_CHAT_TOOLS.includes(t.name)),
        ).toBe(true);
        const userText =
          input.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '';
        const index = OWNER_CHAT_QUESTIONS.indexOf(userText);
        if (input.toolResults.length)
          return Promise.resolve({
            reply: 'Synthetic source-qualified reply.',
            toolCall: null,
            semanticPlan: input.conversationPlan,
            provider: 'deepseek' as const,
            model: 'SCRIPTED_NOT_LIVE',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          });
        expect(index).toBeGreaterThanOrEqual(0);
        const names = [
          'catalog.services.read',
          'catalog.staff.read',
          'company.business-hours.read',
        ];
        const intents = [
          'services.list',
          'employees.list_public',
          'company.business_hours',
        ];
        const parsed = parser.validatePlanningResponse(
          JSON.stringify({
            semantic_plan: {
              dialogue_act: 'request',
              tasks: [
                {
                  id: 'read',
                  intent: intents[index],
                  entities: {},
                  confidence: 1,
                },
              ],
              context: {
                carried_slots: [],
                replaced_slots: [],
                unresolved_references: [],
              },
            },
            tool_call: { name: names[index], arguments: {} },
          }),
          input,
        );
        return Promise.resolve({
          ...parsed,
          reply: 'Проверяю данные.',
          provider: 'deepseek' as const,
          model: 'SCRIPTED_NOT_LIVE',
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        });
      });
    });
    token = await http.login(tenant.slug, owner.email, password);
    // Obtain the foreign token through canonical auth before the local admission
    // fence: it cannot be minted by editing a JWT or substituting a tenant field.
    const foreignLogin = await http.app
      .get(AuthService)
      .login({ tenantSlug: foreign.slug, email: other.email, password });
    foreignToken = foreignLogin.access_token;
    observations.push({
      foreignTenantSeeded: Boolean(other.id),
      ownerLogin: true,
    });
  });
  afterAll(async () => {
    if (originalFetch) globalThis.fetch = originalFetch;
    if (originalPartner === undefined)
      delete process.env.YCLIENTS_PARTNER_TOKEN;
    else process.env.YCLIENTS_PARTNER_TOKEN = originalPartner;
    installed?.stop();
    await http?.close();
    await db?.close();
    if (process.env.JEST_C9_OCCUPANCY_REPORT)
      writeFileSync(
        process.env.JEST_C9_OCCUPANCY_REPORT,
        JSON.stringify(
          {
            qualification:
              'SYNTHETIC_PLANNER_AND_PROVIDER_REAL_HTTP_NOT_OWNER_ACCEPTANCE',
            modelCalls,
            providerCalls,
            providerPaths,
            observations,
            realProviderCalls: 0,
            paidModelCalls: 0,
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
  });
  it('three admitted questions traverse actual source owners without widget grants or business execution', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(http.app.getHttpServer())
        .post('/api/ai/chat')
        .set('authorization', 'Bearer ' + token)
        .send(body(i));
      const response = res.body as {
        error?: { code?: unknown };
        message?: unknown;
        reply?: unknown;
      };
      observations.push({
        question: i + 1,
        status: res.status,
        error: response?.error?.code ?? null,
        message: response?.message ?? null,
        reply: response?.reply ?? null,
      });
      expect(res.status).toBe(201);
    }
    expect(providerCalls).toBeGreaterThan(0);
    expect(providerPaths).toEqual([
      '/api/v1/book_services/321',
      '/api/v1/company/321/staff',
      '/api/v1/company/321',
    ]);
    expect(
      await db.prisma.actionExecution.count({
        where: { tenantId: scope.tenantId },
      }),
    ).toBe(0);
    expect(
      await db.prisma.tenantEntitlement.count({
        where: { tenantId: scope.tenantId, featureKey: 'widgets.runtime' },
      }),
    ).toBe(0);
  });
  it('replay, extra question, missing session and effect routes cannot dispatch', async () => {
    const count = providerCalls;
    for (const url of [
      '/api/ai/chat',
      '/api/appointments',
      '/api/integrations/crm/activate',
      '/api/ai/transcribe',
    ]) {
      const res = await request(http.app.getHttpServer())
        .post(url)
        .set('authorization', 'Bearer ' + token)
        .send(body(0));
      expect(res.status).toBe(403);
    }
    expect(
      (
        await request(http.app.getHttpServer())
          .post('/api/ai/chat')
          .send(body(0))
      ).status,
    ).toBe(401);
    expect(
      (
        await request(http.app.getHttpServer())
          .get('/api/ai/conversation')
          .set('authorization', 'Bearer ' + foreignToken)
      ).status,
    ).toBe(403);
    expect(providerCalls).toBe(count);
  });
  it('current membership revocation and trial expiry close persisted conversation access', async () => {
    const count = providerCalls;
    const get = () =>
      request(http.app.getHttpServer())
        .get('/api/ai/conversation')
        .set('authorization', 'Bearer ' + token);
    expect((await get()).status).toBe(200);
    await db.prisma.membership.updateMany({
      where: { tenantId: scope.tenantId, userId: scope.userId },
      data: { status: 'suspended' },
    });
    expect((await get()).status).toBe(401);
    await db.prisma.membership.updateMany({
      where: { tenantId: scope.tenantId, userId: scope.userId },
      data: { status: 'active' },
    });
    await db.prisma.tenant.update({
      where: { id: scope.tenantId },
      data: { trialEndsAt: new Date(Date.now() - 1) },
    });
    expect((await get()).status).toBe(403);
    expect(providerCalls).toBe(count);
  });
});
