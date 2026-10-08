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

import { encodeSelectionDomain } from '../input-schema/codec';
import { RETENTION, WidgetStoresService } from './widget-stores.service';

type Call = { model: string; op: string; args: unknown };
type Reply = (model: string, op: string, args: unknown) => unknown;

const NOW = new Date('2026-09-17T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** A Prisma double that records every `prisma.<model>.<op>(args)` and answers with `result`. */
const recordingPrisma = (result: unknown, reply?: Reply) => {
  const calls: Call[] = [];
  const prisma = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        model === '$transaction'
          ? (work: (tx: unknown) => unknown) => work(prisma)
          : model === '$executeRaw'
            ? () => Promise.resolve(1)
            : new Proxy(
                {},
                {
                  get: (_m, op: string) => (args: unknown) => {
                    calls.push({ model, op, args });
                    if (
                      model === 'widgetTimelineTurn' &&
                      op === 'findFirst' &&
                      (args as { where?: { erasedAt?: unknown } }).where
                        ?.erasedAt
                    )
                      return Promise.resolve(null);
                    return Promise.resolve(
                      reply ? reply(model, op, args) : result,
                    );
                  },
                },
              ),
    },
  );
  return { prisma, calls };
};

const storesOver = (result: unknown = { id: 'row-1' }, reply?: Reply) => {
  const { prisma, calls } = recordingPrisma(result, reply);
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
      expect(calls).toHaveLength(2);
      const insert = calls[1];
      expect(insert.model).toBe('widgetTimelineTurn');
      expect(insert.op).toBe('create');
      expect(exactly(insert.args)).toBe(
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
        calls[1].args as {
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
    const acceptedRecord = () => {
      const domain = encodeSelectionDomain({ staff_ref: ['sealed-choice'] });
      if (!domain.ok) throw new Error('Invalid test domain');
      return {
        widgetKind: 'STAFF_SELECTOR',
        capabilityKey: 'catalog.staff.read',
        selectionDomain: domain.value,
      };
    };
    const selectionInput = {
      tenantId: 't-1',
      widgetId: 'w-1',
      intentTokenHash: 'h-1',
      clientNonce: 'n-1',
      profileId: 'pr-1',
      inputsClosed: { staff_ref: 'sealed-choice' },
    };

    it('persists an accepted scalar choice as a closed array; profile stays audit-only', async () => {
      const queries: unknown[] = [];
      for (const profileId of ['pr-1', 'advisory-other-profile']) {
        const { stores, calls } = storesOver(undefined, (model) =>
          model === 'widgetIntentRecord' ? acceptedRecord() : { id: 'audit-1' },
        );
        await stores.recordAcceptedBookingSelection({
          ...selectionInput,
          profileId,
        });
        expect(calls).toHaveLength(2);
        expect(calls[0].model).toBe('widgetIntentRecord');
        expect(calls[0].op).toBe('findFirst');
        queries.push(calls[0].args);
        expect(calls[0].args).toMatchObject({
          where: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: 'h-1',
            effect: 'REFINE',
            capabilitySpace: 'C9',
            erasedAt: null,
            consumedAt: { not: null },
            receipts: {
              some: {
                outcome: 'ACCEPTED',
                erasedAt: null,
                actionReceiptRef: null,
              },
            },
          },
        });
        expect(calls[1].model).toBe('widgetIntentSubmissionAudit');
        expect(calls[1].op).toBe('create');
        expect(calls[1].args).toMatchObject({
          data: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: 'h-1',
            clientNonce: 'n-1',
            profileId,
            inputsClosedJson: { staff_ref: ['sealed-choice'] },
          },
        });
      }
      expect(queries[0]).toEqual(queries[1]);
    });

    it.each([
      { staff_ref: 'outside-domain' },
      { staff_ref: ['sealed-choice', 'outside-domain'] },
      { staff_ref: 'sealed-choice', injected: 'extra' },
      { service_ref: 'sealed-choice' },
      null,
    ])(
      'does not audit a malformed or nonclosed accepted input %j',
      async (inputsClosed) => {
        const { stores, calls } = storesOver(acceptedRecord());
        await stores.recordAcceptedBookingSelection({
          ...selectionInput,
          inputsClosed,
        });
        expect(calls).toHaveLength(1);
      },
    );

    it('does not audit when the accepted retained REFINE record is absent', async () => {
      const { stores, calls } = storesOver(null);
      await stores.recordAcceptedBookingSelection(selectionInput);
      expect(calls).toHaveLength(1);
    });

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

    it('recordSubmission passes retained A members through without conversation content', async () => {
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
          readbackAffirmation: null,
          inputsClosed: { slot: ['a'] },
          spokenTranscript: null,
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
            readbackAffirmation: null,
            inputsClosedJson: { slot: ['a'] },
            spokenTranscript: null,
          },
          select: { id: true },
        }),
      );
    });
  });

  describe('3. receipt store (shell)', () => {
    it('writeReceipt is idempotent by tenant/token and never retains an utterance echo', async () => {
      const { stores, calls } = storesOver({
        id: 'row-1',
        widgetId: 'w-1',
        outcome: 'REFUSED',
        actionReceiptRef: null,
      });
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
          refusalCode: 'effect_not_admissible',
          answeringChannel: 'pwa',
          actionReceiptRef: 'ae-1',
        },
        NOW,
      );
      const expected = (
        hash: string,
        code: unknown,
        actionReceiptRef: unknown,
      ) =>
        exactly({
          where: {
            tenantId_intentTokenHash: {
              tenantId: 't-1',
              intentTokenHash: hash,
            },
            tenantId: 't-1',
          },
          create: {
            tenantId: 't-1',
            widgetId: 'w-1',
            intentTokenHash: hash,
            submittedAt: NOW,
            outcome: 'REFUSED',
            refusalCode: code,
            actionReceiptRef,
            answeringChannel: 'pwa',
            utteranceEcho: null,
          },
          update: {},
          select: {
            id: true,
            widgetId: true,
            outcome: true,
            refusalCode: true,
            actionReceiptRef: true,
          },
        });
      expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
        'widgetIntentReceipt.upsert',
        'widgetEmission.updateMany',
        'widgetIntentReceipt.upsert',
        'widgetEmission.updateMany',
      ]);
      expect(exactly(calls[0].args)).toBe(expected('h-1', null, null));
      expect(exactly(calls[2].args)).toBe(
        expected('h-2', 'effect_not_admissible', 'ae-1'),
      );
      // The line is written for the intent the receipt adjudicates: the emission must hold THIS
      // token's record, and that record must be the confirmation's own Action-Engine COMMIT. A
      // refusal cannot say CONFIRMED, so it may not land on an emission whose COMMIT already earned
      // the canonical action receipt either.
      expect(calls[1].args).toEqual({
        where: {
          widgetId: 'w-1',
          kind: 'BOOKING_CONFIRMATION',
          erasedAt: null,
          intentRecords: {
            some: {
              intentTokenHash: 'h-1',
              effect: 'COMMIT',
              capabilitySpace: 'AE',
              tenantId: 't-1',
            },
            none: {
              effect: 'COMMIT',
              receipts: {
                some: {
                  outcome: 'ACCEPTED',
                  actionReceiptRef: { not: null },
                  tenantId: 't-1',
                },
              },
              tenantId: 't-1',
            },
          },
          tenantId: 't-1',
        },
        data: {
          terminalLinesJson: [
            {
              outcome: 'NOT_CONFIRMED',
              action_receipt_ref: null,
            },
          ],
        },
      });
    });

    it('keeps the original refusal audit without persisting prose on a contradictory retry', async () => {
      const { stores, calls } = storesOver({
        id: 'receipt-stale',
        widgetId: 'w-1',
        outcome: 'REFUSED',
        refusalCode: 'handle_stale',
        actionReceiptRef: null,
      });
      await stores.writeReceipt({
        tenantId: 't-1',
        widgetId: 'w-1',
        intentTokenHash: 'h-1',
        outcome: 'ACCEPTED',
        refusalCode: 'NOT_COLLECTED',
        answeringChannel: 'pwa',
        actionReceiptRef: 'invented',
      });
      expect(calls[0].args).toMatchObject({ update: {} });
      expect(calls[1].args).toMatchObject({
        data: {
          terminalLinesJson: [
            {
              outcome: 'NOT_CONFIRMED',
              action_receipt_ref: null,
            },
          ],
        },
      });
    });

    it('WR-L22 idempotent retries derive the terminal outcome from the existing durable receipt', async () => {
      const replies = [
        {
          id: 'receipt-success',
          widgetId: 'w-1',
          outcome: 'ACCEPTED',
          actionReceiptRef: 'ae-success',
        },
        {
          id: 'receipt-unknown',
          widgetId: 'w-2',
          outcome: 'ACCEPTED',
          actionReceiptRef: null,
        },
      ];
      const persisted = new Map([
        ['h-1', replies[0]],
        ['h-2', replies[1]],
      ]);
      const { stores, calls } = storesOver(undefined, (model, op, args) => {
        if (model !== 'widgetIntentReceipt' || op !== 'upsert')
          return { count: 1 };
        const query = args as {
          where: { tenantId_intentTokenHash: { intentTokenHash: string } };
          update: object;
        };
        expect(query.update).toEqual({});
        return persisted.get(
          query.where.tenantId_intentTokenHash.intentTokenHash,
        );
      });

      // Deliberately contradictory caller fields are ignored by the idempotent upsert result.
      // The already-durable canonical receipt is the only source of the conversation outcome.
      await stores.writeReceipt({
        tenantId: 't-1',
        widgetId: 'w-1',
        intentTokenHash: 'h-1',
        outcome: 'REFUSED',
        answeringChannel: 'pwa',
      });
      await stores.writeReceipt({
        tenantId: 't-1',
        widgetId: 'w-2',
        intentTokenHash: 'h-2',
        outcome: 'ACCEPTED',
        answeringChannel: 'pwa',
        actionReceiptRef: 'retry-does-not-rewrite-existing-receipt',
      });

      expect(calls[1].args).toMatchObject({
        data: {
          terminalLinesJson: [
            {
              outcome: 'CONFIRMED',
              action_receipt_ref: 'ae-success',
            },
          ],
        },
      });
      expect(calls[3].args).toMatchObject({
        data: {
          terminalLinesJson: [
            { outcome: 'SUBMITTED', action_receipt_ref: null },
          ],
        },
      });
      // Every outcome is guarded. The same immutable COMMIT may repair its own line;
      // a different confirmed COMMIT must not substitute another receipt.
      expect(
        (calls[1].args as { where: { intentRecords: object } }).where
          .intentRecords,
      ).toHaveProperty('none.intentTokenHash.not', 'h-1');
      expect(
        (calls[3].args as { where: { intentRecords: object } }).where
          .intentRecords,
      ).toHaveProperty('none');
    });

    it('claim and reconciliation are tenant-scoped compare-and-set writes', async () => {
      const { stores, calls } = storesOver({
        id: 'receipt-1',
        widgetId: 'w-1',
        count: 1,
      });
      await expect(
        stores.claimIntentRecord({
          tenantId: 't-1',
          intentTokenHash: 'h-1',
          singleUse: true,
          now: NOW,
        }),
      ).resolves.toBe(true);
      await expect(
        stores.reconcileAcceptedReceipt({
          tenantId: 't-1',
          intentTokenHash: 'h-1',
          actionReceiptRef: 'ae-1',
        }),
      ).resolves.toBe(true);
      expect(calls).toEqual([
        {
          model: 'widgetIntentRecord',
          op: 'updateMany',
          args: {
            where: {
              tenantId: 't-1',
              intentTokenHash: 'h-1',
              singleUse: true,
              consumedAt: null,
            },
            data: { consumedAt: NOW },
          },
        },
        {
          model: 'widgetIntentReceipt',
          op: 'findFirst',
          args: {
            where: {
              intentTokenHash: 'h-1',
              outcome: 'ACCEPTED',
              actionReceiptRef: null,
              record: {
                is: {
                  effect: 'COMMIT',
                  capabilitySpace: 'AE',
                  tenantId: 't-1',
                },
              },
              tenantId: 't-1',
            },
            select: { id: true, widgetId: true },
          },
        },
        {
          model: 'widgetIntentReceipt',
          op: 'updateMany',
          args: {
            where: {
              id: 'receipt-1',
              outcome: 'ACCEPTED',
              actionReceiptRef: null,
              tenantId: 't-1',
            },
            data: { actionReceiptRef: 'ae-1' },
          },
        },
        {
          model: 'widgetEmission',
          op: 'updateMany',
          args: {
            where: {
              widgetId: 'w-1',
              kind: 'BOOKING_CONFIRMATION',
              erasedAt: null,
              // Reconciliation publishes the line of the intent whose receipt it filled in, under the
              // same ownership predicate, including confirmed-substitution protection.
              intentRecords: {
                some: {
                  intentTokenHash: 'h-1',
                  effect: 'COMMIT',
                  capabilitySpace: 'AE',
                  tenantId: 't-1',
                },
                none: {
                  effect: 'COMMIT',
                  intentTokenHash: { not: 'h-1' },
                  receipts: {
                    some: {
                      outcome: 'ACCEPTED',
                      actionReceiptRef: { not: null },
                      tenantId: 't-1',
                    },
                  },
                  tenantId: 't-1',
                },
              },
              tenantId: 't-1',
            },
            data: {
              terminalLinesJson: [
                {
                  outcome: 'CONFIRMED',
                  action_receipt_ref: 'ae-1',
                },
              ],
            },
          },
        },
      ]);
    });
  });

  describe('4. server-owned draft store', () => {
    it('creates reference-only drafts without any JSON payload', async () => {
      const { stores, calls } = storesOver();
      await stores.putDraft({
        tenantId: 't-1',
        draftRef: 'd-1',
        draftClass: 'task',
        ownerCapabilitySpace: 'C9',
        ownerCapabilityKey: 'c9.booking.propose',
        principalProofHash: 'p',
        diff: null,
        ttlSeconds: 90,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        model: 'widgetDraft',
        op: 'create',
        args: { data: { draftRef: 'd-1', principalProofHash: 'p' } },
      });
      expect((calls[0].args as { data: object }).data).not.toHaveProperty(
        'diffJson',
      );
    });

    it('refuses unlinked draft content before writing any row', async () => {
      const { stores, calls } = storesOver();
      await expect(
        stores.putDraft(
          {
            tenantId: 't-1',
            draftRef: 'd-1',
            draftClass: 'task',
            ownerCapabilitySpace: 'C9',
            ownerCapabilityKey: 'c9.booking.propose',
            principalProofHash: 'p',
            diff: { synthetic: 'unlinked content' },
            ttlSeconds: 90,
          },
          NOW,
        ),
      ).rejects.toThrow('draft_content_scope_required');
      expect(calls).toEqual([]);
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

describe('U10b Gate 10 divergence store', () => {
  it('liveCandidates reads only the same tenant/proof live unused records in deterministic order', async () => {
    const { prisma, calls } = recordingPrisma([]);
    const stores = new WidgetStoresService({} as never);
    await stores.liveCandidates(
      { tenantId: 't-1', principalProofHash: 'p-1' },
      NOW,
      prisma as never,
    );
    expect(calls).toHaveLength(1);
    expect(`${calls[0].model}.${calls[0].op}`).toBe(
      'widgetIntentRecord.findMany',
    );
    expect(calls[0].args).toEqual({
      where: {
        principalProofHash: 'p-1',
        expiresAt: { gt: NOW },
        consumedAt: null,
        tenantId: 't-1',
      },
      orderBy: [{ issuedAt: 'desc' }, { intentTokenHash: 'asc' }],
      select: {
        intentTokenHash: true,
        effect: true,
        priority: true,
        capabilitySpace: true,
        capabilityKey: true,
        handoffSpace: true,
        handoffKey: true,
        targetJson: true,
        issuedAt: true,
        erasedAt: true,
        utteranceTemplate: true,
        selectionDomainLabelsJson: true,
      },
    });
  });

  it('recordDivergence writes exactly the durable Gate 10 audit in request T', async () => {
    const { prisma, calls } = recordingPrisma({ id: 'audit-1' });
    const stores = new WidgetStoresService({} as never);
    await stores.recordDivergence(
      {
        tenantId: 't-1',
        widgetId: 'w-1',
        tappedIntentTokenHash: 'tapped',
        resolvedIntentTokenHash: 'resolved',
        resolvedEffect: 'REFINE',
        refusalCode: 'intent_divergence',
        observedAt: NOW,
      },
      prisma as never,
    );
    expect(calls).toEqual([
      {
        model: 'widgetIntentDivergenceAudit',
        op: 'create',
        args: {
          data: {
            tenantId: 't-1',
            widgetId: 'w-1',
            tappedIntentTokenHash: 'tapped',
            resolvedIntentTokenHash: 'resolved',
            resolvedEffect: 'REFINE',
            refusalCode: 'intent_divergence',
            observedAt: NOW,
          },
          select: { id: true },
        },
      },
    ]);
  });

  it('countDivergences is tenant-scoped and refuses an empty tenant', async () => {
    const { stores, calls } = storesOver(4);
    await expect(stores.countDivergences('t-1')).resolves.toBe(4);
    expect(calls).toEqual([
      {
        model: 'widgetIntentDivergenceAudit',
        op: 'count',
        args: { where: { tenantId: 't-1' } },
      },
    ]);
    expect(() => stores.countDivergences('')).toThrow(
      'widget store: refusing an unscoped query',
    );
    expect(calls).toHaveLength(1);
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

  it('the facade keeps the pre-split surface plus U13a claim and reconciliation', () => {
    expect(
      Object.getOwnPropertyNames(WidgetStoresService.prototype)
        .filter((m) => m !== 'constructor')
        .sort(),
    ).toEqual(
      [
        'appendTurn',
        'claimIntentRecord',
        'countDivergences',
        'countFreeInputFields',
        'ensureAssistantTurn',
        'liveCandidates',
        'lowerToUserTurn',
        'putDraft',
        'readBookingCreateFactsHash',
        'readDraft',
        'readTimeline',
        'reconcileAcceptedReceipt',
        'recordAcceptedBookingSelection',
        'recordFreeInput',
        'recordDivergence',
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
        'booking-selection-audit.port.ts', // Narrow post-gateway metadata port, no new sub-store.
        'chat-reply-codec.ts', // Accepted resume contract: encoding in the same erasable text column.
        'tenant-scope.ts',
        'user-turn-binding.ts',
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

  it("the divergence store has exactly U10b's three methods, and the lowering-source reader has U8a's one read", () => {
    const membersOf = (i: number): string[] => {
      const [file, name] = SUB_STORES[i];
      return classOf(file, name)
        .members.filter((m) => !ts.isConstructorDeclaration(m))
        .map((m) => m.name?.getText() ?? '?');
    };
    expect(membersOf(2)).toEqual([
      'liveCandidates',
      'recordDivergence',
      'countDivergences',
    ]);
    expect(membersOf(3)).toEqual(['read']);
  });
});

describe('generic timeline writers after history erasure', () => {
  it.each(['appendTurn', 'ensureAssistantTurn'] as const)(
    '%s cannot resurrect an erased conversation',
    async (method) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        widgetTimelineTurn: {
          findFirst: jest.fn().mockResolvedValue({ id: 'erased-anchor' }),
          create: jest.fn(),
        },
      };
      const prisma = {
        $transaction: jest.fn((work: (value: typeof tx) => unknown) =>
          work(tx),
        ),
      };
      const stores = new WidgetStoresService(prisma as never);
      await expect(
        stores[method]({
          tenantId: 'tenant-a',
          conversationId: 'conversation-a',
          principalProofHash: 'proof-a',
          turnIndex: 100,
          channel: 'pwa',
          role: 'assistant',
          textContent: 'late reply',
        }),
      ).rejects.toThrow('conversation_scope_conflict');
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.widgetTimelineTurn.findFirst.mock.invocationCallOrder[0],
      );
      expect(tx.widgetTimelineTurn.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-a',
          conversationId: 'conversation-a',
          principalProofHash: 'proof-a',
          erasedAt: { not: null },
        },
        select: { id: true },
      });
      expect(tx.widgetTimelineTurn.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });
    },
  );
});
