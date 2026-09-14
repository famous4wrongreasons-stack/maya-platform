import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { ShadowDeliveryDto } from './dto/shadow-delivery.dto';
import { ShadowIngestionService } from './shadow-ingestion.service';

/**
 * Теневой приём доставок CRM.
 *
 * 🔴 Приёмник ничего не делает наружу: ни уведомлений, ни записей в CRM, ни
 * карточек. Он только замечает. Обработчиком остаётся легаси-бот, и это
 * состояние держится флагом окружения, а не обещанием.
 */
@ApiTags('crm')
@Controller('integrations/crm/shadow')
export class ShadowIngestionController {
  constructor(private readonly shadowIngestion: ShadowIngestionService) {}

  @Public()
  @Post('deliveries')
  @ApiOperation({ summary: 'Shadow-observe a CRM delivery (no side effects)' })
  async ingest(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: ShadowDeliveryDto,
  ) {
    this.shadowIngestion.assertSecret(bridgeToken);
    return this.shadowIngestion.ingest(dto);
  }
}
