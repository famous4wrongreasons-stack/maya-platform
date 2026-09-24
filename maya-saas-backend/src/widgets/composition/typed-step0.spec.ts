import { createHash } from 'node:crypto';
import { TypedStep0Service } from './typed-step0';
import { typedInputsForUtterance } from './typed-step0';

const actor = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  sessionId: 'session-1',
  role: 'TENANT_OWNER',
} as never;

const candidate = {
  widgetId: '11111111-1111-4111-8111-111111111111',
  intentToken: 'server-minted-token-value',
  intentTokenHash: createHash('sha256')
    .update('server-minted-token-value')
    .digest('hex'),
  effect: 'REFINE',
  priority: 1,
  capabilitySpace: 'C9',
  capabilityKey: 'operations.journal.read',
  handoffSpace: null,
  handoffKey: null,
  targetJson: null,
  issuedAt: new Date('2026-09-24T08:00:00.000Z'),
  erasedAt: null,
  utteranceTemplate: 'показать {{selection}}',
  selectionDomainLabelsJson: { date: { today: 'сегодня' } },
  emission: {
    renderReceipts: [
      {
        emittedEnvelopeJson: {
          intents: [{ intent_token: 'server-minted-token-value' }],
        },
      },
    ],
  },
};

const harness = (rows: readonly unknown[] = [candidate]) => {
  const resolve = jest.fn().mockResolvedValue({
    authority: { tenantId: 'tenant-1', userId: 'user-1' },
    proofHash: 'p'.repeat(64),
  });
  const submit = jest.fn().mockResolvedValue({
    verdict: { outcome: 'terminate' },
    stoppedAt: '13',
    ran: 14,
  });
  const service = new TypedStep0Service(
    {
      $transaction: (fn: (tx: unknown) => unknown) =>
        fn({
          widgetIntentRecord: { findMany: jest.fn().mockResolvedValue(rows) },
        }),
    } as never,
    { submit } as never,
    { resolve },
  );
  return { service, submit, resolve };
};

describe('P-TYPED — the typed Step 0 carrier', () => {
  it('routes an exact rendering as the same server-minted token through the one gateway', async () => {
    const { service, submit } = harness();
    await expect(
      service.routeTypedUtterance({
        actor,
        surface: 'web',
        utterance: 'Показать сегодня',
        requestId: 'request_1234',
      }),
    ).resolves.toMatchObject({ action: { status: 'terminate' } });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith({
      intentToken: candidate.intentToken,
      tenantId: 'tenant-1',
      actor,
      carrier: 'pwa',
      submission: {
        contract: 'maya.widget.intent.submission/1',
        widget_id: candidate.widgetId,
        intent_token: candidate.intentToken,
        inputs: { date: 'today' },
        client_nonce: 'typed_request_1234',
        profile_id: 'pwa.v1',
      },
    });
  });

  it('leaves an unmatched sentence on the ordinary chat path without calling the gateway', async () => {
    const { service, submit } = harness();
    await expect(
      service.routeTypedUtterance({
        actor,
        surface: 'web',
        utterance: 'расскажи шутку',
        requestId: 'request_1234',
      }),
    ).resolves.toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it('refuses to guess an ambiguous closed option', () => {
    expect(
      typedInputsForUtterance(
        'показать {{selection}}',
        { date: { a: 'сегодня', b: 'сегодня' } },
        'показать сегодня',
      ),
    ).toBeNull();
  });

  it('does not route a typed widget intent for a foreign current principal', async () => {
    const { service, submit, resolve } = harness();
    resolve.mockResolvedValue({
      authority: { tenantId: 'tenant-2', userId: 'user-1' },
      proofHash: 'p'.repeat(64),
    });
    await expect(
      service.routeTypedUtterance({
        actor,
        surface: 'web',
        utterance: 'показать сегодня',
        requestId: 'request_1234',
      }),
    ).resolves.toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});
