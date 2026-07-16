import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteOauthLoginDto {
  @ApiProperty({ example: 'yx_abc123state' })
  @IsString()
  @MaxLength(255)
  state!: string;

  @ApiProperty({ example: 'oauth-confirmation-code' })
  @IsString()
  @MaxLength(2048)
  code!: string;

  @ApiPropertyOptional({ example: 'cm123branch0001' })
  @IsOptional()
  @IsString()
  branchId?: string;
}
