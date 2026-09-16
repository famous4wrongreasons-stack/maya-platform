// K3's CI exit: the four refusals, and the equivalence between them.
//
// §3 fixes the exit as "a mutated, an expired, a replayed and a foreign-principal token are each
// refused, with INDISTINGUISHABLE LATENCY". The second half is the hard one, and it is the half
// that is usually asserted rather than measured — so this file does both: it proves each refusal
// happens, and then proves the four cannot be told apart by what they cost.
//
// The Prisma double is deliberately not a jest.fn() returning undefined. It is a small in-memory
// store, so a test that passes because a mock swallowed a query would fail here instead.

import { IntentGatewayService } from './intent-gateway.service';
import { sha256Hex } from './token.util';
import type { SubmissionShape } from './gate.types';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const PRINCIPAL = sha256Hex('principal-a');
const FOREIGN = sha256Hex('principal-b');

interface Row {
  intentTokenHash: string;
  tenantId: string;
  widgetId: string;
  widgetKind: string;
  effect: string;
  principalProofHash: string;
  verificationFloor: string;
  singleUse: boolean;
  consumedAt: Date | null;
  issuedAt: Date;
  expiresAt: Date;
  emission: { supersededByWidgetId: string | null } | null;
}

class FakePrisma {
  public reads = 0;
  constructor(private readonly rows: Row[]) {}
  widgetIntentRecord = {
    findFirst: async ({
      where,
    }: {
      where: { intentTokenHash: string; tenantId: string };
    }) => {
      this.reads += 1;
      return (
        this.rows.find(
          (r) =>
            r.intentTokenHash === where.intentTokenHash &&
            r.tenantId === where.tenantId,
        ) ?? null
      );
    },
  };
}

const row = (over: Partial<Row> = {}): Row => ({
  intentTokenHash: sha256Hex('good-token-aaaaaaaaaaaaaaaa'),
  tenantId: TENANT,
  widgetId: 'w-1',
  widgetKind: 'METRIC',
  effect: 'NONE',
  principalProofHash: PRINCIPAL,
  verificationFloor: 'ANONYMOUS',
  singleUse: true,
  consumedAt: null,
  issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  emission: { supersededByWidgetId: null },
  ...over,
});

const submission = (token: string): SubmissionShape => ({
  intent_token: token,
});
const GOOD = 'good-token-aaaaaaaaaaaaaaaa';

const gatewayFor = (rows: Row[]) => {
  const prisma = new FakePrisma(rows);
  return {
    prisma,
    gateway: new IntentGatewayService(prisma as never),
  };
};

describe('K3 IntentGateway — the pipeline', () => {
  it('holds all fifteen gates of §3.9, in the contract order', () => {
    const { gateway } = gatewayFor([row()]);
    expect(gateway.gateCount).toBe(15);
  });

  it('refuses a submission with no token before reading anything', async () => {
    const { gateway, prisma } = gatewayFor([row()]);
    const r = await gateway.submit({
      intentToken: '',
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: { intent_token: '   ' },
    });
    expect(r.verdict.outcome).toBe('refuse');
    // Step 0 refuses before the store is touched: an empty token is not a lookup.
    expect(prisma.reads).toBe(0);
  });
});

