// K3's CI exit: the four refusals, and the equivalence between them.
//
// §3 fixes the exit as "a mutated, an expired, a replayed and a foreign-principal token are each
// refused, with INDISTINGUISHABLE LATENCY". The second half is the hard one, and it is the half
// that is usually asserted rather than measured — so this file does both: it proves each refusal
// happens, and then proves the four cannot be told apart by what they cost.
//
// The Prisma double is deliberately not a jest.fn() returning undefined. It is a small in-memory
// store of two tables that HONOURS `select` — top level and the nested `emission.select` — and
// requires the tenant in `where`. A double that returned whole rows could not see a column missing
// from `findRecord`'s select (F42), nor a class C column loaded into memory by one. It is still a
// double: only a real `select` in Postgres proves the read (the live harness, plan §4.2).
//
// Every test here is a function-level regression aid (class U). None of it is live-path proof.

import fs from 'node:fs';
import path from 'node:path';

import { UserRole } from '../common/domain.enums';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import type { VerificationLevel } from '../widget-contract/envelope';
import type { ChannelId } from '../widget-contract/lifecycle';
import type {
  Gate,
  GateContext,
  GateVerdict,
  IntentRecordRow,
  SubmissionShape,
} from './gate.types';
import * as gate5Module from './gates/gate5';
import * as gate6Module from './gates/gate6';
import { IntentGatewayService } from './intent-gateway.service';
import { sha256Hex } from './token.util';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const PRINCIPAL = sha256Hex('principal-a');
const FOREIGN = sha256Hex('principal-b');
const GOOD = 'good-token-aaaaaaaaaaaaaaaa';
const WIDGET = 'w-1';

/** Bytes that live only in class C columns. None may ever reach a gate. */
const C_SENTINEL = 'SENTINEL-CLASS-C';

// ── the store double ─────────────────────────────────────────────────────────────────────────────

/** Every column of `WidgetIntentRecord` the double stores, class C ones included. */
interface RecordRow {
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
  priority: number;
  capabilitySpace: string | null;
  capabilityKey: string | null;
  handoffSpace: string | null;
  handoffKey: string | null;
  targetJson: unknown;
  confirmationJson: unknown;
  bodyHash: string;
  selectionDomain: string;
  inputSchemaHash: string | null;
  requestedScopeHash: string;
  c9Domain: string | null;
  runId: string | null;
  revisionId: string | null;
  approvalOfIntentRef: string | null;
  confirmationOfKind: string | null;
  confirmationOfRef: string | null;
  producedByIntentTokenHash: string | null;
  actionReceiptRef: string | null;
  frozenNounsJson: unknown;
  // class C
  utteranceTemplate: string | null;
  renderedUtterance: string | null;
  selectedLabels: string[];
  selectionDomainLabelsJson: unknown;
  spokenTranscript: string | null;
  erasedAt: Date | null;
}

interface EmissionRow {
  widgetId: string;
  tenantId: string;
  kind: string;
  deliveryChannel: string;
  lifecycleState: string;
  supersededByWidgetId: string | null;
  // class C
  bodyJson: unknown;
  speechJson: unknown;
}

type Select = Readonly<Record<string, unknown>>;

const project = (
  row: Readonly<Record<string, unknown>>,
  select: Select,
  table: string,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, how] of Object.entries(select)) {
    if (how !== true)
      throw new Error(`${table}.${key}: this double projects \`true\` only`);
    if (!Object.prototype.hasOwnProperty.call(row, key))
      throw new Error(`${table}.${key}: no such column`);
    out[key] = row[key];
  }
  return out;
};

