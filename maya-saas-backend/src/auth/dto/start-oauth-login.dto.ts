import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartOauthLoginDto {
  @ApiProperty({ example: 'demo-business' })
  @IsString()
  tenantSlug!: string;

  @ApiPropertyOptional({
    description:
      'Exact allowlisted web callback. Omit for the native iOS platform.',
    example: 'https://maya.example/oauth-callback.html',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  redirectUri?: string;

  @ApiPropertyOptional({
    description:
      'Client platform. Native iOS always uses the server-owned callback.',
    enum: ['web', 'ios'],
    example: 'ios',
  })
  @IsOptional()
  @IsIn(['web', 'ios'])
  platform?: 'web' | 'ios';
}
