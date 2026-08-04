import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConnectCommerceIntegrationDto {
  @ApiProperty({
    description: 'YooKassa shopId belonging to the current tenant.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  shopId!: string;

  @ApiProperty({
    description:
      'YooKassa secret key. It is verified before encryption and is never returned.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  secretKey!: string;
}