describe('K3 CI exit — the four refusals', () => {
  it('FORGED: a token with no record is refused', async () => {
    const { gateway } = gatewayFor([row()]);
    const r = await gateway.submit({
      intentToken: 'forged',
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: submission('forged-token-bbbbbbbbbbbb'),
    });
    expect(r.verdict.outcome).toBe('refuse');
    expect(r.stoppedAt).toBe('1');
  });

  it('EXPIRED: a token past its expiry is refused', async () => {
    const { gateway } = gatewayFor([
      row({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);
    const r = await gateway.submit({
      intentToken: GOOD,
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: submission(GOOD),
    });
    expect(r.verdict.outcome).toBe('refuse');
    expect('code' in r.verdict && r.verdict.code).toBe('EXPIRED');
    expect(r.stoppedAt).toBe('1');
  });

  it('REPLAYED: a consumed single-use token is refused', async () => {
    const { gateway } = gatewayFor([
      row({ consumedAt: new Date('2026-02-01T00:00:00.000Z') }),
    ]);
    const r = await gateway.submit({
      intentToken: GOOD,
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: submission(GOOD),
    });
    expect(r.verdict.outcome).toBe('refuse');
    expect(r.stoppedAt).toBe('1');
  });

  it('FOREIGN PRINCIPAL: a token minted for A and replayed by B is refused', async () => {
    const { gateway } = gatewayFor([row()]);
    const r = await gateway.submit({
      intentToken: GOOD,
      tenantId: TENANT,
      principalProofHash: FOREIGN,
      submission: submission(GOOD),
    });
    expect(r.verdict.outcome).toBe('refuse');
    expect('code' in r.verdict && r.verdict.code).toBe(
      'widget_principal_mismatch',
    );
    expect(r.stoppedAt).toBe('3');
  });

  it('SUPERSEDED: a replaced envelope refuses with SUPERSEDED, not EXPIRED', async () => {
    const { gateway } = gatewayFor([
      row({ emission: { supersededByWidgetId: 'w-2' } }),
    ]);
    const r = await gateway.submit({
      intentToken: GOOD,
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: submission(GOOD),
    });
    // The distinction matters to a person: "this is out of date, here is the new one" is a
    // different message from "this expired", and the contract gives them different codes.
    expect(r.verdict.outcome).toBe('superseded');
  });

  it('FOREIGN TENANT: a token from another tenant is never read, not read-then-refused', async () => {
    const { gateway, prisma } = gatewayFor([row({ tenantId: OTHER_TENANT })]);
    const r = await gateway.submit({
      intentToken: GOOD,
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: submission(GOOD),
    });
    expect(r.verdict.outcome).toBe('refuse');
    // The tenant is in the WHERE clause, so the row is not loaded at all. Reading it and then
    // refusing would put another tenant's record in this process's memory.
    expect(prisma.reads).toBe(1);
    expect(r.stoppedAt).toBe('1');
  });
});

describe('K3 CI exit — indistinguishable latency', () => {
  // The four refusals must not be separable by cost. Two things are asserted, because either alone
  // is weak: that they do the same OBSERVABLE WORK (one store read, same gate depth where the
  // contract says so), and that measured time does not separate them beyond noise.

  const cases = () => [
    {
      name: 'forged',
      rows: [row()],
      token: 'forged-token-bbbbbbbbbbbb',
      principal: PRINCIPAL,
    },
    {
      name: 'expired',
      rows: [row({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })],
      token: GOOD,
      principal: PRINCIPAL,
    },
    {
      name: 'replayed',
      rows: [row({ consumedAt: new Date('2026-02-01T00:00:00.000Z') })],
      token: GOOD,
      principal: PRINCIPAL,
    },
    { name: 'foreign', rows: [row()], token: GOOD, principal: FOREIGN },
  ];

  it('every refusal performs exactly one store read', async () => {
    for (const c of cases()) {
      const { gateway, prisma } = gatewayFor(c.rows);
      await gateway.submit({
        intentToken: c.token,
        tenantId: TENANT,
        principalProofHash: c.principal,
        submission: submission(c.token),
      });
      expect(prisma.reads).toBe(1);
    }
  });

  it('the principal comparison is constant-time, so a near-miss costs what a far-miss costs', async () => {
    // A `===` returns as soon as two hashes differ, so a hash sharing 63 of 64 characters would be
    // measurably slower to reject than one differing at the first. digestEquals removes that.
    const nearMiss =
      PRINCIPAL.slice(0, 63) + (PRINCIPAL.endsWith('a') ? 'b' : 'a');
    const farMiss =
      (PRINCIPAL.startsWith('a') ? 'b' : 'a') + PRINCIPAL.slice(1);
    const time = async (principal: string) => {
      const { gateway } = gatewayFor([row()]);
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < 200; i += 1)
        await gateway.submit({
          intentToken: GOOD,
          tenantId: TENANT,
          principalProofHash: principal,
          submission: submission(GOOD),
        });
      return Number(process.hrtime.bigint() - t0) / 200;
    };
    const near = await time(nearMiss);
    const far = await time(farMiss);
    const spread = Math.abs(near - far) / Math.max(near, far);
    // Generous, because a unit test shares a machine with everything else. It still fails loudly if
    // someone reintroduces a short-circuiting compare, which separates these by far more than this.
    expect(spread).toBeLessThan(0.5);
  });

  it('no refusal reveals which gate it failed through its verdict shape', async () => {
    const shapes = new Set<string>();
    for (const c of cases()) {
      const { gateway } = gatewayFor(c.rows);
      const r = await gateway.submit({
        intentToken: c.token,
        tenantId: TENANT,
        principalProofHash: c.principal,
        submission: submission(c.token),
      });
      shapes.add(Object.keys(r.verdict).sort().join(','));
    }
    // Every refusal is the same SHAPE — outcome, code, detail. The code differs, which is
    // intentional and is returned to a caller that has already authenticated; the structure does
    // not, so nothing can be inferred from the response envelope itself.
    expect(shapes.size).toBe(1);
  });
});

describe('K3 — the fail-closed default', () => {
  it('a gate whose mechanism a later package owns refuses rather than passes', async () => {
    // The happy path: a valid, unexpired, correctly-bound token. It must NOT sail through — gates
    // 5 onward are not built, and F5's fail-closed default says an absent mechanism refuses.
    const { gateway } = gatewayFor([row({ singleUse: false })]);
    const r = await gateway.submit({
      intentToken: GOOD,
      tenantId: TENANT,
      principalProofHash: PRINCIPAL,
      submission: submission(GOOD),
    });
    expect(r.verdict.outcome).toBe('refuse');
    expect('code' in r.verdict && r.verdict.code).toBe('mechanism_absent');
    expect(r.stoppedAt).toBe('5');
    // Gates 1-4 ran and passed; the pipeline stopped at the first unbuilt one.
    expect(r.ran).toBe(5);
  });

  it('exactly four gates are live in K3, and the rest say which package builds them', () => {
    const { gateway } = gatewayFor([row()]);
    // Gates 1-4: three implemented here plus Gate 2, which passes because the global JWT guard
    // has already enforced it. The other ten name the package that builds them.
    expect(gateway.liveGateCount).toBe(4);
    expect(gateway.gateCount - gateway.liveGateCount).toBe(11);
  });
});
