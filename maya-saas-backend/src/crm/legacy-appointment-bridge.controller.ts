import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import {
  LegacyAppointmentBridgeDto,
  LegacyAppointmentBridgeStatusQueryDto,
} from './dto/legacy-appointment-bridge.dto';
import { LegacyAppointmentBridgeService } from './legacy-appointment-bridge.service';

@ApiTags('internal')
@Controller('internal/legacy/appointment-actions')
export class LegacyAppointmentBridgeController {
  constructor(private readonly bridge: LegacyAppointmentBridgeService) {}

  @Public()
  @Post('shadow')
  @ApiOperation({
    summary: 'Preview a legacy appointment action without CRM mutation',
  })
  shadow(
    @Headers('x-maya-legacy-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyAppointmentBridgeDto,
  ) {
    this.bridge.assertSecret(bridgeToken);
    return this.bridge.shadow(dto);
  }

  @Public()
  @Post('execute')
  @ApiOperation({
    summary: 'Initiate a legacy appointment action through Action Engine',
  })
  execute(
    @Headers('x-maya-legacy-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyAppointmentBridgeDto,
  ) {
    this.bridge.assertSecret(bridgeToken);
    return this.bridge.execute(dto);
  }

  @Public()
  @Get('executions/:executionId')
  @ApiOperation({ summary: 'Read canonical Action Engine execution state' })
  status(
    @Headers('x-maya-legacy-bridge') bridgeToken: string | undefined,
    @Param('executionId') executionId: string,
    @Query() query: LegacyAppointmentBridgeStatusQueryDto,
  ) {
    this.bridge.assertSecret(bridgeToken);
    return this.bridge.status({
      provider: query.provider,
      externalCompanyId: query.external_company_id,
      executionId,
    });
  }
}
