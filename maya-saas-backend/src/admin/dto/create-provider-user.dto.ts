import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateProviderUserDto {
  @ApiProperty({ example: 'barber@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: 'Илья' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  phone?: string;

  @ApiPropertyOptional({
    example: 'StrongPass123',
    description:
      'Optional. If omitted, backend generates a temporary password; email-code login remains available.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
