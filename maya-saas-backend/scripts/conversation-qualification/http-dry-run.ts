/** Real isolated HTTP/auth/AiCore/model-parser pipeline, canned provider only.
 * This executable has NO live mode and never admits inherited provider credentials.
 */
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
import { configureHttpApp } from '../../src/bootstrap/configure-http-app';
import { PilotBudgetGate } from './budget-gate.mjs';
import { freezePilot, replayPilot } from './replay.mjs';

async function main() {
  const outputArg = process.argv[2];
  if (!outputArg || process.argv.length !== 3)
    throw new Error('explicit_output_directory_required');
  assertNoEnvFiles();
  const proof = assertProofDatabase();
  // Separate profile; the existing widgets-live no-provider environment is unchanged.
  for (const key of Object.keys(process.env))
    if (!['PATH', 'HOME', 'USER', 'TMPDIR', 'TMP', 'TEMP', 'TZ'].includes(key))
      delete process.env[key];
  Object.assign(process.env, WIDGETS_LIVE_TEST_LITERALS, {
    DATABASE_URL: proof.connectionString,
    AI_CORE_PROVIDER: 'deepseek',
    DEEPSEEK_AI_CORE_MODEL: 'deepseek-v4-pro',
    AI_CORE_MAX_OUTPUT_TOKENS: '2048',
    DEEPSEEK_API_KEY: 'offline-placeholder-not-a-credential',
  });
  const directory = path.resolve(outputArg);
  const manifest = freezePilot(
    fs.readFileSync(
      path.resolve('datasets/conversation-intelligence/multi-turn.jsonl'),
      'utf8',
    ),
    12,
    ['client'],
  );
  fs.writeFileSync(
    path.join(directory, 'http-pilot-manifest.json'),
    JSON.stringify(manifest, null, 2),
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
    approved: true,
    transport: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(canned) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    now: () => fakeClock,
    sleep: (ms: number) => {
      fakeClock += ms;
      return Promise.resolve();
    },
  });
  let base = '';
  // Actual fetch is reachable ONLY for this process's exact loopback HTTP listener.
  // Provider requests (including retries) go through the gate into the canned transport.
  global.fetch = (url, init) => {
    if (base && typeof url === 'string' && url.startsWith(`${base}/api/`))
      return originalFetch(url, { ...init, redirect: 'error' });
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
    if (!response.ok) throw new Error(`pilot_http_${response.status}`);
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
    const result = await replayPilot(manifest, {
      budget: gate,
      record: (row) => {
        records.push(row);
      },
      openDialog: async ({ role }) => {
        if (role !== 'client') throw new Error('client_only_pilot');
        const { tenant, user } = await fixtures!.clientConversationPilot();
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
              ...(answer.user_turn
                ? { userTurn: answer.user_turn as { conversationId: string } }
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
      path.join(directory, 'http-pilot-report.json'),
      JSON.stringify(
        {
          mode: 'offline_http_canned_provider',
          ...result,
          manifestSha256: manifest.manifestSha256,
          families: manifest.independentFamilies,
          variants: manifest.dialogs,
          turns: manifest.userTurns,
          providerAttempts: gate.requests,
          simulatedReservedNanoUsd: gate.reservedNanoUsd,
          actualPaidRequests: 0,
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
        mode: 'offline_http_canned_provider',
        providerAttempts: gate.requests,
        actualPaidRequests: 0,
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
    'Offline HTTP pilot refused or stopped; inspect the sanitized ledger/report.',
  );
  process.exitCode = 1;
});
