import { personalClientProof } from './support/personal-client-proof';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { recordJestEvidence } from './support/evidence';
import { releaseBookingProof } from './support/release-booking-proof';
describe('Widget release programme [HTTP] [PostgreSQL]', () => {
  let db: FixtureContext;
  let http: HttpHarness;
  let fx: Fixtures;
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
  it('WR-CREATE [E-MINT] DRAFT and COMMIT traverse the canonical owners with a traced production predecessor', async () => {
    const base = await http.listenLoopback();
    const proofs = await releaseBookingProof({
      apiBase: base,
      fixtures: fx.binView(),
      mintProvenance: () => http.mintProvenance(),
      request: async (route, init) => {
        const r = await fetch(`${base}/api${route}`, init);
        return { status: r.status, body: (await r.json()) as unknown };
      },
      evidence: {
        enabled: false,
        record: () => {
          throw new Error('Use the HTTP evidence writer');
        },
      },
    });
    for (const p of proofs) recordJestEvidence(p);
    expect(proofs).toHaveLength(3);
  });
  it('SB1-HTTP [HTTP] explicit owner personal context reaches canonical booking with durable actor attribution', async () => {
    const base = await http.listenLoopback();
    await personalClientProof({
      apiBase: base,
      fixtures: fx.binView(),
      mintProvenance: () => http.mintProvenance(),
      request: async (route, init) => {
        const r = await fetch(`${base}/api${route}`, init);
        return { status: r.status, body: (await r.json()) as unknown };
      },
      evidence: {
        enabled: false,
        record: () => {
          throw new Error('No widget gate claim');
        },
      },
    });
  });
});
