import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCustomerNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string | null;
}
