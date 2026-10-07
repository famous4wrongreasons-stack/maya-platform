import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import {
  goodsHash,
  goodsProposal,
  GOODS_RECEIPT_TOOL,
} from '../crm/goods-receipt.contract';
import { GoodsPhotoService, type GoodsPhotoFile } from './goods-photo.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';

@ApiTags('ai-goods')
@ApiBearerAuth()
@TenantScoped()
@Controller('ai/goods')
export class GoodsPhotoController {
  constructor(
    private readonly photos: GoodsPhotoService,
    private readonly runtime: AiToolRuntimeService,
  ) {}
  @Post('photo-preview')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { files: 1, fileSize: 2 * 1024 * 1024, fields: 0 },
    }),
  )
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() photo: GoodsPhotoFile | undefined,
  ) {
    return this.photos.preview(user, photo);
  }

  /** Explicit corrected structured facts only. A photo digest is provenance,
   * not permission or proof of OCR correctness. Existing exact approval still required. */
  @Post('receipt-review')
  review(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const proposal = goodsProposal(body);
    return this.runtime.execute(user, GOODS_RECEIPT_TOOL, {
      surface: 'web',
      arguments: proposal,
      idempotencyKey:
        'goods-photo-' +
        goodsHash({
          tenant: user.tenantId,
          user: user.userId,
          photo: proposal.photo_sha256,
          line: proposal.source_line,
          version: proposal.review_version,
        }),
    });
  }
}
