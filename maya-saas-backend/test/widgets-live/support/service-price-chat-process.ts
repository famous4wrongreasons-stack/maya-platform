// One fresh application process per synthetic chat turn. The parent owns the
// loopback provider and guarded PG; no browser, live model or external provider.
import { configureHttpApp } from '../../../src/bootstrap/configure-http-app';
import { AiCoreModelService } from '../../../src/ai-tools/ai-core-model.service';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { assertNoEnvFiles, applyWidgetsLiveEnvironment } from './environment';
import type { AiCoreModelInput } from '../../../src/ai-tools/ai-core.types';

type Input = {
  providerOrigin: string;
  token: string;
  text: string;
  conversationId?: string;
  requestId: string;
};
let activeApp: NestExpressApplication | null = null;
let closing = false;
async function cleanup() {
  if (closing) return;
  closing = true;
  clearTimeout(deadline);
  await activeApp?.close();
  activeApp = null;
}
const stop = (code: number) => {
  setTimeout(() => process.exit(code), 5000).unref();
  void cleanup().finally(() => process.exit(code));
};
const disconnected = () => stop(1);
const deadline = setTimeout(() => stop(124), 45_000);
process.once('disconnect', disconnected);
process.once('SIGTERM', () => stop(143));
async function turn(input: Input) {
  assertNoEnvFiles();
  applyWidgetsLiveEnvironment();
  process.env.YCLIENTS_PARTNER_TOKEN = 'synthetic-service-price-partner-only';
  const origin = new URL(input.providerOrigin);
  if (
    origin.hostname !== '127.0.0.1' ||
    !origin.port ||
    origin.protocol !== 'http:'
  )
    throw new Error('synthetic_origin_required');
  const realFetch = global.fetch;
  global.fetch = (url: string | URL | Request, init?: RequestInit) => {
    const destination = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url : url.url,
    );
    if (destination.origin !== origin.origin)
      throw new Error('external_fetch_forbidden');
    return realFetch(url, init);
  };
  // Import only after the owned environment and no-env-file guard.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { AppModule } =
    require('../../../src/app.module') as typeof import('../../../src/app.module');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    bodyParser: false,
  });
  activeApp = app;
  try {
    configureHttpApp(app);
    await app.init();
    const model = app.get(AiCoreModelService);
    model.decide = (source: AiCoreModelInput) => {
      const initial = input.text.includes('Подготовь');
      const correction = input.text.includes('1600');
      const entity = initial
        ? { requested_price: 9999 }
        : correction
          ? { requested_price: 1600 }
          : { service: 'Мужская стрижка' };
      const value = model['validatePlanningResponse'](
        JSON.stringify({
          semantic_plan: {
            parent_request: input.text,
            language: 'ru',
            dialogue_act: initial
              ? 'request'
              : correction
                ? 'correction'
                : 'clarification',
            tasks: [
              {
                id: 'price',
                intent: 'services.price_update',
                entities_json: JSON.stringify(entity),
                depends_on: [],
                confidence: 1,
                requires_clarification: false,
                clarification_question: null,
              },
            ],
            context: {
              carried_slots: [],
              replaced_slots: [],
              unresolved_references: [],
            },
          },
          tool_call:
            initial || !source.conversationPlan
              ? null
              : {
                  name: 'catalog.service.price.update',
                  arguments_json: JSON.stringify({
                    service_id: '999999',
                    price_rubles: 9999,
                  }),
                },
        }),
        source,
      );
      return Promise.resolve({
        ...value,
        reply: 'SCRIPTED_ONLY',
        provider: 'openai',
        model: 'synthetic-price-continuation-process',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });
    };
    const response = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${input.token}`)
      .send({
        surface: 'web',
        audience: 'owner',
        requestId: input.requestId,
        messages: [{ role: 'user', content: input.text }],
        ...(input.conversationId
          ? { conversationId: input.conversationId }
          : {}),
      });
    process.send?.({
      status: response.status,
      body: response.body as unknown,
      pid: process.pid,
    });
  } finally {
    await cleanup();
    global.fetch = realFetch;
  }
}
process.once('message', (input: Input) => {
  void turn(input)
    .catch((error: unknown) => {
      process.stderr.write(String(error) + '\n');
      process.exitCode = 1;
    })
    .finally(() => {
      clearTimeout(deadline);
      process.removeListener('disconnect', disconnected);
      if (process.connected) process.disconnect();
    });
});
