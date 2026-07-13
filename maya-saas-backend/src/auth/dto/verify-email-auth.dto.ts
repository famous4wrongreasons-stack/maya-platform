import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyEmailAuthDto {
  @ApiProperty({ example: 'demo-business' })
  @IsString()
  tenantSlug!: string;

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
