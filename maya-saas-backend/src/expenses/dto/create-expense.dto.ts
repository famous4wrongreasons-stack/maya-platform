import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { EXPENSE_CATEGORY_SLUGS } from '../expense-category';

export class CreateExpenseDto {
  /**
   * Только слаг из справочника. Свободная строка разъезжалась на «rent» /
   * «arenda» / «arenda-avgust», и одна статья превращалась в три.
   */
  @IsString()
  @IsIn(EXPENSE_CATEGORY_SLUGS as string[])
  category!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amountKopecks!: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
