import { envelopeBodyHash } from '../emission/envelope.factory';
import { validate } from 'class-validator';

import { ResolveWidgetDto } from '../dto/resolve-widget.dto';
import { WidgetThreadPageService } from './thread-page.service';

const principal = {
  authority: { tenantId: 'tenant-1' },
  proofHash: 'p'.repeat(64),
};

const envelope = {
  contract: 'maya.widget.envelope/1',
  body: {},
  intents: [],
  integrity: { cell_index_digest: 'proof' },
  render: { render_tier: 'RICH_INTERACTIVE' },
  widget_id: '00000000-0000-4000-8000-000000000001',
};

const make = (
  options: {
    principal?: unknown;
    cursor?: { issuedAt: Date } | null;
    seal?: boolean;
  } = {},
) => {
  const findMany = jest.fn().mockResolvedValue([
    {
      terminalLinesJson: [],
      intentRecords: [{ intentTokenHash: 'a'.repeat(64) }],
      renderReceipts: [{ emittedEnvelopeJson: envelope }],
    },
  ]);
  const tx = {
    widgetEmission: {
      findFirst: jest.fn().mockResolvedValue(options.cursor ?? null),
      findMany,
    },
  };
  const prisma = { $transaction: (fn: (client: unknown) => unknown) => fn(tx) };
  const principals = {
    resolve: jest
      .fn()
      .mockResolvedValue(
        Object.prototype.hasOwnProperty.call(options, 'principal')
          ? options.principal
          : principal,
      ),
  };
  const seals = {
    verify: jest.fn().mockResolvedValue({
      ok: options.seal ?? true,
      reason: options.seal === false ? 'seal_mismatch' : 'verified',
    }),
  };
  return {
    service: new WidgetThreadPageService(prisma, principals, seals, {
      admits: () => Promise.resolve(true),
      bindMint: () => Promise.resolve(),
      canProject: () => Promise.resolve(true),
    }),
    tx,
    findMany,
    seals,
  };
};