class FakePrisma {
  public reads = 0;
  public readonly selects: Select[] = [];
  constructor(
    private readonly records: RecordRow[],
    private readonly emissions: EmissionRow[],
  ) {}
  widgetIntentRecord = {
    // Not `async`: this double awaits nothing. The caller awaits the value either way.
    findFirst: (args: {
      where: { intentTokenHash: string; tenantId: string };
      select?: Select;
    }) => {
      this.reads += 1;
      if (typeof args.where.tenantId !== 'string')
        throw new Error('a record read without a tenant in its WHERE');
      if (!args.select)
        throw new Error('a record read without a select loads every column');
      this.selects.push(args.select);
      const found = this.records.find(
        (r) =>
          r.intentTokenHash === args.where.intentTokenHash &&
          r.tenantId === args.where.tenantId,
      );
      if (!found) return null;
      const { emission, ...columns } = args.select;
      const out = project(
        found as unknown as Record<string, unknown>,
        columns,
        'WidgetIntentRecord',
      );
      if (emission !== undefined) {
        const nested = (emission as { select?: Select }).select;
        if (!nested) throw new Error('emission joined without its own select');
        const e = this.emissions.find(
          (x) => x.widgetId === found.widgetId && x.tenantId === found.tenantId,
        );
        out.emission = e
          ? project(
              e as unknown as Record<string, unknown>,
              nested,
              'WidgetEmission',
            )
          : null;
      }
      return out;
    },
  };
}

const record = (over: Partial<RecordRow> = {}): RecordRow => ({
  intentTokenHash: sha256Hex(GOOD),
  tenantId: TENANT,
  widgetId: WIDGET,
  widgetKind: 'METRIC',
  effect: 'NONE',
  principalProofHash: PRINCIPAL,
  verificationFloor: 'ANONYMOUS',
  singleUse: true,
  consumedAt: null,
  issuedAt: new Date('2026-01-01T00:00:00.000Z'),
  expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  priority: 1,
  capabilitySpace: null,
  capabilityKey: null,
  handoffSpace: null,
  handoffKey: null,
  targetJson: null,
  confirmationJson: null,
  bodyHash: sha256Hex('body'),
  selectionDomain: '',
  inputSchemaHash: null,
  requestedScopeHash: sha256Hex('scope'),
  c9Domain: null,
  runId: null,
  revisionId: null,
  approvalOfIntentRef: null,
  confirmationOfKind: null,
  confirmationOfRef: null,
  producedByIntentTokenHash: null,
  actionReceiptRef: null,
  frozenNounsJson: null,
  utteranceTemplate: `${C_SENTINEL} template`,
  renderedUtterance: `${C_SENTINEL} utterance`,
  selectedLabels: [`${C_SENTINEL} label`],
  selectionDomainLabelsJson: { opt: `${C_SENTINEL} label` },
  spokenTranscript: `${C_SENTINEL} transcript`,
  erasedAt: null,
  ...over,
});

const emission = (over: Partial<EmissionRow> = {}): EmissionRow => ({
  widgetId: WIDGET,
  tenantId: TENANT,
  kind: 'METRIC',
  deliveryChannel: 'pwa',
  lifecycleState: 'MINTED',
  supersededByWidgetId: null,
  bodyJson: { text: `${C_SENTINEL} body` },
  speechJson: { lead: `${C_SENTINEL} speech` },
  ...over,
});

// ── the request ──────────────────────────────────────────────────────────────────────────────────

const ACTOR: Readonly<AuthenticatedUser> = Object.freeze({
  userId: 'user-a',
  sessionId: 'session-a',
  tenantId: TENANT,
  role: UserRole.ADMINISTRATOR,
  email: 'a@example.test',
  branchId: null,
  membershipId: 'membership-a',
  membershipStatus: 'active',
});

const submission = (token: string): SubmissionShape => ({
  intent_token: token,
});

/** The whole argument set the controller passes, so no test omits a required input. */
const args = (
  over: Partial<{
    token: string;
    tenantId: string;
    principalProofHash: string;
    verificationLevel: VerificationLevel;
    carrier: ChannelId;
    submission: SubmissionShape;
  }> = {},
) => {
  const token = over.token ?? GOOD;
  return {
    intentToken: token,
    tenantId: over.tenantId ?? TENANT,
    actor: ACTOR,
    principalProofHash: over.principalProofHash ?? PRINCIPAL,
    submission: over.submission ?? submission(token),
    verificationLevel: over.verificationLevel ?? 'SESSION_VERIFIED',
    carrier: over.carrier ?? 'pwa',
  };
};

const gatewayFor = (
  records: RecordRow[],
  emissions: EmissionRow[] = [emission()],
) => {
  const prisma = new FakePrisma(records, emissions);
  return {
    prisma,
    gateway: new IntentGatewayService(prisma as never),
  };
};

