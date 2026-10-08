import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { GoodsPhotoService, GoodsPhotoParser } from './goods-photo.service';
const user = {
  tenantId: 'tenant',
  userId: 'owner',
  role: UserRole.TENANT_OWNER,
} as AuthenticatedUser;
const image = () => Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
function setup() {
  const parser = {
    parse: jest.fn().mockResolvedValue({
      lines: [
        {
          name: 'Товар',
          quantity: '1.25',
          unit_label: 'мл',
          unit_price: '3.20',
          line_total: '4',
          confidence: 0.2,
          price_kind: null,
          raw_ocr: 'PRIVATE',
          supplier: 'PRIVATE',
        },
      ],
    }),
  };
  const crm = { goodsReadIdentity: jest.fn().mockResolvedValue('source-v1') };
  const policy = {
    buildPrincipal: jest.fn().mockReturnValue({}),
    assertCanExecute: jest.fn().mockResolvedValue(undefined),
  };
  return {
    parser,
    crm,
    policy,
    service: new GoodsPhotoService(
      parser,
      crm as unknown as CrmService,
      policy as unknown as AiToolPolicyService,
      new AiToolRegistryService(),
    ),
  };
}
describe('ephemeral photo preview, synthetic parser only', () => {
  it('preserves low confidence and unresolved price meaning, strips extras and wipes original', async () => {
    const h = setup(),
      buffer = image();
    const preview = await h.service.preview(user, {
      buffer,
      mimetype: 'image/png',
      size: buffer.length,
    });
    expect(preview).toMatchObject({
      original_stored: false,
      persistent_draft: false,
      recognition_acceptance: 'NOT_ACCEPTED',
      review_required: true,
      lines: [
        {
          quantity: '1.25',
          parser_confidence: 0.2,
          price_kind: null,
          review_required: true,
        },
      ],
    });
    expect(JSON.stringify(preview)).not.toMatch(/PRIVATE|raw_ocr|supplier/);
    expect(buffer.every((v) => v === 0)).toBe(true);
    expect(h.crm.goodsReadIdentity).toHaveBeenCalledTimes(2);
    expect(h.policy.assertCanExecute).toHaveBeenCalledTimes(2);
  });
  it('has no default OCR/network path', () =>
    expect(() => new GoodsPhotoParser().parse(image())).toThrow(
      'goods_photo_parser_not_configured',
    ));
  it('denies before parser and clears memory when actor is refused', async () => {
    const h = setup(),
      buffer = image();
    h.crm.goodsReadIdentity.mockRejectedValue(new Error('denied'));
    await expect(
      h.service.preview(user, {
        buffer,
        mimetype: 'image/png',
        size: buffer.length,
      }),
    ).rejects.toThrow('denied');
    expect(h.parser.parse).not.toHaveBeenCalled();
    expect(buffer.every((v) => v === 0)).toBe(true);
  });
  it.each(['source', 'actor', 'feature'])(
    'withholds provisional fields and wipes memory if %s changes during parsing',
    async (change) => {
      const h = setup(),
        buffer = image();
      h.parser.parse.mockImplementation(() => {
        if (change === 'source')
          h.crm.goodsReadIdentity.mockResolvedValue('source-v2');
        if (change === 'actor')
          h.crm.goodsReadIdentity.mockRejectedValue(new Error('revoked'));
        if (change === 'feature')
          h.policy.assertCanExecute.mockRejectedValue(new Error('revoked'));
        return Promise.resolve({ lines: [{ name: 'PRIVATE_PROVISIONAL' }] });
      });
      await expect(
        h.service.preview(user, {
          buffer,
          mimetype: 'image/png',
          size: buffer.length,
        }),
      ).rejects.toThrow(
        change === 'source' ? 'goods_source_changed' : 'revoked',
      );
      expect(buffer.every((v) => v === 0)).toBe(true);
    },
  );
  it('rejects wrong magic, oversized images and unbounded parser output without persistence', async () => {
    const h = setup();
    for (const buffer of [Buffer.alloc(20), Buffer.alloc(2 * 1024 * 1024 + 1)])
      await expect(
        h.service.preview(user, {
          buffer,
          mimetype: 'image/png',
          size: buffer.length,
        }),
      ).rejects.toThrow();
    expect(h.parser.parse).not.toHaveBeenCalled();
    h.parser.parse.mockResolvedValue({ lines: [] });
    const buffer = image();
    await expect(
      h.service.preview(user, {
        buffer,
        mimetype: 'image/png',
        size: buffer.length,
      }),
    ).rejects.toThrow();
    expect(buffer.every((v) => v === 0)).toBe(true);
  });
});
