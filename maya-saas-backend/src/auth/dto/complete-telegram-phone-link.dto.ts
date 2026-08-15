import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/** Контакт, присланный платформенным ботом после «Поделиться номером». */
export class CompleteTelegramPhoneLinkDto {
  @ApiProperty()
  @IsString()
  @Length(16, 64)
  code!: string;

  @ApiProperty({ example: "+79990000000" })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone!: string;
}
