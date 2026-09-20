// The widget stores, pinned by what they send to Prisma.
//
// U0 item 7 split the one service into sub-stores behind a `WidgetStoresService` facade and moved
// every existing method unchanged. "Unchanged" is held here, not asserted in a comment: each facade
// method is called over a recording Prisma double, and the exact call (model, operation, and the
// argument serialised with its key order) is compared against a literal written from the pre-split
// source. The same assertions ran green on the pre-split tree (U0 S3 log) and run green on this one.
//
// The second block holds the split's shape (class BUILD): the four sub-store files, a facade that is
// the only constructor of a sub-store, one tenant fence, and skeletons that pretend to no method.
//
// Class U: a regression aid over a double. It proves the call shape, not a database.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { RETENTION, WidgetStoresService } from './widget-stores.service';

type Call = { model: string; op: string; args: unknown };

const NOW = new Date('2026-09-17T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** A Prisma double that records every `prisma.<model>.<op>(args)` and answers with `result`. */
const recordingPrisma = (result: unknown) => {
  const calls: Call[] = [];
  const prisma = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, op: string) => (args: unknown) => {
              calls.push({ model, op, args });
              return Promise.resolve(result);
            },
          },
        ),
    },
  );
  return { prisma, calls };
};

const storesOver = (result: unknown = { id: 'row-1' }) => {
  const { prisma, calls } = recordingPrisma(result);
  return { stores: new WidgetStoresService(prisma as never), calls };
};

/** Key order included: a moved method must build the same object, not an equal one. */
const exactly = (value: unknown): string => JSON.stringify(value);

