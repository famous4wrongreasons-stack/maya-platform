import { validate } from 'class-validator';

import { ResolveWidgetDto } from '../dto/resolve-widget.dto';
import { WidgetThreadPageService } from './thread-page.service';

const principal = {
  authority: { tenantId: 'tenant-1' },
  proofHash: 'p'.repeat(64),
};

const envelope = {
  contract: 'maya.widget.envelope/1',
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
    service: new WidgetThreadPageService(
      prisma as never,
      principals as never,
      seals as never,
    ),
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
});
