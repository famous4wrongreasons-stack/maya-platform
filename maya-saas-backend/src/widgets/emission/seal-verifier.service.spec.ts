// P-SEAL — the ingress half: SEAL-2 (a tampered term never verifies), SEAL-3 (an unknown key version
// is refused before anything is read), SEAL-6 (the comparison is constant time).
//
// Class U (§0.5): the store is a double, so this proves the verdict and the read shape, not a
// database. The `[GW]` grade of these same cases — the verifier bound to `SEAL_VERIFIER` over the
// proof DB — is a merge-step exit (D-18), because it needs the provider IR.
//
// The double is not decoration. Two of H4's terms, `widget_id` and `tenant_id`, are also the key the
// emission is FOUND by, so "tamper one column" is not a single story: moving one side alone breaks
// the record's foreign key and there is nothing to verify (`emission_absent`), while moving both
// sides together — copying a sealed body onto another envelope, which is the attack the term exists
// to stop — finds a row and fails on the seal. Both halves are asserted below, each for its own
// reason, so neither can be mistaken for the other.

import fs from 'node:fs';
import path from 'node:path';

import { SEAL_KEY_ENV, SealService, type SealTerms } from './seal.service';
import {
  SealVerifierService,
  type SealVerification,
} from './seal-verifier.service';

const TENANT = 'tenant-1';
const WIDGET = '11111111-1111-4111-8111-111111111111';
const OTHER_WIDGET = '22222222-2222-4222-8222-222222222222';
const TOKEN_HASH = 'a'.repeat(64);
const ISSUED_AT = new Date('2026-09-17T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-09-17T10:15:00.000Z');

interface RecordRow {
  intentTokenHash: string;
  tenantId: string;
  widgetId: string;
  principalProofHash: string | null;
}
interface EmissionRow {
  tenantId: string;
  widgetId: string;
  bodyHash: string | null;
  issuedAt: Date;
  expiresAt: Date;
  deliveryChannel: string;
  envelopeSeal: string | null;
}
interface ReceiptRow {
  tenantId: string;
  widgetId: string;
  deliveryChannel: string;
  profileId: string;
}
interface Rows {
  record: RecordRow;
  emission: EmissionRow;
  receipt: ReceiptRow;
}
interface Db {
  record: RecordRow | null;
  emission: EmissionRow | null;
  receipt: ReceiptRow | null;
}
interface Call {
  model: string;
  where: Record<string, unknown>;
  select: Record<string, unknown>;
}

const seal = new SealService();

/** A correctly sealed row set. Tampering happens AFTER this, exactly as a direct SQL write would. */
const freshDb = (): Rows => {
  const record: RecordRow = {
    intentTokenHash: TOKEN_HASH,
    tenantId: TENANT,
    widgetId: WIDGET,
    principalProofHash: 'p'.repeat(64),
  };
  const receipt: ReceiptRow = {
    tenantId: TENANT,
    widgetId: WIDGET,
    deliveryChannel: 'pwa',
    profileId: 'pwa.v1',
  };
  const terms: SealTerms = {
    bodyHash: 'b'.repeat(64),
    widgetId: WIDGET,
    tenantId: TENANT,
    principalProofHash: 'p'.repeat(64),
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    profileId: receipt.profileId,
  };
  const emission: EmissionRow = {
    tenantId: TENANT,
    widgetId: WIDGET,
    bodyHash: terms.bodyHash,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    deliveryChannel: 'pwa',
    envelopeSeal: seal.seal(terms),
  };
  return { record, emission, receipt };
};

/** A Prisma double that honours `where` (so the tenant fence and the channel selection are real here). */
const prismaOver = (db: Db) => {
  const calls: Call[] = [];
  const matches = (row: object | null, where: Record<string, unknown>) =>
    row !== null &&
    Object.entries(where).every(([key, value]) => {
      const held = (row as Record<string, unknown>)[key];
      return held instanceof Date && value instanceof Date
        ? held.getTime() === value.getTime()
        : held === value;
    });
  const delegate = (model: string, row: () => object | null) => ({
    findFirst: (args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
    }) => {
      calls.push({ model, where: args.where, select: args.select });
      const held = row();
      return Promise.resolve(matches(held, args.where) ? held : null);
    },
  });
  return {
    calls,
    prisma: {
      widgetIntentRecord: delegate('widgetIntentRecord', () => db.record),
      widgetEmission: delegate('widgetEmission', () => db.emission),
      widgetRenderReceipt: delegate('widgetRenderReceipt', () => db.receipt),
    },
  };
};