describe('WidgetStoresService — every existing method sends what it sent before the split', () => {
  it('RETENTION is unchanged and still exported by the facade', () => {
    expect(RETENTION).toEqual({
      timelineDays: 180,
      emissionBodyDefaultSec: 604800,
    });
  });

  describe('1. timeline store', () => {
    it('appendTurn creates one WidgetTimelineTurn, 180 days of retention, nulls for absent text', async () => {
      const { stores, calls } = storesOver();
      const row = await stores.appendTurn(
        {
          tenantId: 't-1',
          conversationId: 'c-1',
          turnIndex: 3,
          role: 'user',
          principalProofHash: 'p-hash',
          channel: 'pwa',
        },
        NOW,
      );
      expect(row).toEqual({ id: 'row-1' });
      expect(calls).toHaveLength(1);
      expect(calls[0].model).toBe('widgetTimelineTurn');
      expect(calls[0].op).toBe('create');
      expect(exactly(calls[0].args)).toBe(
        exactly({
          data: {
            tenantId: 't-1',
            conversationId: 'c-1',
            turnIndex: 3,
            role: 'user',
            principalProofHash: 'p-hash',
            channel: 'pwa',
            createdAt: NOW,
            retentionUntil: new Date(NOW.getTime() + 180 * DAY),
            textContent: null,
            spokenTranscript: null,
          },
          select: { id: true },
        }),
      );
    });

    it('appendTurn passes text and transcript through, and defaults `now` to the clock', async () => {
      const { stores, calls } = storesOver();
      const before = Date.now();
      await stores.appendTurn({
        tenantId: 't-1',
        conversationId: 'c-1',
        turnIndex: 0,
        role: 'assistant',
        principalProofHash: 'p',
        channel: 'telegram-miniapp',
        textContent: 'hello',
        spokenTranscript: 'spoken',
      });
      const data = (
        calls[0].args as {
          data: {
            createdAt: Date;
            retentionUntil: Date;
            textContent: unknown;
            spokenTranscript: unknown;
          };
        }
      ).data;
      expect(data.textContent).toBe('hello');
      expect(data.spokenTranscript).toBe('spoken');
      expect(data.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(data.retentionUntil.getTime() - data.createdAt.getTime()).toBe(
        180 * DAY,
      );
    });

    it('readTimeline is tenant-scoped, ordered, capped at 200, default 50', async () => {
      const { stores, calls } = storesOver([]);
      await stores.readTimeline('t-1', 'c-1');
      await stores.readTimeline('t-1', 'c-1', 500);
      const expected = (take: number) =>
        exactly({
          where: { conversationId: 'c-1', erasedAt: null, tenantId: 't-1' },
          orderBy: { turnIndex: 'asc' },
          take,
          select: {
            id: true,
            turnIndex: true,
            role: true,
            channel: true,
            createdAt: true,
            textContent: true,
            spokenTranscript: true,
          },
        });
      expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
        'widgetTimelineTurn.findMany',
        'widgetTimelineTurn.findMany',
      ]);
      expect(exactly(calls[0].args)).toBe(expected(50));
      expect(exactly(calls[1].args)).toBe(expected(200));
    });

    it('readTimeline refuses an unscoped query as a rejection, before any read', async () => {
      const { stores, calls } = storesOver([]);
      const pending = stores.readTimeline('', 'c-1');
      expect(pending).toBeInstanceOf(Promise);
      await expect(pending).rejects.toThrow(
        'widget store: refusing an unscoped query',
      );
      expect(calls).toEqual([]);
    });
  });

  describe('2. intent-audit store', () => {
    it('recordSubmission writes the submission audit row with nulls for every absent member', async () => {
      const { stores, calls } = storesOver();
      const row = await stores.recordSubmission(
        {
          tenantId: 't-1',
          widgetId: 'w-1',
          intentTokenHash: 'h-1',
          clientNonce: 'n-1',
          profileId: 'pr-1',
        },
        NOW,
      );
      expect(row).toEqual({ id: 'row-1' });
      expect(`${calls[0].model}.${calls[0].op}`).toBe(
        'widgetIntentSubmissionAudit.create',
      );
      expect(exactly(calls[0].args)).toBe(
        exactly({
          data: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: 'h-1',
            clientNonce: 'n-1',
            profileId: 'pr-1',
            clientEmittedAt: null,
            receivedAt: NOW,
            readbackRef: null,
            readbackBodyHash: null,
            readbackAffirmation: null,
            inputsClosedJson: null,
            spokenTranscript: null,
          },
          select: { id: true },
        }),
      );
    });

    it('recordSubmission passes every supplied member through', async () => {
      const { stores, calls } = storesOver();
      const emitted = new Date('2026-09-17T09:59:00.000Z');
      await stores.recordSubmission(
        {
          tenantId: 't-1',
          widgetId: 'w-1',
          intentTokenHash: 'h-1',
          clientNonce: 'n-1',
          profileId: 'pr-1',
          clientEmittedAt: emitted,
          readbackRef: 'rb',
          readbackBodyHash: 'bh',
          readbackAffirmation: 'yes',
          inputsClosed: { slot: ['a'] },
          spokenTranscript: 'st',
        },
        NOW,
      );
      expect(exactly(calls[0].args)).toBe(
        exactly({
          data: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: 'h-1',
            clientNonce: 'n-1',
            profileId: 'pr-1',
            clientEmittedAt: emitted,
            receivedAt: NOW,
            readbackRef: 'rb',
            readbackBodyHash: 'bh',
            readbackAffirmation: 'yes',
            inputsClosedJson: { slot: ['a'] },
            spokenTranscript: 'st',
          },
          select: { id: true },
        }),
      );
    });
  });

  describe('3. receipt store (shell)', () => {
    it('writeReceipt writes one receipt with actionReceiptRef null, whatever it is given', async () => {
      const { stores, calls } = storesOver();
      await stores.writeReceipt(
        {
          tenantId: 't-1',
          widgetId: 'w-1',
          intentTokenHash: 'h-1',
          outcome: 'REFUSED',
          answeringChannel: 'pwa',
        },
        NOW,
      );
      await stores.writeReceipt(
        {
          tenantId: 't-1',
          widgetId: 'w-1',
          intentTokenHash: 'h-2',
          outcome: 'REFUSED',
          refusalCode: 'mechanism_absent',
          answeringChannel: 'pwa',
          utteranceEcho: 'echo',
        },
        NOW,
      );
      const expected = (hash: string, code: unknown, echo: unknown) =>
        exactly({
          data: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: hash,
            submittedAt: NOW,
            outcome: 'REFUSED',
            refusalCode: code,
            actionReceiptRef: null,
            answeringChannel: 'pwa',
            utteranceEcho: echo,
          },
          select: { id: true },
        });
      expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
        'widgetIntentReceipt.create',
        'widgetIntentReceipt.create',
      ]);
      expect(exactly(calls[0].args)).toBe(expected('h-1', null, null));
      expect(exactly(calls[1].args)).toBe(
        expected('h-2', 'mechanism_absent', 'echo'),
      );
    });
  });

  describe('4. server-owned draft store', () => {
    it('putDraft writes the draft with its expiry computed from the ttl', async () => {
      const { stores, calls } = storesOver();
      await stores.putDraft(
        {
          tenantId: 't-1',
          draftRef: 'd-1',
          draftClass: 'booking',
          ownerCapabilitySpace: 'AE',
          ownerCapabilityKey: 'appointments.create',
          principalProofHash: 'p',
          diff: { a: 1 },
          ttlSeconds: 90,
        },
        NOW,
      );
      expect(`${calls[0].model}.${calls[0].op}`).toBe('widgetDraft.create');
      expect(exactly(calls[0].args)).toBe(
        exactly({
          data: {
            tenantId: 't-1',
            draftRef: 'd-1',
            draftClass: 'booking',
            ownerCapabilitySpace: 'AE',
            ownerCapabilityKey: 'appointments.create',
            principalProofHash: 'p',
            diffJson: { a: 1 },
            createdAt: NOW,
            expiresAt: new Date(NOW.getTime() + 90_000),
          },
          select: { id: true },
        }),
      );
    });

    it('readDraft filters principal, consumption, erasure and expiry in the query, tenant-scoped', async () => {
      const { stores, calls } = storesOver(null);
      await expect(stores.readDraft('t-1', 'd-1', 'p', NOW)).resolves.toBe(
        null,
      );
      expect(`${calls[0].model}.${calls[0].op}`).toBe('widgetDraft.findFirst');
      expect(exactly(calls[0].args)).toBe(
        exactly({
          where: {
            draftRef: 'd-1',
            principalProofHash: 'p',
            consumedAt: null,
            erasedAt: null,
            expiresAt: { gt: NOW },
            tenantId: 't-1',
          },
          select: {
            id: true,
            draftRef: true,
            draftClass: true,
            diffJson: true,
            expiresAt: true,
          },
        }),
      );
    });

    it('readDraft refuses an unscoped query as a rejection, before any read', async () => {
      const { stores, calls } = storesOver(null);
      await expect(stores.readDraft('', 'd-1', 'p', NOW)).rejects.toThrow(
        'widget store: refusing an unscoped query',
      );
      expect(calls).toEqual([]);
    });
  });

  describe('5. free-input ledger', () => {
    it('recordFreeInput refuses a blank justification as a rejection, before any write', async () => {
      const { stores, calls } = storesOver();
      await expect(
        stores.recordFreeInput(
          {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: 'h-1',
            capabilitySpace: 'C9',
            capabilityKey: 'k',
            widgetKind: 'TEXT_INPUT',
            fieldKinds: ['text'],
            justification: '   ',
          },
          NOW,
        ),
      ).rejects.toThrow(
        'free-input ledger: a free-text field without a justification is not mintable',
      );
      expect(calls).toEqual([]);
    });

    it('recordFreeInput writes the ledger row with empty ref lists by default', async () => {
      const { stores, calls } = storesOver();
      await stores.recordFreeInput(
        {
          tenantId: 't-1',
          widgetId: 'w-1',
          intentTokenHash: 'h-1',
          capabilitySpace: 'C9',
          capabilityKey: 'k',
          widgetKind: 'TEXT_INPUT',
          fieldKinds: ['text'],
          justification: 'a note',
        },
        NOW,
      );
      expect(`${calls[0].model}.${calls[0].op}`).toBe(
        'widgetFreeInputLedger.create',
      );
      expect(exactly(calls[0].args)).toBe(
        exactly({
          data: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: 'h-1',
            capabilitySpace: 'C9',
            capabilityKey: 'k',
            widgetKind: 'TEXT_INPUT',
            fieldKinds: ['text'],
            justification: 'a note',
            boundsSourceRefs: [],
            normalizerRefs: [],
            mintedAt: NOW,
          },
          select: { id: true },
        }),
      );
    });

    it('countFreeInputFields counts the tenant only, and refuses an unscoped query', async () => {
      const { stores, calls } = storesOver(7);
      await expect(stores.countFreeInputFields('t-1')).resolves.toBe(7);
      expect(`${calls[0].model}.${calls[0].op}`).toBe(
        'widgetFreeInputLedger.count',
      );
      expect(exactly(calls[0].args)).toBe(
        exactly({ where: { tenantId: 't-1' } }),
      );
      await expect(stores.countFreeInputFields('')).rejects.toThrow(
        'widget store: refusing an unscoped query',
      );
      expect(calls).toHaveLength(1);
    });
  });
});

