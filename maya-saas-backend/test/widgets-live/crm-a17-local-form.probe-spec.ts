/** Bounded interactive development fixture: current React + real AppModule/PG.
 * Provider inputs are finite synthetic GETs. Never use this entry for real keys. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiCoreModelService } from '../../src/ai-tools/ai-core-model.service';
import {
  CalendarSource,
  CrmProvider,
  UserRole,
} from '../../src/common/domain.enums';
import { CrmAdapterFactory } from '../../src/crm/crm-adapter.factory';
import { YclientsCRMAdapter } from '../../src/crm/adapters/yclients-crm.adapter';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { assertProofDatabase } from './support/proof-db-guard';

const output = process.env.JEST_CRM_LOCAL_OUTPUT;
const duration = Number(process.env.JEST_CRM_LOCAL_DURATION_MS);
assert.ok(
  output && path.isAbsolute(output) && existsSync(output),
  'Use owned crm-setup-local launcher',
);
assert.ok(
  Number.isSafeInteger(duration) && duration >= 60000 && duration <= 900000,
);
assertProofDatabase(process.env);
assert.equal(process.env.YCLIENTS_PARTNER_TOKEN, undefined);
const companyId = 424242;
const origin = 'https://synthetic-a17-local.invalid';
const handoffPath = path.join(output, 'handoff.json');
assert.equal(
  existsSync(handoffPath),
  false,
  'Never overwrite a previous handoff',
);
const object = (value: unknown): Record<string, unknown> => {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
};

describe('Interactive local synthetic CRM setup', () => {
  let db: FixtureContext | undefined;
  let http: HttpHarness | undefined;
  let host: ChildProcess | undefined;
  let handoff: Record<string, unknown> | undefined;
  let cancel: (() => void) | undefined;
  let stopping = false;
  const forbidden: string[] = [];
  const providerReads: string[] = [];
  const stop = () => {
    stopping = true;
    cancel?.();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  afterAll(async () => {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    if (host && host.exitCode === null && host.signalCode === null) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => host?.kill('SIGKILL'), 5000);
        host!.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
        host!.kill('SIGTERM');
      });
    }
    jest.restoreAllMocks();
    await http?.close();
    await db?.close();
    if (handoff)
      writeFileSync(
        handoffPath,
        JSON.stringify(
          {
            ...handoff,
            status: 'stopped',
            stoppedAt: new Date().toISOString(),
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
    writeFileSync(
      path.join(output, 'local-form-result.json'),
      JSON.stringify(
        {
          contract: 'maya.crm-local-form-result/1',
          stopped: true,
          providerTransport: 'SYNTHETIC_NATIVE_ADAPTER_GET_ONLY',
          providerReadCount: providerReads.length,
          forbidden,
          realProviderCalls: 0,
          modelCalls: 0,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  });

  it(
    'serves the existing owner form until the bounded session ends',
    async () => {
      db = await bootFixtureContext();
      http = await bootHttp();
      http.app.get(ConfigService).set('EMAIL_LOGIN_ENABLED', 'true');
      http.app.get(ConfigService).set('EMAIL_AUTH_PROVIDER', 'debug');
      jest
        .spyOn(http.app.get(CrmAdapterFactory), 'create')
        .mockImplementation((provider, config) => {
          assert.equal(provider, CrmProvider.YCLIENTS);
          assert.ok(
            ['SYNTHETIC_A17_V1', 'SYNTHETIC_A17_V2'].includes(config.apiToken),
          );
          process.env.YCLIENTS_PARTNER_TOKEN = 'SYNTHETIC_A17_PARTNER';
          try {
            return new YclientsCRMAdapter({
              ...config,
              baseUrl: origin + '/api/v1',
            });
          } finally {
            delete process.env.YCLIENTS_PARTNER_TOKEN;
          }
        });
      jest
        .spyOn(http.app.get(AiCoreModelService), 'decide')
        .mockImplementation(() => {
          forbidden.push('model');
          throw new Error('Model forbidden in local setup fixture');
        });
      jest.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        );
        if (
          url.origin !== origin ||
          init?.method !== 'GET' ||
          init.body !== undefined
        ) {
          forbidden.push('unexpected-provider-transport');
          throw new Error('Provider transport refused');
        }
        const route = url.pathname.replace('/api/v1/', '');
        if (url.search !== (route === 'companies' ? '?my=1' : '')) {
          forbidden.push('unexpected-provider-query');
          throw new Error('Provider query refused');
        }
        const company = {
          id: companyId,
          title: 'Synthetic A17 company',
          timezone_name: 'Europe/Moscow',
        };
        let data: unknown;
        if (route === 'companies') data = [company];
        else if (route === `company/${companyId}`) data = company;
        else if (route === `book_services/${companyId}`)
          data = {
            services: [
              {
                id: 81,
                title: 'Synthetic service',
                price_min: 1000,
                price_max: 1000,
                seance_length: 1800,
              },
            ],
          };
        else if (
          [
            `service_categories/${companyId}`,
            `company/${companyId}/staff`,
            `staff/${companyId}`,
            `book_staff/${companyId}`,
          ].includes(route)
        )
          data = [];
        else {
          forbidden.push('unexpected-provider-route');
          throw new Error('Provider route refused');
        }
        providerReads.push(route);
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data }), {
            status: 200,
          }),
        );
      });
      const fx = fixturesForHttp(db, http);
      const tenant = await fx.tenant(
        'MAYA local synthetic connection',
        CalendarSource.EXTERNAL,
      );
      const owner = await fx.user(tenant, UserRole.TENANT_OWNER);
      for (const feature of [
        'ai.owner',
        'booking',
        'crm.integration',
        'widgets.runtime',
      ] as const)
        await fx.grantFeature(tenant, feature);
      const branch = await db.prisma.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Synthetic branch',
          timezone: 'Europe/Moscow',
        },
      });
      const backendOrigin = await http.listenLoopback();
      assert.match(owner.email, /^wl-[a-f0-9]{8}@widgets-live\.test$/);
      assert.equal(stopping, false, 'Cancelled before local listener');
      host = spawn(
        process.execPath,
        [
          path.resolve(
            '../maya-carrier-react/test/crm-a17-local-form-server.mjs',
          ),
        ],
        {
          stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR,
            NODE_ENV: 'test',
            NODE_OPTIONS: '--max-old-space-size=256',
          },
        },
      );
      const listening = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Local form startup timeout')),
            15000,
          );
          const fail = () => {
            clearTimeout(timer);
            reject(new Error('Local form host stopped before ready'));
          };
          host!.once('error', fail);
          host!.once('close', fail);
          host!.on('message', (value) => {
            const message = object(value);
            if (message.type === 'ready')
              host!.send({
                type: 'start',
                backendOrigin,
                email: owner.email,
                branchId: branch.id,
                companyId,
              });
            else if (message.type === 'listening') {
              clearTimeout(timer);
              host!.off('error', fail);
              host!.off('close', fail);
              resolve(message);
            }
          });
        },
      );
      const formUrl = new URL(String(listening.formUrl));
      const landingUrl = new URL(String(listening.landingUrl));
      assert.equal(formUrl.hostname, '127.0.0.1');
      assert.equal(formUrl.protocol, 'http:');
      assert.equal(formUrl.origin, landingUrl.origin);
      assert.equal(formUrl.pathname + formUrl.search, '/?local_crm_setup=1');
      assert.equal(landingUrl.pathname + landingUrl.search, '/__local-a17');
      handoff = {
        contract: 'maya.crm-local-handoff/1',
        status: 'ready',
        landingUrl: landingUrl.href,
        formUrl: formUrl.href,
        email: owner.email,
        companyId,
        branchName: branch.name,
        testToken: 'SYNTHETIC_A17_V1',
        expiresAt: new Date(Date.now() + duration).toISOString(),
        localDatabaseOnly: true,
        syntheticProviderOnly: true,
      };
      writeFileSync(handoffPath, JSON.stringify(handoff, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, duration);
        cancel = () => {
          clearTimeout(timer);
          resolve();
        };
        host!.once('error', () => {
          clearTimeout(timer);
          reject(new Error('Local form host failed'));
        });
        host!.once('close', () => {
          clearTimeout(timer);
          if (stopping) resolve();
          else reject(new Error('Local form host stopped early'));
        });
        if (stopping) cancel();
      });
      expect(forbidden).toEqual([]);
    },
    duration + 45000,
  );
});
