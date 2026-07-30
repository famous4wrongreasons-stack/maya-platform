import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    description:
      'Tenant slug for business users. Omit for platform owner login.',
    example: 'demo-business',
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;

  @ApiProperty({ example: 'admin@demo-business.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
