import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateInternalServiceDto } from './create-internal-service.dto';

export class UpdateInternalServiceDto extends PartialType(
  CreateInternalServiceDto,
) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
