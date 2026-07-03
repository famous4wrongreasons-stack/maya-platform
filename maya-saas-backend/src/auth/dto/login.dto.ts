import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    description: 'Tenant slug for salon users. Omit for platform owner login.',
    example: 'demo-salon',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiProperty({ example: 'admin@demo-salon.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