const verify = async (
  db: Db,
  scope?: { tenantId?: string; sealKeyVersion?: string | null },
): Promise<{ verdict: SealVerification; calls: Call[] }> => {
  const { prisma, calls } = prismaOver(db);
  const verifier = new SealVerifierService(prisma as never, seal);
  const verdict = await verifier.verify(TOKEN_HASH, scope);
  return { verdict, calls };
};

let restoreEnv: () => void = () => undefined;

beforeAll(() => {
  const before = { ...process.env };
  restoreEnv = () => {
    for (const name of Object.keys(process.env)) {
      if (!(name in before)) delete process.env[name];
    }
    Object.assign(process.env, before);
  };
  for (const name of [...SEAL_KEY_ENV.identity, ...SEAL_KEY_ENV.payload]) {
    delete process.env[name];
  }
  process.env.ACTION_ENGINE_IDENTITY_SECRET =
    'test-widget-seal-identity-secret-for-specs-only';
  process.env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET =
    'test-widget-seal-payload-secret-for-specs-only';
});

afterAll(() => restoreEnv());

describe('P-SEAL — SealVerifier (H4 at EP-INGRESS)', () => {
  it('SEAL-2 [U] an untampered row set verifies, and the read is tenant-fenced', async () => {
    const { verdict, calls } = await verify(freshDb(), { tenantId: TENANT });
    expect(verdict).toEqual({ ok: true, reason: 'verified' });
    for (const call of calls) expect(call.where.tenantId).toBe(TENANT);
    expect(calls.map((c) => c.model)).toEqual([
      'widgetIntentRecord',
      'widgetEmission',
      'widgetRenderReceipt',
    ]);
  });

  it('SEAL-2 [U] verification fails for each tampered term (7 cases)', async () => {
    const tampered: ReadonlyArray<readonly [string, (db: Rows) => void]> = [
      [
        'WidgetEmission.bodyHash',
        (db) => {
          db.emission.bodyHash = 'c'.repeat(64);
        },
      ],
      [
        'WidgetEmission.widgetId (with the record moved, so the row is found)',
        (db) => {
          db.emission.widgetId = OTHER_WIDGET;
          db.record.widgetId = OTHER_WIDGET;
          db.receipt.widgetId = OTHER_WIDGET;
        },
      ],
      [
        'WidgetEmission.tenantId (with the record moved, so the row is found)',
        (db) => {
          db.emission.tenantId = 'tenant-2';
          db.record.tenantId = 'tenant-2';
          db.receipt.tenantId = 'tenant-2';
        },
      ],
      [
        'WidgetIntentRecord.principalProofHash',
        (db) => {
          db.record.principalProofHash = 'q'.repeat(64);
        },
      ],
      [
        'WidgetEmission.issuedAt',
        (db) => {
          db.emission.issuedAt = new Date(ISSUED_AT.getTime() + 1);
        },
      ],
      [
        'WidgetEmission.expiresAt',
        (db) => {
          db.emission.expiresAt = new Date(EXPIRES_AT.getTime() + 60_000);
        },
      ],
      [
        'WidgetRenderReceipt.profileId',
        (db) => {
          db.receipt.profileId = 'telegram.v1';
        },
      ],
    ];
    expect(tampered).toHaveLength(7);

    for (const [column, tamper] of tampered) {
      const db = freshDb();
      tamper(db);
      const { verdict } = await verify(db);
      expect(`${column}: ${JSON.stringify(verdict)}`).toBe(
        `${column}: ${JSON.stringify({ ok: false, reason: 'seal_mismatch' })}`,
      );
    }
  });

  it('SEAL-2 [U] moving one side of the identity alone leaves nothing to verify', async () => {
    const moved = freshDb();
    moved.emission.widgetId = OTHER_WIDGET;
    expect(await verify(moved).then((r) => r.verdict)).toEqual({
      ok: false,
      reason: 'emission_absent',
    });

    const foreign = freshDb();
    expect(
      await verify(foreign, { tenantId: 'tenant-2' }).then((r) => r.verdict),
    ).toEqual({ ok: false, reason: 'record_absent' });
  });

  it('SEAL-2 [U] the delivery channel selects the receipt, so a degraded envelope is not a richer one', async () => {
    const db = freshDb();
    db.emission.deliveryChannel = 'telegram';
    const { verdict, calls } = await verify(db);
    expect(calls[2].where.deliveryChannel).toBe('telegram');
    expect(verdict).toEqual({ ok: false, reason: 'seal_mismatch' });
  });

  it('SEAL-2 [U] an absent row or an absent term never verifies', async () => {
    const absent: ReadonlyArray<readonly [string, Db]> = [
      ['no record', { ...freshDb(), record: null }],
      ['no emission', { ...freshDb(), emission: null }],
    ];
    expect(await verify(absent[0][1]).then((r) => r.verdict)).toEqual({
      ok: false,
      reason: 'record_absent',
    });
    expect(await verify(absent[1][1]).then((r) => r.verdict)).toEqual({
      ok: false,
      reason: 'emission_absent',
    });

    const nulled: ReadonlyArray<readonly [string, (db: Rows) => void]> = [
      [
        'envelopeSeal',
        (db) => {
          db.emission.envelopeSeal = null;
        },
      ],
      [
        'bodyHash',
        (db) => {
          db.emission.bodyHash = null;
        },
      ],
      [
        'principalProofHash',
        (db) => {
          db.record.principalProofHash = null;
        },
      ],
      [
        'issuedAt',
        (db) => {
          db.emission.issuedAt = new Date('not a date');
        },
      ],
    ];
    for (const [column, nullify] of nulled) {
      const db = freshDb();
      nullify(db);
      const { verdict } = await verify(db);
      expect(`${column}: ${JSON.stringify(verdict)}`).toBe(
        `${column}: ${JSON.stringify({ ok: false, reason: 'term_absent' })}`,
      );
    }
  });

  it('SEAL-2 [U] the verifier reads exactly the columns §0.5 forbids E-TAMPER on', async () => {
    const { calls } = await verify(freshDb());
    const read = (model: string) =>
      Object.keys(calls.find((c) => c.model === model)?.select ?? {}).sort();
    expect(read('widgetIntentRecord')).toEqual([
      'principalProofHash',
      'tenantId',
      'widgetId',
    ]);
    expect(read('widgetEmission')).toEqual([
      'bodyHash',
      'deliveryChannel',
      'envelopeSeal',
      'expiresAt',
      'issuedAt',
      'tenantId',
      'widgetId',
    ]);
    expect(read('widgetRenderReceipt')).toEqual(['profileId']);
  });

  it('SEAL-3 [U] an unknown key version is refused, and nothing is read first', async () => {
    const { verdict, calls } = await verify(freshDb(), {
      sealKeyVersion: 'widget-seal-2',
    });
    expect(verdict).toEqual({ ok: false, reason: 'unknown_key_version' });
    expect(calls).toHaveLength(0);

    const current = await verify(freshDb(), { sealKeyVersion: null });
    expect(current.verdict.ok).toBe(true);
  });

  it('SEAL-6 [U] the seal is compared in constant time, never with ===', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'seal-verifier.service.ts'),
      'utf8',
    );
    expect(source).toContain('digestEquals(emission.envelopeSeal, expected)');
    const comparisons = source
      .split('\n')
      .filter(
        (line) =>
          !line.trimStart().startsWith('//') &&
          /(envelopeSeal|expected)\s*(===|!==|==|!=)|(===|!==|==|!=)\s*(emission\.envelopeSeal|expected)/.test(
            line,
          ),
      );
    expect(comparisons).toEqual([]);
  });
});
