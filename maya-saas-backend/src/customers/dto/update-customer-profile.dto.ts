import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateCustomerProfileDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  preferredLocale?: string;

  @IsOptional()
  @IsBoolean()
  privacyConsent?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
