import { IntentAuditStore } from './intent-audit.store';
import { timelineLockKey } from './timeline.store';

const NOW = new Date('2026-10-07T10:00:00Z');
const INPUT = {
  tenantId: 'tenant-a',
  widgetId: 'widget-a',
  intentTokenHash: 'a'.repeat(64),
  clientNonce: 'nonce-a',
  profileId: 'profile-a',
  readbackRef: 'readback-a',
  readbackBodyHash: 'b'.repeat(64),
  inputsClosed: { staff_ref: ['opaque-staff'] },
  readbackAffirmation: 'yes',
  spokenTranscript: 'synthetic spoken confirmation',
};

const auditFixture = () => {
  const events: string[] = [];
  const state = {
    missing: false,
    parent: {
      principalProofHash: 'principal-a',
      erasedAt: null as Date | null,
      emission: {
        erasedAt: null as Date | null,
        turn: {
          id: 'turn-a',
          conversationId: 'conversation-a',
          principalProofHash: 'principal-a',
          erasedAt: null as Date | null,
        },
      },
    },
    onLock: () => Promise.resolve(),
  };
  const findFirst = jest.fn(({ where }: { where: Record<string, unknown> }) => {
    events.push('read');
    if (
      state.missing ||
      where.tenantId !== INPUT.tenantId ||
      where.widgetId !== INPUT.widgetId ||
      where.intentTokenHash !== INPUT.intentTokenHash
    )
      return Promise.resolve(null);
    return Promise.resolve(structuredClone(state.parent));
  });
  const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    events.push('create');
    return Promise.resolve({ id: String(data.clientNonce) });
  });
  const lock = jest
    .fn<Promise<number>, [TemplateStringsArray, string]>()
    .mockImplementation(async () => {
      events.push('lock');
      await state.onLock();
      return 0;
    });
  const tx = {
    widgetIntentRecord: { findFirst },
    widgetIntentSubmissionAudit: { create },
    $executeRaw: lock,
  };
  const transaction = jest.fn(
    async (work: (client: typeof tx) => Promise<unknown>) => {
      events.push('begin');
      const value = await work(tx);
      events.push('commit');
      return value;
    },
  );
  return {
    state,
    events,
    findFirst,
    create,
    lock,
    transaction,
    store: new IntentAuditStore({ ...tx, $transaction: transaction } as never),
  };
};

