import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class StartEmailAuthDto {
  @ApiProperty({ example: 'demo-business' })
  @IsString()
  tenantSlug!: string;

  @ApiProperty({ example: 'owner@example.ru' })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
