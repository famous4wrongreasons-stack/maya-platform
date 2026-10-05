/** Dedicated isolated pilot. Broker-only model transport; no provider credentials. */
import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  WIDGETS_LIVE_TEST_LITERALS,
  assertNoEnvFiles,
} from '../../test/widgets-live/support/environment';
import { assertProofDatabase } from '../../test/widgets-live/support/proof-db-guard';
import { bootFixtureContext } from '../../test/widgets-live/support/bootstrap';
import { Fixtures } from '../../test/widgets-live/support/fixtures';
import { resetLoopbackLoginPreflight } from '../../test/widgets-live/support/login-rate-limit';
import { CalendarSource, UserRole } from '../../src/common/domain.enums';
import { configureHttpApp } from '../../src/bootstrap/configure-http-app';
import { PilotBudgetGate } from './budget-gate.mjs';
import { freezePilot, replayPilot, sha256 } from './replay.mjs';
import { assertProofBrokerBody } from './proof-broker-contract.mjs';

async function main() {
  const outputArg = process.argv[2];
  const paid = process.env.MAYA_PROOF_PAID_APPROVED === 'true';
  const resume = process.env.MAYA_PROOF_RESUME === 'true';
  if (resume && !paid) throw new Error('resume_requires_paid_profile');
  const usage: Record<string, unknown>[] = [];
  let dispatched = 0;
  const runStamp = Date.now().toString();
  const caseIndex =
    process.env.MAYA_PROOF_CASE_INDEX === undefined
      ? null
      : Number(process.env.MAYA_PROOF_CASE_INDEX);
  if (
    caseIndex !== null &&
    (!Number.isInteger(caseIndex) ||
      caseIndex < 1 ||
      caseIndex > 5 ||
      !paid ||
      !resume)
  )
    throw new Error('independent_case_scope_invalid');
  if (!outputArg || process.argv.length !== 3)
    throw new Error('explicit_output_directory_required');
  assertNoEnvFiles();
  const proof = assertProofDatabase();
  if (
    proof.database !== 'maya_widget_gate_proof_booking_20261005' ||
    proof.port !== '55629'
  )
    throw new Error('dedicated_proof_database_required');
  // Separate profile; the existing widgets-live no-provider environment is unchanged.
  for (const key of Object.keys(process.env))
    if (!['PATH', 'HOME', 'USER', 'TMPDIR', 'TMP', 'TEMP', 'TZ'].includes(key))
      delete process.env[key];
  Object.assign(process.env, WIDGETS_LIVE_TEST_LITERALS, {
    DATABASE_URL: proof.connectionString,
    AI_CORE_PROVIDER: 'deepseek',
    DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
    AI_CORE_MAX_OUTPUT_TOKENS: '2048',
    DEEPSEEK_API_KEY: 'proof-broker-placeholder-not-a-credential',
  });
  const directory = path.resolve(outputArg);
  const manifest = freezePilot(
    fs.readFileSync(
      path.resolve('datasets/conversation-intelligence/multi-turn.jsonl'),
      'utf8',
    ),
    6,
    ['client'],
  );
  const manifestPath = path.join(directory, 'http-pilot-manifest.json');
  if (resume) {
    const original = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      manifestSha256: string;
    };
    if (original.manifestSha256 !== manifest.manifestSha256)
      throw new Error('resume_manifest_changed');
  } else {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  const selectedCases =
    caseIndex === null ? manifest.cases : [manifest.cases[caseIndex]];
  const { manifestSha256: parentManifestSha256, ...unsignedManifest } =
    manifest;
  const selected = {
    ...unsignedManifest,
    cases: selectedCases,
    dialogs: selectedCases.length,
    independentFamilies: new Set(selectedCases.map((c) => c.familyId)).size,
    userTurns: selectedCases.reduce((n, c) => n + c.userTurns.length, 0),
  };
  const runManifest = {
    ...selected,
    manifestSha256: sha256(JSON.stringify(selected)),
  };
  fs.writeFileSync(
    path.join(directory, `selection-${runStamp}.json`),
    JSON.stringify(
      { parentManifestSha256, caseIndex, ...runManifest },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  const originalFetch = global.fetch;
  let fakeClock = 0;
  const canned = {
    semantic_plan: {
      parent_request: 'Тестовая запись',
      language: 'ru',
      dialogue_act: 'request',
      tasks: [
        {
          id: 'task_1',
          intent: 'booking.find_availability',
          entities_json: '{}',
          depends_on: [],
          confidence: 0.99,
          requires_clarification: true,
          clarification_question: 'Уточните дату записи.',
        },
      ],
      context: {
        carried_slots: [],
        replaced_slots: [],
        unresolved_references: [],
      },
    },
    tool_call: null,
  };
  const gate = new PilotBudgetGate({
    ledgerPath: path.join(directory, 'budget-ledger.jsonl'),
    resume,
    approved: true,
    transport: async (_url: unknown, init: RequestInit) => {
      // Apply the identical broker envelope bound in canned preflight and live mode.
      assertProofBrokerBody(init.body);
      if (!paid)
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(canned) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      if (gate.requests > 30) throw new Error('broker_pilot_call_cap');
      dispatched++;
      const response = await originalFetch(
        'http://127.0.0.1:18081/chat/completions',
        {
          method: 'POST',
          body: init.body,
          redirect: 'error',
          signal: init.signal,
          headers: { 'content-type': 'application/json' },
        },
      );
      try {
        const data = (await response.clone().json()) as {
          usage?: Record<string, unknown>;
          choices?: {
            message?: { content?: string };
            finish_reason?: string;
          }[];
        };
        fs.appendFileSync(
          path.join(directory, 'synthetic-model-responses.jsonl'),
          JSON.stringify({
            runStamp,
            request: gate.requests,
            status: response.status,
            content:
              typeof data.choices?.[0]?.message?.content === 'string'
                ? data.choices[0].message.content.slice(0, 16384)
                : null,
            finishReason: data.choices?.[0]?.finish_reason ?? null,
          }) + '\n',
          { mode: 0o600 },
        );
        const allowed = [
          'prompt_tokens',
          'completion_tokens',
          'total_tokens',
          'prompt_cache_hit_tokens',
          'prompt_cache_miss_tokens',
        ];
        const safeUsage = Object.fromEntries(
          allowed
            .filter((k) => Number.isSafeInteger(data.usage?.[k]))
            .map((k) => [k, data.usage![k]]),
        );
        usage.push({
          request: dispatched,
          status: response.status,
          ...safeUsage,
        });
        fs.appendFileSync(
          path.join(directory, 'provider-usage.jsonl'),
          JSON.stringify(usage.at(-1)) + '\n',
          { mode: 0o600 },
        );
      } catch {
        usage.push({
          request: dispatched,
          status: response.status,
          usageUnknown: true,
        });
      }
      return response;
    },
    ...(!paid
      ? {
          now: () => fakeClock,
          sleep: (ms: number) => {
            fakeClock += ms;
            return Promise.resolve();
          },
        }
      : {}),
  });
  let base = '';
  // Actual fetch is reachable ONLY for this process's exact loopback HTTP listener.
  // All model attempts, including retries, pass the gate before the proof transport.
  global.fetch = (url, init) => {
    if (base && typeof url === 'string' && url.startsWith(`${base}/api/`))
      return originalFetch(url, { ...init, redirect: 'error' });
    if (gate.requests >= 30)
      return Promise.reject(new Error('total_broker_attempt_cap'));
    return gate.fetch(url, init);
  };
  let app: NestExpressApplication | undefined;
  let db: Awaited<ReturnType<typeof bootFixtureContext>> | undefined;
  let fixtures: Fixtures | undefined;
  const records: Record<string, unknown>[] = [];
  const json = async (route: string, body: unknown, token?: string) => {
    const response = await global.fetch(`${base}/api${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        message?: unknown;
        code?: unknown;
        error?: { code?: unknown; detail?: unknown };
      } | null;
      fs.appendFileSync(
        path.join(directory, 'synthetic-http-errors.jsonl'),
        JSON.stringify({
          runStamp,
          route,
          status: response.status,
          message:
            typeof error?.message === 'string'
              ? error.message.slice(0, 4000)
              : Array.isArray(error?.message)
                ? error.message
                    .filter((x) => typeof x === 'string')
                    .slice(0, 10)
                : null,
          code:
            typeof error?.code === 'string' ? error.code.slice(0, 200) : null,
          modelCode:
            typeof error?.error?.code === 'string'
              ? error.error.code.slice(0, 120)
              : null,
          modelDetail:
            typeof error?.error?.detail === 'string'
              ? error.error.detail.slice(0, 200)
              : null,
        }) + '\n',
        { mode: 0o600 },
      );
      throw new Error(`pilot_http_${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  };
  try {
    // Import only after selecting the isolated environment; ConfigModule reads it at import time.
    const { AppModule } =
      (await import('../../src/app.module')) as typeof import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureHttpApp(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    db = await bootFixtureContext();
    fixtures = new Fixtures(db, null);
    const result = await replayPilot(runManifest, {
      budget: gate,
      record: (row) => {
        records.push(row);
        fs.appendFileSync(
          path.join(directory, 'turns.jsonl'),
          JSON.stringify(row) + '\n',
          { mode: 0o600 },
        );
      },
      openDialog: async ({ role }) => {
        if (role !== 'client') throw new Error('client_only_pilot');
        const tenant = await fixtures!.tenant(
          'Synthetic client conversation pilot',
          CalendarSource.INTERNAL,
        );
        const user = await fixtures!.user(tenant, UserRole.CLIENT);
        await fixtures!.bookingSource(tenant, user, true);
        for (const feature of [
          'ai.consultant',
          'widgets.runtime',
          'booking',
          'booking.customer_app',
          'crm.integration',
        ] as const)
          await fixtures!.grantFeature(tenant, feature);
        await resetLoopbackLoginPreflight(db!.prisma);
        const login = await json('/auth/login', {
          tenantSlug: tenant.slug,
          email: user.email,
          password: user.password,
        });
        if (typeof login.access_token !== 'string')
          throw new Error('synthetic_login_required');
        const token = login.access_token;
        return {
          chat: async (body) => {
            const answer = await json('/ai/chat', body, token);
            if (typeof answer.reply !== 'string')
              throw new Error('chat_reply_required');
            return {
              reply: answer.reply,
              ...(answer.userTurn
                ? { userTurn: answer.userTurn as { conversationId: string } }
                : {}),
              evidence: {
                actionStatus:
                  (answer.action as { status?: string } | undefined)?.status ??
                  null,
              },
            };
          },
          close: async () => {
            await db!.prisma.tenant.update({
              where: { id: tenant.id },
              data: { status: 'cancelled' },
            });
          },
        };
      },
    });
    fs.writeFileSync(
      path.join(
        directory,
        resume
          ? `http-pilot-resume-report-${runStamp}.json`
          : 'http-pilot-report.json',
      ),
      JSON.stringify(
        {
          mode: paid
            ? 'isolated_http_real_deepseek_synthetic_crm'
            : 'isolated_http_canned_preflight',
          ...result,
          manifestSha256: runManifest.manifestSha256,
          parentManifestSha256,
          caseIndex,
          families: runManifest.independentFamilies,
          variants: runManifest.dialogs,
          turns: runManifest.userTurns,
          providerAttempts: gate.requests,
          reservedNanoUsd: gate.reservedNanoUsd,
          brokerRequests: dispatched,
          upstreamCallCount: 'requires_broker_evidence',
          providerUsage: usage,
          realCrmEffects: 0,
          records,
        },
        null,
        2,
      ),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        status: result.status,
        mode: paid
          ? 'isolated_http_real_deepseek_synthetic_crm'
          : 'isolated_http_canned_preflight',
        providerAttempts: gate.requests,
        brokerRequests: dispatched,
        upstreamCallCount: 'requires_broker_evidence',
        providerUsage: usage,
        qualification: 'not_evaluated',
      }),
    );
    if (result.status === 'stopped') process.exitCode = 2;
  } finally {
    await fixtures?.teardown();
    await app?.close();
    await db?.close();
    global.fetch = originalFetch;
    gate.close();
  }
}
void main().catch(() => {
  console.error(
    'Isolated HTTP pilot refused or stopped; inspect sanitized ledger/report.',
  );
  process.exitCode = 1;
});