describe('P-RESOLVE principal thread page', () => {
  it('returns only sealed rows selected by exact tenant and current proof hash', async () => {
    const { service, findMany, seals } = make();
    await expect(service.read({ limit: 20 })).resolves.toEqual([
      { envelope, terminal_lines: [], reread_intent: null },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          intentRecords: {
            some: { principalProofHash: 'p'.repeat(64) },
          },
        }),
      }),
    );
    expect(seals.verify).toHaveBeenCalledWith(
      'a'.repeat(64),
      { tenantId: 'tenant-1' },
      expect.any(Object),
    );
  });

  it('resolves one stored envelope only through the current tenant/proof and a valid seal', async () => {
    const { service, tx, seals } = make();
    tx.widgetEmission.findFirst.mockResolvedValueOnce({
      bodyHash: envelopeBodyHash(envelope),
      bodyJson: envelope.body,
      turnId: 'turn-1',
      deliveryChannel: 'pwa',
      turn: { conversationId: 'conversation-1' },
      intentRecords: [{ intentTokenHash: 'a'.repeat(64) }],
      renderReceipts: [{ emittedEnvelopeJson: envelope }],
    });
    await expect(
      service.resolveForNavigate({
        tenantId: 'tenant-1',
        widgetId: String(envelope.widget_id),
        principalProofHash: 'p'.repeat(64),
      }),
    ).resolves.toEqual({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      deliveryChannel: 'pwa',
      envelope,
    });
    expect(tx.widgetEmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          widgetId: envelope.widget_id,
          intentRecords: {
            some: { principalProofHash: 'p'.repeat(64) },
          },
        }),
      }),
    );
    expect(seals.verify).toHaveBeenCalled();
  });

  it('returns nothing when current authority is revoked or a stored seal fails', async () => {
    const revoked = make({ principal: null });
    await expect(revoked.service.read({ limit: 20 })).resolves.toEqual([]);
    expect(revoked.findMany).not.toHaveBeenCalled();

    const tampered = make({ seal: false });
    await expect(tampered.service.read({ limit: 20 })).resolves.toEqual([]);
  });

  it('does not disclose whether a foreign cursor exists', async () => {
    const { service, findMany } = make({ cursor: null });
    await expect(
      service.read({
        before: '00000000-0000-4000-8000-000000000099',
        limit: 20,
      }),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects detail requests and an unbounded thread page at DTO validation', async () => {
    const detail = Object.assign(new ResolveWidgetDto(), {
      widget_id: '00000000-0000-4000-8000-000000000001',
    });
    const tooLarge = Object.assign(new ResolveWidgetDto(), {
      thread_page: { limit: 51 },
    });
    await expect(
      validate(detail, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.not.toHaveLength(0);
    await expect(validate(tooLarge)).resolves.not.toHaveLength(0);
  });
  it('WR-L21 filters invalid stored outcomes and receipt bindings before the wire', async () => {
    const { service, findMany } = make();
    const valid = [
      ...[
        'SUBMITTED',
        'NOT_CONFIRMED',
        'EXPIRED_UNUSED',
        'SUPERSEDED',
        'CANCELLED',
        'DELIVERED_ONLY',
      ].map((outcome) => ({
        outcome,
        text: 'Server line',
        action_receipt_ref: null,
      })),
      {
        outcome: 'CONFIRMED',
        text: 'Server line',
        action_receipt_ref: 'ae-receipt',
      },
    ];
    const invalid = [
      { outcome: 'invented', text: 'x', action_receipt_ref: null },
      { outcome: 'CONFIRMED', text: 'x', action_receipt_ref: null },
      { outcome: 'CONFIRMED', text: 'x', action_receipt_ref: '' },
      { outcome: 'CONFIRMED', text: 'x', action_receipt_ref: '  ' },
      { outcome: 'SUBMITTED', text: 'x', action_receipt_ref: 'ae-receipt' },
      { outcome: 'SUBMITTED', text: 'x' },
    ];
    findMany.mockResolvedValue([
      {
        terminalLinesJson: [...invalid, ...valid],
        intentRecords: [{ intentTokenHash: 'a'.repeat(64) }],
        renderReceipts: [{ emittedEnvelopeJson: envelope }],
      },
    ] as never);
    const page = await service.read({ limit: 20 });
    expect(page).toHaveLength(1);
    expect(
      page[0].terminal_lines.map(({ outcome, action_receipt_ref }) => ({
        outcome,
        action_receipt_ref,
      })),
    ).toEqual(
      valid.map(({ outcome, action_receipt_ref }) => ({
        outcome,
        action_receipt_ref,
      })),
    );
    expect(JSON.stringify(page)).not.toContain('Server line');
    expect(page[0].terminal_lines.map((line) => line.text)).toEqual([
      'Результат пока не подтверждён. Не отправляйте повторно.',
      'Запись не подтверждена.',
      'Срок действия предложения истёк.',
      'Предложение заменено новой версией.',
      'Предложение закрыто.',
      'Предложение доставлено без возможности действия.',
      'Запись подтверждена.',
    ]);
  });
  it('projects the immutable AE COMMIT refusal, never legacy prose or a CONTROL adjudication', async () => {
    const { service, findMany } = make();
    findMany.mockResolvedValue([
      {
        terminalLinesJson: [
          {
            outcome: 'NOT_CONFIRMED',
            action_receipt_ref: null,
            text: 'PRIVATE LEGACY NARRATIVE',
            extra: 'PRIVATE EXTRA',
          },
        ],
        intentRecords: [
          {
            intentTokenHash: 'a'.repeat(64),
            effect: 'CONTROL',
            capabilitySpace: 'CONTROL',
            receipts: [
              {
                outcome: 'REFUSED',
                refusalCode: 'NOT_COLLECTED',
                actionReceiptRef: null,
              },
            ],
          },
          {
            intentTokenHash: 'b'.repeat(64),
            effect: 'COMMIT',
            capabilitySpace: 'AE',
            receipts: [
              {
                outcome: 'REFUSED',
                refusalCode: 'handle_stale',
                actionReceiptRef: null,
              },
            ],
          },
        ],
        renderReceipts: [{ emittedEnvelopeJson: envelope }],
      },
    ] as never);
    const page = await service.read({ limit: 20 });
    expect(page[0].terminal_lines).toEqual([
      {
        outcome: 'NOT_CONFIRMED',
        action_receipt_ref: null,
        text: 'Данные изменились с момента показа. Откройте актуальную версию.',
      },
    ]);
    expect(JSON.stringify(page)).not.toContain('PRIVATE');
    const [query] = findMany.mock.calls[0] as [{ where: unknown }];
    expect(query.where).toMatchObject({
      erasedAt: null,
      turn: { erasedAt: null, principalProofHash: principal.proofHash },
    });
  });
});
