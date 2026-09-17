// `configureHttpApp` — what a request meets before a guard runs, held at the HTTP boundary.
//
// U0 item 8 moved the parsers, the `api` prefix and the global validation pipe out of `main.ts`
// unchanged, so the production binary and the live-path harness share one configuration. These
// cases pin that configuration through real HTTP requests to a probe controller: the prefix, the
// validation pipe's options and its error shape, each parser's limit, and the order that lets a
// route-specific parser run before the default one. Parity of the compiled bootstrap itself was
// proved in U0 S3 by probing `dist/src/main.js` before and after the extraction (S3 log).
//
// Class U: a real Nest HTTP application over a probe controller, with no guard and no database.

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';

import { configureHttpApp } from './configure-http-app';

class ProbeDto {
  @IsString()
  name!: string;
}

@Controller()
class ProbeController {
  @Post('probe')
  @HttpCode(200)
  probe(@Body() dto: ProbeDto) {
    return { name: dto.name.length, transformed: dto instanceof ProbeDto };
  }

  @Post('ai/transcribe')
  @HttpCode(200)
  transcribe(@Body() body: Record<string, unknown>) {
    return { received: typeof body.audio === 'string' };
  }

  @Post('team-communications/attachments/:attachmentId/chunks/:index')
  @HttpCode(200)
  chunk(@Body() body: Record<string, unknown>) {
    return { received: typeof body.data === 'string' };
  }

  @Post('form')
  @HttpCode(200)
  form(@Body() body: Record<string, unknown>) {
    return body;
  }
}

const KB = 1024;
const MB = 1024 * 1024;
/** A JSON body of `bytes` bytes of payload under `key`, plus a few bytes of JSON punctuation. */
const jsonOf = (key: string, bytes: number): string =>
  JSON.stringify({ [key]: 'a'.repeat(Math.floor(bytes)) });

describe('configureHttpApp — the parsers, the api prefix and the validation pipe', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    // `logger: false` only silences Nest's log of each 413; the responses are what is asserted.
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: string, type = 'application/json') =>
    request(app.getHttpServer())
      .post(path)
      .set('content-type', type)
      .send(body);

  describe("the 'api' prefix", () => {
    it('a route is served under /api, and not without it', async () => {
      await post('/probe', JSON.stringify({ name: 'x' })).expect(404);
      await post('/api/probe', JSON.stringify({ name: 'x' }))
        .expect(200)
        .expect({ name: 1, transformed: true });
    });
  });

  describe('the global ValidationPipe', () => {
    it('forbidNonWhitelisted: an undeclared member is refused with the shared error shape', async () => {
      const res = await post(
        '/api/probe',
        JSON.stringify({ name: 'x', tenant_id: 't' }),
      ).expect(400);
      const message = 'property tenant_id should not exist';
      expect(res.body).toEqual({
        message,
        error: {
          code: 'validation',
          message,
          field: 'tenant_id',
          details: [{ field: 'tenant_id', message }],
        },
      });
    });

    it('a constraint failure names its field and message', async () => {
      const res = await post('/api/probe', JSON.stringify({ name: 5 })).expect(
        400,
      );
      const message = 'name must be a string';
      expect(res.body).toEqual({
        message,
        error: {
          code: 'validation',
          message,
          field: 'name',
          details: [{ field: 'name', message }],
        },
      });
    });
  });

  describe('the body parsers and their limits', () => {
    it('ordinary JSON routes: 100 KB', async () => {
      await post('/api/probe', jsonOf('name', 99 * KB)).expect(200);
      await post('/api/probe', jsonOf('name', 101 * KB)).expect(413);
    });

    it('/api/ai/transcribe: 2 MB, parsed before the 100 KB default', async () => {
      await post('/api/ai/transcribe', jsonOf('audio', 1.9 * MB))
        .expect(200)
        .expect({ received: true });
      await post('/api/ai/transcribe', jsonOf('audio', 2.1 * MB)).expect(413);
    });

    it('team-communication chunks: 9 MB, only on the exact chunk path', async () => {
      const chunkPath =
        '/api/team-communications/attachments/att_1.a:b-c/chunks/7';
      await post(chunkPath, jsonOf('data', 8.9 * MB))
        .expect(200)
        .expect({ received: true });
      await post(chunkPath, jsonOf('data', 9.1 * MB)).expect(413);
      // Not the chunk path (a non-numeric index): the 100 KB default applies.
      await post(
        '/api/team-communications/attachments/att_1/chunks/last',
        jsonOf('data', 101 * KB),
      ).expect(413);
    });

    it('urlencoded bodies: extended parsing, 100 KB', async () => {
      await post('/api/form', 'a[b]=1&c=2', 'application/x-www-form-urlencoded')
        .expect(200)
        .expect({ a: { b: '1' }, c: '2' });
      await post(
        '/api/form',
        `a=${'x'.repeat(101 * KB)}`,
        'application/x-www-form-urlencoded',
      ).expect(413);
    });
  });
});
