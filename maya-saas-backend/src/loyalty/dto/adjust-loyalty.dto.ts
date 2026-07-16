import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdjustLoyaltyDto {
  @Type(() => Number)
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  delta!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  reason!: string;

  @IsUUID()
  idempotencyKey!: string;
}
