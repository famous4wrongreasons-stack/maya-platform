import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateCurrentUserDto {
  @ApiPropertyOptional({ example: 'Станислав' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '+79990000000' })
  @IsOptional()
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  phone?: string;
}