describe('the stores split (U0, D-6): four sub-stores behind one facade, one tenant fence', () => {
  const STORES = __dirname;
  const SRC = path.resolve(__dirname, '../..');
  const SUB_STORES: ReadonlyArray<readonly [string, string]> = [
    ['timeline.store.ts', 'TimelineStore'],
    ['intent-audit.store.ts', 'IntentAuditStore'],
    ['divergence.store.ts', 'DivergenceStore'],
    ['lowering-source.read.ts', 'LoweringSourceReader'],
  ];
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  const productionFiles = walk(SRC).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  );
  const storeFiles = fs
    .readdirSync(STORES)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  const classOf = (file: string, name: string): ts.ClassDeclaration => {
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(STORES, file), 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
    );
    const decl = sf.statements.find(
      (st): st is ts.ClassDeclaration =>
        ts.isClassDeclaration(st) && st.name?.text === name,
    );
    if (!decl) throw new Error(`${file} declares no class ${name}`);
    return decl;
  };

  it('the facade keeps exactly the pre-split public methods', () => {
    expect(
      Object.getOwnPropertyNames(WidgetStoresService.prototype)
        .filter((m) => m !== 'constructor')
        .sort(),
    ).toEqual(
      [
        'appendTurn',
        'countFreeInputFields',
        'lowerToUserTurn',
        'putDraft',
        'readDraft',
        'readTimeline',
        'recordFreeInput',
        'recordSubmission',
        'writeReceipt',
      ].sort(),
    );
  });

  it('each sub-store file declares its class, and the stores directory holds nothing else', () => {
    for (const [file, name] of SUB_STORES) classOf(file, name);
    expect(storeFiles.sort()).toEqual(
      [
        ...SUB_STORES.map(([file]) => file),
        'tenant-scope.ts',
        'widget-stores.service.ts',
      ].sort(),
    );
  });

  it('only the facade constructs a sub-store, so every caller goes through it', () => {
    const constructs = new RegExp(
      `new\\s+(${SUB_STORES.map(([, name]) => name).join('|')})\\s*\\(`,
    );
    const offenders = productionFiles
      .filter((f) => constructs.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual(['widgets/stores/widget-stores.service.ts']);
  });

  it('the tenant fence is declared once in the widget layer, and every `where` in a store file goes through it', () => {
    // Other modules keep their own helpers of the same name; the fence in question is the widget stores'.
    const declares = /(?:const|function|private)\s+scoped\b/;
    expect(
      productionFiles
        .filter((f) => f.startsWith(path.join(SRC, 'widgets') + path.sep))
        .filter((f) => declares.test(fs.readFileSync(f, 'utf8')))
        .map((f) => path.relative(SRC, f)),
    ).toEqual(['widgets/stores/tenant-scope.ts']);
    // tenant-scope.ts is the fence itself: its `where` is the parameter it fences.
    const wheres = storeFiles
      .filter((file) => file !== 'tenant-scope.ts')
      .flatMap((file) =>
        [
          ...fs
            .readFileSync(path.join(STORES, file), 'utf8')
            .matchAll(/\bwhere:\s*(\S+)/g),
        ].map((m) => `${file}: where: ${m[1]}`),
      );
    // readTimeline, readDraft, countFreeInputFields: the fence is not vacuously satisfied.
    expect(wheres.length).toBeGreaterThanOrEqual(3);
    for (const w of wheres) expect(w).toMatch(/: where: scoped\(/);
  });

  it('the divergence store is a skeleton, and the lowering-source reader has exactly the one read U8a builds', () => {
    // IR-8a-4, converted in U8a's merge commit — the one the comment already named. The divergence
    // store stays a skeleton until U10b builds it (AMB-32); the lowering-source reader now has D-2's
    // ONE lazy read and nothing else, so "no second read crept in" is a property this line holds
    // rather than a sentence in a header.
    const membersOf = (i: number): string[] => {
      const [file, name] = SUB_STORES[i];
      return classOf(file, name)
        .members.filter((m) => !ts.isConstructorDeclaration(m))
        .map((m) => m.name?.getText() ?? '?');
    };
    expect(membersOf(2)).toEqual([]);
    expect(membersOf(3)).toEqual(['read']);
  });
});
