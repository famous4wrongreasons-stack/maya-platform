import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WeeklyAvailabilityRuleDto {
  @ApiProperty({
    example: 1,
    description: '0=Sunday, 1=Monday, ... 6=Saturday',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class ReplaceWeeklyAvailabilityDto {
  @ApiProperty({ type: [WeeklyAvailabilityRuleDto] })
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => WeeklyAvailabilityRuleDto)
  rules!: WeeklyAvailabilityRuleDto[];
}
