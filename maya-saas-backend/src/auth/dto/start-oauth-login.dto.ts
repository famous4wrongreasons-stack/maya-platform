import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class StartOauthLoginDto {
  @ApiProperty({ example: 'demo-salon' })
  @IsString()
  tenantSlug!: string;

  @ApiProperty({
    example: 'https://malesthetic.pro/app/oauth-callback.html',
  })
  @IsString()
  @MaxLength(1024)
  redirectUri!: string;
}
