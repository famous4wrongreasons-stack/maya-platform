import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyPhoneAuthDto {
  @ApiProperty({ example: 'demo-business' })
  @IsString()
  tenantSlug!: string;

  @ApiProperty({ example: '+79990000000' })
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  @Matches(/^\d+$/)
  code!: string;

  @ApiPropertyOptional({ example: 'cm123branch0001' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