const code = (v: GateVerdict) => ('code' in v ? v.code : null);

/** The pipeline array, read for inspection only. It is private because nothing may rewire it. */
const slotsOf = (gateway: IntentGatewayService): readonly Gate[] =>
  (gateway as unknown as { gates: readonly Gate[] }).gates;

afterEach(() => jest.restoreAllMocks());

// ── the tests ────────────────────────────────────────────────────────────────────────────────────

describe('K3 IntentGateway — the pipeline', () => {
  it('holds all fifteen gates of §3.9, in the contract order', () => {
    const { gateway } = gatewayFor([record()]);
    expect(gateway.gateCount).toBe(15);
    expect(slotsOf(gateway).map((g) => g.n)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '8-R',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
    ]);
  });

  it('refuses a submission with no token before reading anything', async () => {
    const { gateway, prisma } = gatewayFor([record()]);
    const r = await gateway.submit(
      args({ token: '', submission: { intent_token: '   ' } }),
    );
    expect(r.verdict.outcome).toBe('refuse');
    expect(code(r.verdict)).toBe('unauthenticated');
    expect(r.stoppedAt).toBe('0');
    // Step 0 refuses before the store is touched: an empty token is not a lookup.
    expect(prisma.reads).toBe(0);
  });
});

describe('K3 CI exit — the four refusals', () => {
  it('FORGED: a token with no record is refused', async () => {
    const { gateway } = gatewayFor([record()]);
    const r = await gateway.submit(
      args({ token: 'forged-token-bbbbbbbbbbbb' }),
    );
    expect(r.verdict.outcome).toBe('refuse');
    expect(code(r.verdict)).toBe('EXPIRED');
    expect(r.stoppedAt).toBe('1');
  });

  it('EXPIRED: a token past its expiry is refused', async () => {
    const { gateway } = gatewayFor([
      record({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);
    const r = await gateway.submit(args());
    expect(r.verdict.outcome).toBe('refuse');
    expect(code(r.verdict)).toBe('EXPIRED');
    expect(r.stoppedAt).toBe('1');
  });

  it('REPLAYED: a consumed single-use token is refused', async () => {
    const { gateway } = gatewayFor([
      record({ consumedAt: new Date('2026-02-01T00:00:00.000Z') }),
    ]);
    const r = await gateway.submit(args());
    expect(r.verdict.outcome).toBe('refuse');
    expect(code(r.verdict)).toBe('EXPIRED');
    expect(r.stoppedAt).toBe('1');
  });

  it('FOREIGN PRINCIPAL: a token minted for A and replayed by B is refused', async () => {
    const { gateway } = gatewayFor([record()]);
    const r = await gateway.submit(args({ principalProofHash: FOREIGN }));
    expect(r.verdict.outcome).toBe('refuse');
    expect(code(r.verdict)).toBe('widget_principal_mismatch');
    expect(r.stoppedAt).toBe('3');
  });

  it('SUPERSEDED: a replaced envelope refuses with SUPERSEDED, not EXPIRED', async () => {
    const { gateway } = gatewayFor(
      [record()],
      [emission({ supersededByWidgetId: 'w-2' })],
    );
    const r = await gateway.submit(args());
    // The distinction matters to a person: "this is out of date, here is the new one" is a
    // different message from "this expired", and the contract gives them different codes.
    expect(r.verdict.outcome).toBe('superseded');
    expect(code(r.verdict)).toBe('SUPERSEDED');
    expect(r.stoppedAt).toBe('1');
  });

  it('FOREIGN TENANT: a token from another tenant is never read, not read-then-refused', async () => {
    const { gateway, prisma } = gatewayFor(
      [record({ tenantId: OTHER_TENANT })],
      [emission({ tenantId: OTHER_TENANT })],
    );
    const r = await gateway.submit(args());
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
      rows: [record()],
      token: 'forged-token-bbbbbbbbbbbb',
      principal: PRINCIPAL,
    },
    {
      name: 'expired',
      rows: [record({ expiresAt: new Date('2020-01-01T00:00:00.000Z') })],
      token: GOOD,
      principal: PRINCIPAL,
    },
    {
      name: 'replayed',
      rows: [record({ consumedAt: new Date('2026-02-01T00:00:00.000Z') })],
      token: GOOD,
      principal: PRINCIPAL,
    },
    { name: 'foreign', rows: [record()], token: GOOD, principal: FOREIGN },
  ];

  it('every refusal performs exactly one store read', async () => {
    for (const c of cases()) {
      const { gateway, prisma } = gatewayFor(c.rows);
      await gateway.submit(
        args({ token: c.token, principalProofHash: c.principal }),
      );
      expect({ name: c.name, reads: prisma.reads }).toEqual({
        name: c.name,
        reads: 1,
      });
    }
  });

  it('the principal comparison is structurally constant-time: slot 3 compares through digestEquals, which uses timingSafeEqual', () => {
    // This is the detector. A timing test cannot be one at this scale: a short-circuiting `===` over
    // two 64-character digests differs by nanoseconds, while one gateway submission costs far more,
    // so the measured spread is noise either way. That was proven by mutation on 2026-09-17: with
    // slot 3's compare replaced by `===`, the timing test below still passed 3 of 3 runs.
    const gw = fs.readFileSync(
      path.join(__dirname, 'intent-gateway.service.ts'),
      'utf8',
    );
    const slot3 = gw.slice(gw.indexOf("n: '3'"), gw.indexOf("n: '4'"));
    expect(slot3).toMatch(
      /digestEquals\(\s*r\.principalProofHash,\s*ctx\.principalProofHash\s*\)/,
    );
    expect(slot3).not.toMatch(/principalProofHash\s*[!=]==/);
    const util = fs.readFileSync(path.join(__dirname, 'token.util.ts'), 'utf8');
    const body = util.slice(util.indexOf('export const digestEquals'));
    expect(body).toMatch(/timingSafeEqual\(/);
    expect(body.slice(0, body.indexOf('};'))).not.toMatch(/\ba\s*===\s*b\b/);
  });

  it('refusal latency does not separate a near-miss from a far-miss beyond noise (a sanity bound, not the detector)', async () => {
    // Warmed up, interleaved and compared by median, because the first version timed one path cold
    // and then the other warm: JIT warm-up alone produced a 0.69 spread on a loaded machine.
    const nearMiss =
      PRINCIPAL.slice(0, 63) + (PRINCIPAL.endsWith('a') ? 'b' : 'a');
    const farMiss =
      (PRINCIPAL.startsWith('a') ? 'b' : 'a') + PRINCIPAL.slice(1);
    const { gateway } = gatewayFor([record()]);
    const round = async (principal: string, n: number) => {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < n; i += 1)
        await gateway.submit(args({ principalProofHash: principal }));
      return Number(process.hrtime.bigint() - t0) / n;
    };
    await round(nearMiss, 50);
    await round(farMiss, 50);
    const near: number[] = [];
    const far: number[] = [];
    for (let r = 0; r < 10; r += 1) {
      if (r % 2 === 0) {
        near.push(await round(nearMiss, 40));
        far.push(await round(farMiss, 40));
      } else {
        far.push(await round(farMiss, 40));
        near.push(await round(nearMiss, 40));
      }
    }
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const n = median(near);
    const f = median(far);
    expect(Math.abs(n - f) / Math.max(n, f)).toBeLessThan(0.5);
  });

  it('no refusal reveals which gate it failed through its verdict shape', async () => {
    const shapes = new Set<string>();
    for (const c of cases()) {
      const { gateway } = gatewayFor(c.rows);
      const r = await gateway.submit(
        args({ token: c.token, principalProofHash: c.principal }),
      );
      shapes.add(Object.keys(r.verdict).sort().join(','));
    }
    // Every refusal is the same SHAPE — outcome, code, detail. The code differs, which is
    // intentional and is returned to a caller that has already authenticated; the structure does
    // not, so nothing can be inferred from the response envelope itself.
    expect(shapes.size).toBe(1);
  });
});

describe('the pipeline after U0 — slots 8, 9 and 10 are refusing stubs', () => {
  it('a valid token runs the REAL gates 1..7, then refuses at the unbuilt Gate 8', async () => {
    // Before U0 this token passed a legacy Gate 8 that failed open, and a Gate 8-R keyed on the
    // carrier, and stopped at Gate 9. Slot 8 is a refusing stub now (G8 §5.0), so nothing past it
    // is reached. The route is dark, so no client sees the difference.
    const { gateway, prisma } = gatewayFor([record({ singleUse: false })]);
    const r = await gateway.submit(args());
    expect(r.verdict.outcome).toBe('refuse');
    expect(code(r.verdict)).toBe('mechanism_absent');
    expect('detail' in r.verdict && r.verdict.detail).toMatch(
      /^gate 8 \(Input validation\) is NORMATIVE-PENDING on /,
    );
    expect(r.stoppedAt).toBe('8');
    // 1, 2, 3, 4, 5, 6, 7 ran and passed; 8 ran and refused.
    expect(r.ran).toBe(8);
    // One read, and the double has no write method at all: a refusal at 8 wrote nothing.
    expect(prisma.reads).toBe(1);
  });

  it('it stops at 8 whatever the submission carries: inputs and a readback reach no gate', async () => {
    const { gateway } = gatewayFor([record({ singleUse: false })]);
    const r = await gateway.submit(
      args({
        carrier: 'realtime-voice',
        submission: {
          intent_token: GOOD,
          inputs: { choice: 'not-offered', blob: 'x'.repeat(20 * 1024) },
          readback_ack: {
            readback_ref: 'rb',
            body_hash: 'd'.repeat(64),
            affirmation: 'да',
          },
        },
      }),
    );
    expect(code(r.verdict)).toBe('mechanism_absent');
    expect(r.stoppedAt).toBe('8');
  });

  it('exactly three slots are pending() stubs: 8, 9 and 10; twelve run their own logic', () => {
    const { gateway } = gatewayFor([record()]);
    // GATE MODULE EXISTS != GATE ENFORCED. A slot that refuses because it is not built is counted
    // as not built, never as a gate that runs.
    expect(
      slotsOf(gateway)
        .filter((g) => g.pendingOn !== undefined)
        .map((g) => g.n),
    ).toEqual(['8', '9', '10']);
    expect(gateway.gateCount).toBe(15);
    expect(gateway.liveGateCount).toBe(12);
  });

  it('every pending slot refuses mechanism_absent, naming itself', async () => {
    const { gateway } = gatewayFor([record()]);
    for (const g of slotsOf(gateway).filter((s) => s.pendingOn)) {
      const v = await g.run({} as GateContext);
      expect(v.outcome).toBe('refuse');
      expect(code(v)).toBe('mechanism_absent');
      expect('detail' in v && v.detail).toContain(`gate ${g.n} (${g.name})`);
    }
  });

  it('T-PENDING8 / D-12, source half: the legacy Gate 8 and Gate 10 code is gone, not bypassed', () => {
    const gates = path.join(__dirname, 'gates');
    expect(fs.existsSync(path.join(gates, 'gate8.ts'))).toBe(false);
    expect(fs.existsSync(path.join(gates, 'gate10.ts'))).toBe(false);
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    const legacy = new RegExp(
      '\\b(?:const|let|var|function|interface|type|class)\\s+(' +
        [
          'gate' + '8',
          'gate' + '10',
          'MAX_SUBMISSION' + '_BYTES',
          'Divergence' + 'Record',
          'diver' + 'gences',
          'effectClass' + 'Of',
        ].join('|') +
        ')\\b',
    );
    const declared = walk(__dirname)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .filter((f) => legacy.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(__dirname, f));
    expect(declared).toEqual([]);
  });
});

describe('findRecord — one tenant-scoped read of the §2.4 union, with confirmation projected (D-3)', () => {
  /** The record exactly as slot 5 receives it, through the real pipeline. */
  const recordSeenByGate5 = async (
    records: RecordRow[],
    emissions: EmissionRow[] = [emission()],
  ): Promise<{ row: IntentRecordRow | null; prisma: FakePrisma }> => {
    const real = gate5Module.gate5;
    let row: IntentRecordRow | null = null;
    jest.spyOn(gate5Module, 'gate5').mockImplementation((ctx) => {
      row = ctx.record;
      return real(ctx);
    });
    const { gateway, prisma } = gatewayFor(records, emissions);
    await gateway.submit(args());
    return { row, prisma };
  };

  it('selects every AUDIT_RETAINED column the gates read, and the envelope through its own select', async () => {
    const { prisma } = await recordSeenByGate5([record()]);
    expect(prisma.selects).toHaveLength(1);
    const { emission: nested, ...columns } = prisma.selects[0];
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'c9Domain',
        'requestedScopeHash',
        'runId',
        'revisionId',
        'approvalOfIntentRef',
        'frozenNounsJson',
        'confirmationJson',
      ]),
    );
    expect(nested).toEqual({
      select: {
        supersededByWidgetId: true,
        deliveryChannel: true,
        lifecycleState: true,
      },
    });
    for (const c of [
      'renderedUtterance',
      'utteranceTemplate',
      'selectedLabels',
      'selectionDomainLabelsJson',
      'spokenTranscript',
    ])
      expect(Object.keys(columns)).not.toContain(c);
  });

  it('a gate receives the flattened envelope members and no class C byte', async () => {
    // Neither value is the default a hard-coded member would carry (the route's carrier is 'pwa',
    // and an emission starts 'MINTED'), so the row can only hold them by reading the envelope.
    const { row } = await recordSeenByGate5(
      [
        record({
          c9Domain: 'OCCUPANCY',
          runId: 'run-1',
          revisionId: 'rev-1',
          approvalOfIntentRef: 'appr-1',
          frozenNounsJson: [{ noun: 'client', handle: 'h1' }],
        }),
      ],
      [
        emission({
          deliveryChannel: 'telegram-miniapp',
          lifecycleState: 'LIVE',
        }),
      ],
    );
    expect(row).not.toBeNull();
    const seen = row as unknown as Record<string, unknown>;
    expect(seen).toMatchObject({
      deliveryChannel: 'telegram-miniapp',
      emissionLifecycleState: 'LIVE',
      supersededByWidgetId: null,
      c9Domain: 'OCCUPANCY',
      requestedScopeHash: sha256Hex('scope'),
      runId: 'run-1',
      revisionId: 'rev-1',
      approvalOfIntentRef: 'appr-1',
      frozenNounsJson: [{ noun: 'client', handle: 'h1' }],
      confirmation: null,
      confirmationIdempotencyKey: null,
    });
    for (const gone of ['emission', 'confirmationJson', 'renderedUtterance'])
      expect(Object.keys(seen)).not.toContain(gone);
    expect(JSON.stringify(seen)).not.toContain(C_SENTINEL);
  });

  const F_DEF_REQ = {
    risk_tier: 'low_write',
    reversible: { state: 'KNOWN', value: true },
    audience_size: null,
    requires_explicit_confirm_step: true,
    requires_readback: true,
    readback_ref: 'R-1',
    readback_text: `${C_SENTINEL} readback text`,
    idempotency_key: 'K-1',
    approval_policy: `${C_SENTINEL} approval policy`,
  };

  const projections: ReadonlyArray<
    readonly [string, unknown, IntentRecordRow['confirmation'], unknown]
  > = [
    ['SQL null', null, null, null],
    [
      'F-DEF-REQ: the two members and the key, and nothing else',
      F_DEF_REQ,
      { requires_readback: true, readback_ref: 'R-1' },
      'K-1',
    ],
    [
      'F-DEF-COERCE: a string "true" stays a string',
      { ...F_DEF_REQ, requires_readback: 'true' },
      { requires_readback: 'true', readback_ref: 'R-1' },
      'K-1',
    ],
    [
      'F-DEF-COERCE: an omitted member stays missing',
      { readback_ref: null, idempotency_key: 7 },
      { requires_readback: undefined, readback_ref: null },
      7,
    ],
    ['an array is not a confirmation', [F_DEF_REQ], null, null],
    ['a scalar is not a confirmation', 'requires_readback', null, null],
  ];

  it.each(projections)(
    'D-3 %s',
    async (_name, stored, confirmation, idempotencyKey) => {
      const { row } = await recordSeenByGate5([
        record({ confirmationJson: stored }),
      ]);
      expect(row?.confirmation).toStrictEqual(confirmation);
      expect(row?.confirmationIdempotencyKey).toStrictEqual(idempotencyKey);
      // `readback_text` and `approval_policy` never reach a gate, in any member.
      expect(JSON.stringify(row)).not.toContain(C_SENTINEL);
    },
  );

  it('a record without its envelope is a store fault: it throws, and returns no verdict', async () => {
    const { gateway } = gatewayFor([record()], []);
    await expect(gateway.submit(args())).rejects.toThrow(
      /without its WidgetEmission/,
    );
  });
});

