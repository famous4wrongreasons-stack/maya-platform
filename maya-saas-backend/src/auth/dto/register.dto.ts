import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'demo-salon' })
  @IsString()
  tenantSlug!: string;

  @ApiPropertyOptional({ example: 'Станислав' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'client@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'ChangeMe123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'cm123branch0001' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
