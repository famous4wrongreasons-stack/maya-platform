import type { RequestTx } from '../authority/principal-view';
import { ctx, rec } from '../gates/gate-fixtures.spec-helper.spec';
import { TimelineStore, timelineLockKey } from '../stores/timeline.store';
import { lower } from './lowering.gate';
import { LoweringConstructionDefect } from './lowering';

const TX = {} as RequestTx;
const source = Object.freeze({
  utteranceTemplate: 'Открыть {{selection}}',
  erasedAt: null,
  conversationId: '00000000-0000-4000-8000-000000000009',
});

const context = (over: Record<string, unknown> = {}) =>
  ctx(rec(), {
    facts: {
      loweringSource: source,
      selectedLabels: ['расписание'],
    },
    ...over,
  });

describe('Gate 9 lowering (U9b)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('T9-CONC-2 derives one deterministic signed lock key per exact tenant/conversation tuple', () => {
    const key = timelineLockKey('tenant-a', source.conversationId);
    expect(timelineLockKey('tenant-a', source.conversationId)).toBe(key);
    expect(timelineLockKey('tenant-b', source.conversationId)).not.toBe(key);
    expect(
      timelineLockKey('tenant-a', `${source.conversationId}-other`),
    ).not.toBe(key);
    expect(key).toBe(
      `${Buffer.byteLength('tenant-a')}:tenant-a${Buffer.byteLength(source.conversationId)}:${source.conversationId}`,
    );
  });

  it('T9-POS-1 renders canonical labels, writes once through T, and produces both Gate 9 facts', async () => {
    const write = jest
      .spyOn(TimelineStore, 'lowerToUserTurn')
      .mockResolvedValue({ id: 'turn-1', turnIndex: 1 });

    await expect(lower(context(), TX)).resolves.toEqual({
      outcome: 'pass',
      facts: {
        lowering: { renderedUtterance: 'Открыть расписание' },
        loweredTurn: {
          turnId: 'turn-1',
          conversationId: source.conversationId,
        },
      },
    });
    const input = write.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      tenantId: 't1',
      intentTokenHash: rec().intentTokenHash,
      conversationId: source.conversationId,
      principalProofHash: context().principalProofHash,
      channel: context().carrier,
      renderedUtterance: 'Открыть расписание',
    });
    expect(write.mock.calls[0]?.[1]).toBe(TX);
    expect(write.mock.calls[0]?.[2]).toEqual(context().now);
  });

  it.each([
    ['T9-NEG-1', { ...source, utteranceTemplate: null }, ['расписание']],
    ['T9-NEG-2', { ...source, erasedAt: new Date() }, ['расписание']],
    ['T9-NEG-3', { ...source, utteranceTemplate: 'Покажи показатели' }, null],
    ['T9-NEG-SHAPE', { ...source, utteranceTemplate: '{{unknown}}' }, []],
  ])(
    '%s returns superseded/handle_stale with no turn',
    async (_id, loweringSource, selectedLabels) => {
      const write = jest.spyOn(TimelineStore, 'lowerToUserTurn');
      await expect(
        lower(context({ facts: { loweringSource, selectedLabels } }), TX),
      ).resolves.toMatchObject({ outcome: 'superseded', code: 'handle_stale' });
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['T9-INV24-1', null, ['расписание'], null],
    ['T9-INV24-2', '', ['расписание'], null],
    ['T9-INV24-3', '   ', ['расписание'], null],
    ['T9-INV24-4', '{{name}}', ['расписание'], null],
    ['T9-INV24-5', 'Открыть {{', ['расписание'], null],
    ['T9-INV24-6', 'Открыть }}', ['расписание'], null],
    ['T9-INV24-7', 'Открыть {{selection}}', [], null],
    ['T9-INV24-8', 'Открыть {{selection}}', ['один', 'два'], null],
    ['T9-INV24-9', 'Открыть {{selection}}', ['расписание'], new Date()],
    ['T9-INV24-10', 'Покажи показатели', null, null],
  ])(
    '%s maps every render/source impossibility to stale with zero durable writes',
    async (_id, utteranceTemplate, selectedLabels, erasedAt) => {
      const write = jest.spyOn(TimelineStore, 'lowerToUserTurn');
      await expect(
        lower(
          context({
            facts: {
              loweringSource: {
                ...source,
                utteranceTemplate,
                erasedAt,
              },
              selectedLabels,
            },
          }),
          TX,
        ),
      ).resolves.toMatchObject({
        outcome: 'superseded',
        code: 'handle_stale',
      });
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('T9-NEG-8 maps an erasure race in the conditional writer to handle_stale', async () => {
    jest.spyOn(TimelineStore, 'lowerToUserTurn').mockResolvedValue(null);
    await expect(lower(context(), TX)).resolves.toMatchObject({
      outcome: 'superseded',
      code: 'handle_stale',
    });
  });

  it.each(['loweringSource', 'selectedLabels'] as const)(
    'T9-DEF-1 throws only for missing Gate 8 fact %s',
    async (missing) => {
      const facts: Record<string, unknown> = {
        loweringSource: source,
        selectedLabels: ['расписание'],
      };
      delete facts[missing];
      await expect(lower(context({ facts }), TX)).rejects.toBeInstanceOf(
        LoweringConstructionDefect,
      );
    },
  );

  it('T9-DEF-1 treats a missing request transaction as a construction defect', async () => {
    await expect(lower(context(), null)).rejects.toBeInstanceOf(
      LoweringConstructionDefect,
    );
  });
});