describe('J-1 — facts reach later slots only through mergeFacts (runner)', () => {
  it('the context starts with no facts and carries the actor it was given', async () => {
    let seen: GateContext | null = null;
    const real = gate5Module.gate5;
    jest.spyOn(gate5Module, 'gate5').mockImplementation((ctx) => {
      seen = ctx;
      return real(ctx);
    });
    const { gateway } = gatewayFor([record()]);
    await gateway.submit(args());
    const ctx = seen as GateContext | null;
    expect(ctx?.facts).toEqual({});
    expect(ctx?.actor).toBe(ACTOR);
    expect(Object.keys(ctx ?? {})).not.toContain('resolved' + 'Roles');
  });

  it('X-M1 on the real pipeline: slot 5 passing a fact it does not produce throws, and no later slot runs', async () => {
    jest.spyOn(gate5Module, 'gate5').mockReturnValue({
      outcome: 'pass',
      facts: { selectedLabels: [] },
    });
    const gate6 = jest.spyOn(gate6Module, 'gate6');
    const { gateway } = gatewayFor([record()]);
    await expect(gateway.submit(args())).rejects.toThrow(
      /slot 5 produced selectedLabels, whose producer is slot 8/,
    );
    expect(gate6).not.toHaveBeenCalled();
  });

  describe('over a synthetic pipeline (the runner alone; not the §3.9 array)', () => {
    const withGates = (gates: Gate[]) => {
      const { gateway } = gatewayFor([record()]);
      Object.defineProperty(gateway, 'gates', { value: gates });
      return gateway;
    };
    const stop: GateVerdict = {
      outcome: 'refuse',
      code: 'mechanism_absent',
      detail: 'synthetic stop',
    };

    it("a producer's facts reach the next slot in a NEW context; the producer's own context is unchanged", async () => {
      const contexts: GateContext[] = [];
      const gateway = withGates([
        {
          n: '8',
          name: 'synthetic producer',
          host: 'IntentGateway',
          run: (ctx) => {
            contexts.push(ctx);
            return { outcome: 'pass', facts: { selectedLabels: ['Стрижка'] } };
          },
        },
        {
          n: '9',
          name: 'synthetic reader',
          host: 'chat ingress',
          run: (ctx) => {
            contexts.push(ctx);
            return stop;
          },
        },
      ]);
      const r = await gateway.submit(args());
      expect(r.stoppedAt).toBe('9');
      expect(contexts[0].facts).toEqual({});
      expect(contexts[1].facts).toEqual({ selectedLabels: ['Стрижка'] });
      expect(contexts[1]).not.toBe(contexts[0]);
      expect(contexts[1].record).toBe(contexts[0].record);
      expect(Object.isFrozen(contexts[1].facts)).toBe(true);
    });

    it('a second write of the same fact throws before the next slot runs', async () => {
      const after = jest.fn(() => stop);
      const producer: Gate = {
        n: '8',
        name: 'synthetic producer',
        host: 'IntentGateway',
        run: () => ({ outcome: 'pass', facts: { selectedLabels: [] } }),
      };
      const gateway = withGates([
        producer,
        producer,
        { n: '9', name: 'after', host: 'chat ingress', run: after },
      ]);
      await expect(gateway.submit(args())).rejects.toThrow(/already set/);
      expect(after).not.toHaveBeenCalled();
    });

    it('a pass without facts leaves the context as it was', async () => {
      const contexts: GateContext[] = [];
      const gateway = withGates([
        {
          n: '1',
          name: 'plain pass',
          host: 'IntentGateway',
          run: (ctx) => {
            contexts.push(ctx);
            return { outcome: 'pass' };
          },
        },
        {
          n: '2',
          name: 'observer',
          host: 'HTTP middleware',
          run: (ctx) => {
            contexts.push(ctx);
            return stop;
          },
        },
      ]);
      await gateway.submit(args());
      expect(contexts[1]).toBe(contexts[0]);
    });
  });
});
