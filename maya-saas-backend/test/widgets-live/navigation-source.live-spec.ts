import request from 'supertest';
import { cases } from '../../scripts/widgets-http-proof/gateNS.cases';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import { recordJestEvidence } from './support/evidence';
import type { Fixtures } from './support/fixtures';

describe('NS-1 canonical source evidence', () => {
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
  it('NS-SOURCE [HTTP] [E-MINT] production journal detail rereads exact retained date and resolves exact parent', async () => {
    await cases[0].run({
      apiBase: 'http://127.0.0.1/api',
      fixtures: fx.binView(),
      mintProvenance: () => http.mintProvenance(),
      evidence: { enabled: true, record: recordJestEvidence },
      request: async (route, init) => {
        if (typeof init?.body !== 'string')
          throw new Error('JSON proof body required');
        const response = await request(http.app.getHttpServer())
          .post('/api' + route)
          .set(init?.headers as Record<string, string>)
          .send(JSON.parse(init.body) as object);
        return { status: response.status, body: response.body as unknown };
      },
    });
  }, 120_000);
});
