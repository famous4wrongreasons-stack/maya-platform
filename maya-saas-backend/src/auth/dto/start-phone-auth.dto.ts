import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class StartPhoneAuthDto {
  @ApiProperty({ example: 'demo-salon' })
  @IsString()
  tenantSlug!: string;

  @ApiProperty({ example: '+79990000000' })
  @IsString()
  @Matches(/^[+\d\s().-]+$/)
  phone!: string;
}
