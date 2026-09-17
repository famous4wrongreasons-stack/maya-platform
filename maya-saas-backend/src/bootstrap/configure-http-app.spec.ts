// `configureHttpApp` — what a request meets before a guard runs, held at the HTTP boundary.
//
// U0 item 8 moved the parsers, the `api` prefix and the global validation pipe out of `main.ts`
// unchanged, so the production binary and the live-path harness share one configuration. These
// cases pin that configuration through real HTTP requests to a probe controller: the prefix, the
// validation pipe's options and its error shape, each parser's limit, and the order that lets a
// route-specific parser run before the default one. Parity of the compiled bootstrap itself was
// proved in U0 S3 by probing `dist/src/main.js` before and after the extraction (S3 log).
//
// That probe ran once, and what it proved depends on WHERE `main.ts` calls `configureHttpApp`: called
// after `enableCors`, the parsers' 413s gain CORS headers, and none of the HTTP cases here notices,
// because they configure a probe application, not `main.ts`. The guard the plan names for the
// extraction (`test:http`, the production binary) cannot boot with the CI literals today. So the call
// site is held at the source too (the last describe block): `main.ts` creates the application without
// Nest's own body parser, calls `configureHttpApp(app)` exactly once, unconditionally, before it
// touches the application in any way other than `app.get`, and registers nothing `configureHttpApp`
// owns a second time.
//
// Class U: a real Nest HTTP application over a probe controller, with no guard and no database.

import fs from 'node:fs';
import path from 'node:path';

import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import ts from 'typescript';

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

// ── the call site in main.ts ─────────────────────────────────────────────────────────────────────────

const MAIN = path.join(__dirname, '..', 'main.ts');

/** What `configureHttpApp` owns, so `main.ts` may not register it again. */
const OWNED_APP_METHODS = new Set(['use', 'setGlobalPrefix', 'useGlobalPipes']);
const OWNED_MODULES = new Set(['express', 'body-parser']);

/**
 * Why `main.ts` (as `source`) does not call `configureHttpApp` the way the S3 parity proof requires,
 * or `[]`. Read from the syntax tree:
 *   - `NestFactory.create` is called once, with `bodyParser: false`, and bound to `const app`;
 *   - `configureHttpApp` is called exactly once, as a statement directly in the body of the function
 *     that creates `app` (not under a condition), with the one argument `app`;
 *   - before that call, `app` appears only in its own declaration and as the object of `app.get(…)`;
 *   - nowhere does `main.ts` call `app.use`, `app.setGlobalPrefix` or `app.useGlobalPipes`, or import
 *     `express` or `body-parser`.
 */
const bootstrapCallSiteProblems = (source: string): string[] => {
  const sf = ts.createSourceFile(
    'main.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const problems: string[] = [];
  const creates: ts.CallExpression[] = [];
  const configures: ts.CallExpression[] = [];
  const appRefs: ts.Identifier[] = [];
  let appDeclaration: ts.VariableDeclaration | null = null;

  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'NestFactory' &&
        callee.name.text === 'create'
      )
        creates.push(n);
      if (ts.isIdentifier(callee) && callee.text === 'configureHttpApp')
        configures.push(n);
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'app' &&
        OWNED_APP_METHODS.has(callee.name.text)
      )
        problems.push(`main.ts calls app.${callee.name.text} itself`);
    }
    if (
      ts.isImportDeclaration(n) &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      OWNED_MODULES.has(n.moduleSpecifier.text)
    )
      problems.push(`main.ts imports '${n.moduleSpecifier.text}'`);
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'app'
    )
      appDeclaration = n;
    if (ts.isIdentifier(n) && n.text === 'app') appRefs.push(n);
    n.forEachChild(visit);
  };
  visit(sf);

  if (creates.length !== 1)
    problems.push(`NestFactory.create is called ${creates.length} times`);
  else {
    const options = creates[0].arguments[1];
    const bodyParser =
      options && ts.isObjectLiteralExpression(options)
        ? options.properties.find(
            (p) =>
              ts.isPropertyAssignment(p) &&
              ts.isIdentifier(p.name) &&
              p.name.text === 'bodyParser',
          )
        : undefined;
    if (
      !bodyParser ||
      !ts.isPropertyAssignment(bodyParser) ||
      bodyParser.initializer.kind !== ts.SyntaxKind.FalseKeyword
    )
      problems.push('NestFactory.create is not given bodyParser: false');
  }

  const declaration = appDeclaration as ts.VariableDeclaration | null;
  if (!declaration) {
    problems.push('main.ts declares no app');
    return problems;
  }
  if (
    !ts.isVariableDeclarationList(declaration.parent) ||
    !(declaration.parent.flags & ts.NodeFlags.Const)
  )
    problems.push('app is not a const');
  const created =
    declaration.initializer && ts.isAwaitExpression(declaration.initializer)
      ? declaration.initializer.expression
      : declaration.initializer;
  if (creates.length === 1 && created !== creates[0])
    problems.push('app is not bound to the result of NestFactory.create');

  if (configures.length !== 1) {
    problems.push(`configureHttpApp is called ${configures.length} times`);
    return problems;
  }
  const call = configures[0];
  const [arg, ...rest] = call.arguments;
  if (!arg || rest.length > 0 || !ts.isIdentifier(arg) || arg.text !== 'app')
    problems.push('configureHttpApp is not called with the one argument app');
  const statement = call.parent;
  const body = ts.findAncestor(declaration, (a) => ts.isBlock(a));
  if (
    !ts.isExpressionStatement(statement) ||
    statement.expression !== call ||
    statement.parent !== body
  )
    problems.push(
      'configureHttpApp(app) is not an unconditional statement of the function that creates app',
    );

  for (const ref of appRefs) {
    if (ref.getStart(sf) >= call.getStart(sf)) continue;
    if (ref === declaration.name) continue;
    const access = ref.parent;
    const isAppGet =
      ts.isPropertyAccessExpression(access) &&
      access.expression === ref &&
      access.name.text === 'get' &&
      ts.isCallExpression(access.parent) &&
      access.parent.expression === access;
    if (!isAppGet)
      problems.push(
        `app is used before configureHttpApp(app): ${ref.parent.getText(sf).slice(0, 60)}`,
      );
  }
  return problems;
};

