import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class PreviewAppointmentDto {
  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiProperty({ example: '2026-07-05T11:00:00' })
  @IsDateString()
  start!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 'Станислав' })
  @IsString()
  clientName!: string;

  @ApiProperty({ example: '+79990000000' })
  @IsString()
  clientPhone!: string;
}
