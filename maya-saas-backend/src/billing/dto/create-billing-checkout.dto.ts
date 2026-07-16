import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateBillingCheckoutDto {
  @ApiPropertyOptional({
    description:
      'Subscription plan to pay for. Defaults to the tenant current plan.',
  })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({
    example: 'https://malesthetic.pro/app/maya-admin.html',
    description: 'URL where YooKassa redirects the salon owner after checkout.',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}