describe('submission audit writes serialized with conversation erasure', () => {
  it('retains content only after a fresh exact parent read under the existing conversation lock', async () => {
    const h = auditFixture();
    await expect(h.store.recordSubmission(INPUT, NOW)).resolves.toEqual({
      id: INPUT.clientNonce,
    });
    expect(h.events).toEqual([
      'begin',
      'read',
      'lock',
      'read',
      'create',
      'commit',
    ]);
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
    });
    expect(h.lock).toHaveBeenCalledWith(
      expect.anything(),
      timelineLockKey(INPUT.tenantId, 'conversation-a'),
    );
    expect(h.findFirst).toHaveBeenCalledTimes(2);
    for (const [query] of h.findFirst.mock.calls)
      expect(query.where).toEqual({
        tenantId: INPUT.tenantId,
        widgetId: INPUT.widgetId,
        intentTokenHash: INPUT.intentTokenHash,
      });
    expect(JSON.stringify(h.findFirst.mock.calls)).not.toMatch(
      /textContent|spokenTranscript|bodyJson|renderedUtterance/,
    );
    expect(h.create).toHaveBeenCalledWith({
      data: {
        tenantId: INPUT.tenantId,
        widgetId: INPUT.widgetId,
        intentTokenHash: INPUT.intentTokenHash,
        clientNonce: INPUT.clientNonce,
        profileId: INPUT.profileId,
        clientEmittedAt: null,
        receivedAt: NOW,
        readbackRef: INPUT.readbackRef,
        readbackBodyHash: INPUT.readbackBodyHash,
        readbackAffirmation: INPUT.readbackAffirmation,
        inputsClosedJson: INPUT.inputsClosed,
        spokenTranscript: INPUT.spokenTranscript,
      },
      select: { id: true },
    });
  });

  it.each([
    'record',
    'emission',
    'turn',
    'missing',
    'turn-moved',
    'conversation-moved',
    'principal-changed',
    'principal-mismatch',
  ] as const)(
    'keeps A audit facts but no C/X when the parent becomes %s while waiting for the lock',
    async (change) => {
      const h = auditFixture();
      h.state.onLock = () => {
        if (change === 'record') h.state.parent.erasedAt = NOW;
        if (change === 'emission') h.state.parent.emission.erasedAt = NOW;
        if (change === 'turn') h.state.parent.emission.turn.erasedAt = NOW;
        if (change === 'missing') h.state.missing = true;
        if (change === 'turn-moved')
          h.state.parent.emission.turn.id = 'other-turn';
        if (change === 'conversation-moved')
          h.state.parent.emission.turn.conversationId = 'other-conversation';
        if (change === 'principal-changed') {
          h.state.parent.principalProofHash = 'other-principal';
          h.state.parent.emission.turn.principalProofHash = 'other-principal';
        }
        if (change === 'principal-mismatch')
          h.state.parent.emission.turn.principalProofHash = 'other-principal';
        return Promise.resolve();
      };
      const submission = {
        ...INPUT,
        // The writer's closed projection also ignores undeclared C/X payloads.
        inputsFreeTextJson: { note: 'must not be retained' },
        inputsPiiJson: { phone: 'synthetic-contact' },
      };
      await h.store.recordSubmission(submission, NOW);
      expect(h.events).toEqual([
        'begin',
        'read',
        'lock',
        'read',
        'create',
        'commit',
      ]);
      expect(h.create).toHaveBeenCalledTimes(1);
      const data = h.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        tenantId: INPUT.tenantId,
        intentTokenHash: INPUT.intentTokenHash,
        clientNonce: INPUT.clientNonce,
        profileId: INPUT.profileId,
        readbackRef: INPUT.readbackRef,
        readbackBodyHash: INPUT.readbackBodyHash,
        inputsClosedJson: INPUT.inputsClosed,
        readbackAffirmation: null,
        spokenTranscript: null,
      });
      expect(data).not.toHaveProperty('inputsFreeTextJson');
      expect(data).not.toHaveProperty('inputsPiiJson');
    },
  );

  it.each([
    'missing',
    'foreign-tenant',
    'foreign-widget',
    'foreign-token',
  ] as const)(
    'does not retain content without a proven parent: %s',
    async (change) => {
      const h = auditFixture();
      if (change === 'missing') h.state.missing = true;
      await h.store.recordSubmission(
        {
          ...INPUT,
          ...(change === 'foreign-tenant' ? { tenantId: 'foreign' } : {}),
          ...(change === 'foreign-widget' ? { widgetId: 'foreign' } : {}),
          ...(change === 'foreign-token' ? { intentTokenHash: 'foreign' } : {}),
        },
        NOW,
      );
      expect(h.lock).not.toHaveBeenCalled();
      expect(h.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            readbackAffirmation: null,
            spokenTranscript: null,
          }) as unknown,
        }),
      );
    },
  );

  it('keeps content-free closed selections without requiring the conversation to survive', async () => {
    const h = auditFixture();
    h.state.missing = true;
    await h.store.recordSubmission(
      { ...INPUT, readbackAffirmation: null, spokenTranscript: null },
      NOW,
    );
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputsClosedJson: INPUT.inputsClosed,
          readbackAffirmation: null,
          spokenTranscript: null,
        }) as unknown,
      }),
    );
  });

  it('does not swallow a database or lock failure by writing an unguarded content row', async () => {
    const h = auditFixture();
    const unavailable = new Error('database unavailable');
    h.state.onLock = () => Promise.reject(unavailable);
    await expect(h.store.recordSubmission(INPUT, NOW)).rejects.toBe(
      unavailable,
    );
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe('late adjudication receipts retain only audit facts', () => {
  it('keeps ACCEPTED and reconciled AE references after erasure without restoring any utterance', async () => {
    const receipt = {
      id: 'receipt-a',
      widgetId: INPUT.widgetId,
      outcome: 'ACCEPTED',
      refusalCode: null,
      actionReceiptRef: null as string | null,
      utteranceEcho: null,
      erasedAt: NOW,
    };
    const upsert = jest
      .fn<Promise<typeof receipt>, [unknown]>()
      .mockImplementation(() => Promise.resolve({ ...receipt }));
    const findFirst = jest
      .fn<Promise<{ id: string; widgetId: string }>, [unknown]>()
      .mockImplementation(() =>
        Promise.resolve({
          id: receipt.id,
          widgetId: receipt.widgetId,
        }),
      );
    const updateMany = jest.fn(
      ({ data }: { data: { actionReceiptRef: string } }) => {
        receipt.actionReceiptRef = data.actionReceiptRef;
        return Promise.resolve({ count: 1 });
      },
    );
    const emissionUpdate = jest
      .fn<Promise<{ count: number }>, [unknown]>()
      .mockImplementation(() => Promise.resolve({ count: 0 }));
    const store = new IntentAuditStore({
      widgetIntentReceipt: { upsert, findFirst, updateMany },
      widgetEmission: { updateMany: emissionUpdate },
    } as never);
    const input = {
      tenantId: INPUT.tenantId,
      widgetId: INPUT.widgetId,
      intentTokenHash: INPUT.intentTokenHash,
      outcome: 'ACCEPTED',
      answeringChannel: 'pwa',
      utteranceEcho: 'must not reappear',
    };
    await store.writeReceipt(input, NOW);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          outcome: 'ACCEPTED',
          actionReceiptRef: null,
          utteranceEcho: null,
        }) as unknown,
        update: {},
      }),
    );
    await expect(
      store.reconcileAcceptedReceipt({
        tenantId: INPUT.tenantId,
        intentTokenHash: INPUT.intentTokenHash,
        actionReceiptRef: 'ae-receipt-a',
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { actionReceiptRef: 'ae-receipt-a' } }),
    );
    expect(receipt).toMatchObject({
      outcome: 'ACCEPTED',
      actionReceiptRef: 'ae-receipt-a',
      utteranceEcho: null,
      erasedAt: NOW,
    });
    expect(emissionUpdate).toHaveBeenCalledTimes(2);
    for (const [args] of emissionUpdate.mock.calls)
      expect(args).toMatchObject({
        where: { tenantId: INPUT.tenantId, erasedAt: null },
      });
  });
});
