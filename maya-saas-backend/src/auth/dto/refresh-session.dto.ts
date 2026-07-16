import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshSessionDto {
  @ApiProperty({
    example: 'maya_rt_00000000-0000-4000-8000-000000000000.secret',
  })
  @IsString()
  @MinLength(64)
  @MaxLength(512)
  refreshToken!: string;
}
