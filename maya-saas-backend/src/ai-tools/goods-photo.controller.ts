import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
import {
  C9Orchestrator,
  type C9ConversationReads,
} from '../orchestration/c9.orchestrator';
import {
  AI_TYPED_WIDGET_TRIGGER,
  type AiTypedWidgetTriggerPort,
} from './ai-typed-widget-trigger.port';
import {
  goodsPhotoItemResult,
  goodsPhotoRecord,
  goodsPhotoRequest,
  goodsPhotoSearchResult,
  type GoodsPhotoRequest,
} from './goods-photo.contract';
import type { AiReadWidgetResolution } from './ai-read-widget-trigger.port';

@ApiTags('ai-goods')
@ApiBearerAuth()
@TenantScoped()
@Controller('ai/goods')
export class GoodsPhotoController {
  constructor(
    private readonly photos: GoodsPhotoService,
    private readonly runtime: AiToolRuntimeService,
    private readonly orchestrator: C9Orchestrator,
    private readonly moduleRef: ModuleRef,
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

  @Post('search')
  search(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.lookup(user, body, 'query');
  }

  @Post('item-read')
  item(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.lookup(user, body, 'goods_id');
  }

  /** Explicit corrected structured facts only. A photo digest is provenance,
   * not permission or proof of OCR correctness. Existing exact approval still required. */
  @Post('receipt-review')
  async review(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = goodsPhotoRequest(body, 'proposal');
    const proposal = goodsProposal(input.proposal);
    const source = await this.photos.sourceIdentity(
      user,
      GOODS_RECEIPT_TOOL,
      input.source_revision,
    );
    // The source tuple owns durable review identity. The caller's requestId is
    // transport correlation only; exact changed facts conflict in the existing
    // approval owner. A corrected version creates a new explicit turn.
    const requestId =
      'goods-review-' +
      goodsHash({
        photo: proposal.photo_sha256,
        line: proposal.source_line,
        version: proposal.review_version,
      });
    const userText = `Подготовь предложение прихода по проверенной строке ${String(proposal.source_line)} накладной, версия ${String(proposal.review_version)}.`;
    const timeline = this.timeline();
    const userTurn = await this.persistTurn(
      timeline,
      user,
      input,
      requestId,
      userText,
    );
    const output = goodsPhotoRecord(
      await this.runtime.execute(
        user,
        GOODS_RECEIPT_TOOL,
        {
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
        },
        {
          goodsReviewOnly: true,
          widgetTrigger: 'T-2a',
          userTurn,
          requestId: input.requestId,
        },
      ),
    );
    const status = output.status;
    if (!['approval_required', 'completed', 'held'].includes(String(status)))
      throw new ConflictException('goods_receipt_review_unconfirmed');
    const resolution = goodsPhotoRecord(output.resolution);
    if (
      status === 'approval_required' &&
      (resolution.matched !== true ||
        !resolution.receipt ||
        typeof resolution.receipt !== 'object')
    )
      // A crash-created standalone approval cannot be reparented on replay.
      throw new ConflictException('goods_receipt_chat_projection_unavailable');
    const reply =
      status === 'approval_required'
        ? 'Предложение подготовлено. Проверьте карточку и отдельно подтвердите приход.'
        : status === 'completed'
          ? 'Для этой версии уже сохранён результат. Проверьте его в истории чата.'
          : 'Для этой версии уже начато выполнение. Результат пока не подтверждён; повторная отправка не выполнялась.';
    await this.photos.sourceIdentity(user, GOODS_RECEIPT_TOOL, source);
    await this.complete(timeline, user, userTurn, reply, { status, proposal });
    await this.photos.sourceIdentity(user, GOODS_RECEIPT_TOOL, source);
    return {
      contract: 'maya.goods-photo.review/1' as const,
      conversationId: userTurn.conversationId,
      user_turn: userTurn,
      user_text: userText,
      reply,
      status: status as 'approval_required' | 'completed' | 'held',
      ...(status === 'approval_required'
        ? { resolution: output.resolution as AiReadWidgetResolution }
        : {}),
    };
  }

  private async lookup(
    user: AuthenticatedUser,
    body: unknown,
    field: 'query' | 'goods_id',
  ) {
    const input = goodsPhotoRequest(body, field);
    const tool =
      field === 'query' ? 'inventory.goods.search' : 'inventory.goods.read';
    const source = await this.photos.sourceIdentity(
      user,
      tool,
      input.source_revision,
    );
    const timeline = this.timeline();
    const requestId =
      'goods-lookup-' + goodsHash({ tool, request: input.requestId });
    const args = { [field]: input[field] };
    const userText =
      field === 'query'
        ? `Найди товары и категории для строки накладной: ${String(input.query)}.`
        : `Покажи сведения о выбранном товаре ${String(input.goods_id)} для строки накладной.`;
    const userTurn = await this.persistTurn(
      timeline,
      user,
      input,
      requestId,
      userText,
    );
    const turn: C9ConversationReads = {
      turn: userTurn,
      intentHash: this.orchestrator.conversationDigest([
        'goods-photo-explicit-read/1',
        tool,
        args,
      ]),
    };
    const dto = {
      surface: 'web' as const,
      arguments: args,
      idempotencyKey: requestId,
    };
    const internal = {
      suppressWidgetTrigger: true,
      widgetTrigger: 'T-2a' as const,
      requestId,
      userTurn,
    };
    let output: unknown;
    try {
      output = await this.orchestrator.conversationRead(
        turn,
        tool,
        requestId,
        this.orchestrator.conversationDigest([
          'goods-photo-read-input/1',
          tool,
          args,
          user.role,
        ]),
        () => this.runtime.execute(user, tool, dto, internal),
        (executionId) =>
          this.runtime.replayCompletedRead(
            user,
            tool,
            dto,
            executionId,
            internal,
          ),
      );
    } finally {
      await this.orchestrator.finishConversationReads(turn);
    }
    const result =
      field === 'query'
        ? goodsPhotoSearchResult(output, input.query as string)
        : goodsPhotoItemResult(output, input.goods_id as string);
    const reply =
      field === 'query'
        ? 'Поиск выполнен. Проверьте ограниченный список товаров и категорий в форме строки накладной.'
        : 'Сведения о выбранном товаре получены. Проверьте единицу; закупочную цену накладной укажите отдельно.';
    await this.photos.sourceIdentity(user, tool, source);
    await this.complete(timeline, user, userTurn, reply, { tool, result });
    await this.photos.sourceIdentity(user, tool, source);
    return {
      contract:
        field === 'query'
          ? ('maya.goods-photo.search/1' as const)
          : ('maya.goods-photo.item/1' as const),
      conversationId: userTurn.conversationId,
      user_turn: userTurn,
      user_text: userText,
      reply,
      result,
      source_revision: source,
    };
  }

  private timeline(): AiTypedWidgetTriggerPort {
    try {
      const timeline = this.moduleRef.get<AiTypedWidgetTriggerPort>(
        AI_TYPED_WIDGET_TRIGGER,
        { strict: false },
      );
      if (timeline) return timeline;
    } catch {
      /* Missing canonical composition fails closed, never standalone. */
    }
    throw new ServiceUnavailableException('goods_photo_chat_unavailable');
  }

  private async persistTurn(
    timeline: AiTypedWidgetTriggerPort,
    actor: AuthenticatedUser,
    input: GoodsPhotoRequest,
    requestId: string,
    utterance: string,
  ) {
    if (
      input.conversationId === undefined &&
      (await timeline.readCurrentConversation(actor)).conversationId !== null
    )
      throw new BadRequestException('goods_photo_conversation_required');
    const turn = await timeline.persistTypedTurn({
      actor,
      surface: 'web',
      requestId,
      utterance,
      ...(input.conversationId === undefined
        ? {}
        : { conversationId: input.conversationId }),
    });
    if (!turn)
      throw new ServiceUnavailableException('goods_photo_chat_unavailable');
    return turn;
  }

  private complete(
    timeline: AiTypedWidgetTriggerPort,
    actor: AuthenticatedUser,
    userTurn: { turnId: string; conversationId: string },
    reply: string,
    outcome: unknown,
  ) {
    return timeline.persistAssistantReply({
      actor,
      userTurn,
      reply,
      semanticContext: null,
      completionHash: goodsHash({
        contract: 'maya.goods-photo.completion/1',
        reply,
        outcome,
      }),
    });
  }
}
