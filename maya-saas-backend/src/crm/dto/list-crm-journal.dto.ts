import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListCrmJournalDto {
  @ApiProperty({
    example: '2026-07-31T00:00:00.000Z',
    description: 'Inclusive beginning of the journal range.',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    example: '2026-08-07T00:00:00.000Z',
    description: 'Exclusive end of the journal range.',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({
    description: 'Optionally limit the journal to one CRM staff member.',
  })
  @IsOptional()
  @IsString()
  providerId?: string;
}
