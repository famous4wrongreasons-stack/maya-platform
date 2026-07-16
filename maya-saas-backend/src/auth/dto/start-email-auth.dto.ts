import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartEmailAuthDto {
  @ApiPropertyOptional({
    description:
      'Optional business slug. Omit it when signing in from the shared MAYA app.',
    example: 'demo-business',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiProperty({ example: 'owner@example.ru' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
