import { Gate14DisagreementMetric } from '../../src/widgets/routing/gate14-disagreement.metric';
import { bootFixtureContext, type FixtureContext } from './support/bootstrap';
import {
  bootHttp,
  fixturesForHttp,
  type HttpHarness,
} from './support/http-bootstrap';
import type { Fixtures } from './support/fixtures';
import { recordJestEvidence } from './support/evidence';
import { releaseRevocationProof } from './support/release-revocation-proof';
describe('AR release revocation [HTTP] [PostgreSQL]', () => {
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
  it('AR-G6-REVOCATION [E-MINT] real post-Gate6 revoke refuses at canonical admission and increments metric', async () => {
    const base = await http.listenLoopback();
    const proofs = await releaseRevocationProof({
      apiBase: base,
      fixtures: fx.binView(),
      mintProvenance: () => http.mintProvenance(),
      gate14DisagreementCount: () =>
        http.app.get(Gate14DisagreementMetric).value('entitlement_denied'),
      request: async (route, init) => {
        const r = await fetch(base + '/api' + route, init);
        return { status: r.status, body: (await r.json()) as unknown };
      },
      evidence: {
        enabled: false,
        record: () => {
          throw new Error('HTTP writer required');
        },
      },
    });
    for (const p of proofs) recordJestEvidence(p);
    expect(proofs).toHaveLength(1);
  });
});
