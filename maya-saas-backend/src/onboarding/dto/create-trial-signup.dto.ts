import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTrialSignupDto {
  @ApiProperty({ example: 'Barbershop Griva' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'griva' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiProperty({ example: 'owner@griva.ru' })
  @IsEmail()
  ownerEmail!: string;

  @ApiPropertyOptional({ example: 'Илья' })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  ownerPhone?: string;

  @ApiPropertyOptional({
    example: 'StrongPass123',
    description:
      'Optional. If omitted, backend generates a temporary password and returns it once.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ example: 'Main Branch' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional({ example: 'Moscow, Tverskaya 1' })
  @IsOptional()
  @IsString()
  branchAddress?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  branchPhone?: string;

  @ApiPropertyOptional({ example: 'Europe/Moscow' })
  @IsOptional()
  @IsString()
  branchTimezone?: string;

  @ApiPropertyOptional({
    example: 'cm-demo-plan',
    description:
      'Optional. Useful when the frontend wants to preselect a plan.',
  })
  @IsOptional()
  @IsString()
  planId?: string;
}
