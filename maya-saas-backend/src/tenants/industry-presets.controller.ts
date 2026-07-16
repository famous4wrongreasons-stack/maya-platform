import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  DEFAULT_INDUSTRY_PRESET_ID,
  listIndustryPresets,
} from '../common/industry-presets';
import { Public } from '../decorators/public.decorator';

@ApiTags('platform')
@Controller('industry-presets')
export class IndustryPresetsController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'List config-driven service industry presets' })
  listPresets() {
    return {
      default_id: DEFAULT_INDUSTRY_PRESET_ID,
      items: listIndustryPresets(),
    };
  }
}