describe('main.ts calls configureHttpApp first, once, unconditionally', () => {
  const source = fs.readFileSync(MAIN, 'utf8');

  it('CONTROL: main.ts as it is breaks none of the call-site rules', () => {
    expect(bootstrapCallSiteProblems(source)).toEqual([]);
  });

  const replaceOnce = (from: string, to: string): string => {
    expect(source.split(from)).toHaveLength(2);
    return source.replace(from, () => to);
  };
  const CALL = '  configureHttpApp(app);\n';
  const CORS_END = '  });\n\n  if (\n    isSwaggerEnabled';

  const mutants: [string, () => string, RegExp][] = [
    [
      'the call moved after enableCors',
      () =>
        replaceOnce(CALL, '').replace(
          CORS_END,
          `  });\n${CALL}\n  if (\n    isSwaggerEnabled`,
        ),
      /app is used before configureHttpApp\(app\): app\.disable/,
    ],
    [
      'a middleware registered before the call',
      () => replaceOnce(CALL, `  app.enableCors();\n${CALL}`),
      /app is used before configureHttpApp\(app\): app\.enableCors/,
    ],
    [
      'the call under a condition',
      () => replaceOnce(CALL, `  if (process.env.X) {\n  ${CALL}  }\n`),
      /not an unconditional statement/,
    ],
    ['the call removed', () => replaceOnce(CALL, ''), /called 0 times/],
    [
      'the call made twice',
      () => replaceOnce(CALL, `${CALL}${CALL}`),
      /called 2 times/,
    ],
    [
      "Nest's own body parser left on",
      () => replaceOnce('    bodyParser: false,\n', '    bodyParser: true,\n'),
      /bodyParser: false/,
    ],
    [
      'the prefix registered again in main.ts',
      () => replaceOnce(CALL, `${CALL}  app.setGlobalPrefix('api');\n`),
      /calls app\.setGlobalPrefix itself/,
    ],
    [
      'a parser imported and registered in main.ts',
      () =>
        replaceOnce(
          "import { NestFactory } from '@nestjs/core';\n",
          "import { NestFactory } from '@nestjs/core';\nimport { json } from 'express';\n",
        ).replace(CALL, `${CALL}  app.use(json());\n`),
      /imports 'express'[\s\S]*calls app\.use itself|calls app\.use itself[\s\S]*imports 'express'/,
    ],
    [
      'app is not the application NestFactory.create returned',
      () =>
        replaceOnce(
          '  const app = await NestFactory.create<NestExpressApplication>(',
          '  const made = await NestFactory.create<NestExpressApplication>(',
        ).replace(
          '  const configService = app.get(ConfigService);\n',
          '  const app = made;\n  const configService = app.get(ConfigService);\n',
        ),
      /app is not bound to the result of NestFactory\.create/,
    ],
  ];

  it.each(mutants)('RED: %s', (_name, mutate, reason) => {
    const problems = bootstrapCallSiteProblems(mutate());
    expect(problems.join('\n')).toMatch(reason);
  });
});
