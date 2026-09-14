import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { EXPENSE_CATEGORY_SLUGS } from '../expense-category';

export const EXPENSE_SHADOW_INITIATORS = ['http', 'ai_tool'] as const;

class ExpenseShadowIntentDto {
  @IsIn(EXPENSE_SHADOW_INITIATORS)
  initiator!: (typeof EXPENSE_SHADOW_INITIATORS)[number];

  @IsString()
  @MaxLength(240)
  source_intent_ref!: string;
}

export class CreateExpenseShadowDto extends ExpenseShadowIntentDto {
  @IsIn(EXPENSE_CATEGORY_SLUGS as string[])
  category!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount_kopecks!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsISO8601({ strict: true })
  occurred_at!: string;

  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DeleteExpenseShadowDto extends ExpenseShadowIntentDto {
  @IsString()
  @MaxLength(240)
  expense_id!: string;
}

export class DeclareExpensePeriodShadowDto extends ExpenseShadowIntentDto {
  @IsString()
  @MaxLength(10)
  period_from_day!: string;

  @IsString()
  @MaxLength(10)
  period_to_day!: string;
}
