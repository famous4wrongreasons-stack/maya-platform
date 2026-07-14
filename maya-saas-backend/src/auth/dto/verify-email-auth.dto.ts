import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyEmailAuthDto {
  @ApiPropertyOptional({
    description:
      'Optional business slug. Omit it for automatic business discovery.',
    example: 'demo-business',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiProperty({ example: 'owner@example.ru' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  @Matches(/^\d+$/)
  code!: string;
}
