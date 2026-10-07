import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CrmService } from '../crm/crm.service';
import { goodsDecimal } from '../crm/yclients-goods-read';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

/** Injectable processing edge. No real OCR, model, storage or network default. */
@Injectable()
export class GoodsPhotoParser {
  parse(_bytes: Uint8Array): Promise<unknown> {
    void _bytes;
    throw new ServiceUnavailableException('goods_photo_parser_not_configured');
  }
}
export type GoodsPhotoFile = { buffer: Buffer; mimetype: string; size: number };
const row = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const label = (v: unknown) =>
  typeof v === 'string' && v.trim().length && v.length <= 240
    ? v.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, ' ').trim()
    : null;
@Injectable()
export class GoodsPhotoService {
  constructor(
    private readonly parser: GoodsPhotoParser,
    private readonly crm: CrmService,
    private readonly policy: AiToolPolicyService,
    private readonly registry: AiToolRegistryService,
  ) {}
  async preview(user: AuthenticatedUser, file: GoodsPhotoFile | undefined) {
    try {
      if (!user.tenantId)
        throw new BadRequestException('goods_tenant_required');
      await this.policy.assertCanExecute(
        this.policy.buildPrincipal(
          user.tenantId,
          user.userId,
          user.role,
          'web',
        ),
        this.registry.get('inventory.goods.read'),
      );
      await this.crm.assertGoodsActor(user.tenantId, user.userId);
      if (
        !file ||
        !Buffer.isBuffer(file.buffer) ||
        file.size !== file.buffer.length ||
        file.size < 12 ||
        file.size > 2 * 1024 * 1024
      )
        throw new BadRequestException('goods_photo_size_invalid');
      const b = file.buffer;
      const png =
        file.mimetype === 'image/png' &&
        b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg =
        file.mimetype === 'image/jpeg' &&
        b[0] === 255 &&
        b[1] === 216 &&
        b[2] === 255;
      const webp =
        file.mimetype === 'image/webp' &&
        b.subarray(0, 4).toString() === 'RIFF' &&
        b.subarray(8, 12).toString() === 'WEBP';
      if (!png && !jpg && !webp)
        throw new BadRequestException('goods_photo_format_invalid');
      const photo_sha256 = createHash('sha256').update(b).digest('hex');
      const result = row(await this.parser.parse(b));
      if (
        !Array.isArray(result.lines) ||
        result.lines.length < 1 ||
        result.lines.length > 20
      )
        throw new BadRequestException('goods_photo_lines_unavailable');
      const lines = result.lines.map((v, index) => {
        const r = row(v);
        return {
          source_line: index + 1,
          name: label(r.name),
          quantity: goodsDecimal(r.quantity),
          unit_label: label(r.unit_label),
          unit_price: goodsDecimal(r.unit_price),
          line_total: goodsDecimal(r.line_total),
          price_kind: ['purchase_unit', 'sale_unit', 'line_total'].includes(
            String(r.price_kind),
          )
            ? String(r.price_kind)
            : null,
          parser_confidence:
            typeof r.confidence === 'number' &&
            Number.isFinite(r.confidence) &&
            r.confidence >= 0 &&
            r.confidence <= 1
              ? r.confidence
              : null,
          review_required: true,
        };
      });
      await this.crm.assertGoodsActor(user.tenantId, user.userId);
      return {
        contract: 'maya.goods-photo.preview/1',
        photo_sha256,
        lines,
        recognition_acceptance: 'NOT_ACCEPTED',
        review_required: true,
        original_stored: false,
        persistent_draft: false,
        notice:
          'Предварительные поля. Проверьте совпадение товара, единицы, количество и смысл цены. Неоднозначности нужно исправить до подтверждения прихода.',
      };
    } finally {
      file?.buffer?.fill(0);
    }
  }
}
