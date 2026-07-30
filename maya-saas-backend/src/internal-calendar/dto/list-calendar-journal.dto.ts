import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListCalendarJournalDto {
  @ApiProperty({
    example: '2026-07-14T00:00:00.000Z',
    description: 'Inclusive beginning of the calendar range.',
  })
  @IsDateString()
  from!: string;

  @ApiProperty({
    example: '2026-07-21T00:00:00.000Z',
    description: 'Exclusive end of the calendar range.',
  })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({
    description: 'Optionally limit the journal to one internal provider.',
  })
  @IsOptional()
  @IsString()
  providerId?: string;
}
