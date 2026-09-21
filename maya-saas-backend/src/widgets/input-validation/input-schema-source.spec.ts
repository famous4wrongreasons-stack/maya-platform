import { rec } from '../gates/gate-fixtures.spec-helper.spec';
import { sha256Hex } from '../token.util';
import {
  InputSchemaSourceIntegrityError,
  InputSchemaSourceReader,
} from './input-schema-source';

const token = 'opaque-token';
const record = rec({
  intentTokenHash: sha256Hex(token),
  widgetId: '11111111-1111-4111-8111-111111111111',
  deliveryChannel: 'pwa',
});
const schema = {
  fields: [{ name: 'x', required: true, kind: 'boolean' }],
  max_total_bytes: 20,
  free_input_justification: null,
};

interface ReceiptQuery {
  readonly where: {
    readonly tenantId: string;
    readonly widgetId: string;
    readonly deliveryChannel: string;
  };
  readonly select: Record<string, unknown>;
}

const client = (result: unknown) => {
  const calls: ReceiptQuery[] = [];
  const findFirst = jest.fn((query: ReceiptQuery) => {
    calls.push(query);
    return Promise.resolve(result);
  });
  return {
    db: { widgetRenderReceipt: { findFirst } } as never,
    findFirst,
    calls,
  };
};

const receipt = (over: Record<string, unknown> = {}) => ({
  emittedEnvelopeJson: {
    intents: [
      { intent_token: 'other', input_schema: null },
      { intent_token: token, input_schema: schema },
    ],
  },
  erasedAt: null,
  emission: {
    intentRecords: [{ selectionDomainLabelsJson: { x: {} } }],
  },
  ...over,
});

describe('U8b — exact emitted input schema source', () => {
  it('reads the exact tenant/widget/channel receipt and selects the exact opaque token', async () => {
    const c = client(receipt());
    await expect(
      new InputSchemaSourceReader().read(record, c.db),
    ).resolves.toEqual({
      status: 'available',
      schema,
      selectionDomainLabelsJson: { x: {} },
    });
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toMatchObject({
      where: {
        tenantId: 't1',
        widgetId: record.widgetId,
        deliveryChannel: 'pwa',
      },
      select: {
        emittedEnvelopeJson: true,
        erasedAt: true,
      },
    });
  });

  it.each([
    ['missing receipt', null],
    ['erased receipt', receipt({ erasedAt: new Date() })],
    ['erased envelope', receipt({ emittedEnvelopeJson: null })],
    ['token not emitted', receipt({ emittedEnvelopeJson: { intents: [] } })],
    [
      'schema absent',
      receipt({
        emittedEnvelopeJson: {
          intents: [{ intent_token: token, input_schema: null }],
        },
      }),
    ],
  ])('%s is unavailable, not an alternate source', async (_name, row) => {
    const c = client(row);
    await expect(
      new InputSchemaSourceReader().read(record, c.db),
    ).resolves.toEqual({ status: 'unavailable' });
  });

  it('faults when the emitted envelope duplicates the exact token', async () => {
    const duplicate = receipt({
      emittedEnvelopeJson: {
        intents: [
          { intent_token: token, input_schema: schema },
          { intent_token: token, input_schema: schema },
        ],
      },
    });
    const c = client(duplicate);
    await expect(
      new InputSchemaSourceReader().read(record, c.db),
    ).rejects.toThrow(InputSchemaSourceIntegrityError);
  });

  it('faults when the exact record is not uniquely linked to the receipt', async () => {
    const c = client(receipt({ emission: { intentRecords: [] } }));
    await expect(
      new InputSchemaSourceReader().read(record, c.db),
    ).rejects.toThrow(/not uniquely linked/);
  });
});
