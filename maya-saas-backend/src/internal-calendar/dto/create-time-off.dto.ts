import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateTimeOffDto {
  @ApiProperty({ example: '2026-07-20T09:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-07-20T18:00:00.000Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ example: 'Выходной' })
  @IsOptional()
  @IsString()
  note?: string;
}
