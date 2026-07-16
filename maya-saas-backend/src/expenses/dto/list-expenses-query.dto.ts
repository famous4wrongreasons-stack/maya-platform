import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ListExpensesQueryDto {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
