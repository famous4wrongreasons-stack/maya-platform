import {
  IsIn,
  IsUUID,
  Matches,
  ValidateIf,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ConnectCrmIntegrationDto } from './connect-crm-integration.dto';
export class YclientsLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  login!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
export class QualifiedConnectCrmIntegrationDto extends ConnectCrmIntegrationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => YclientsLoginDto)
  yclientsLogin?: YclientsLoginDto;
  @ValidateIf((_object, value: unknown) => value !== null)
  @Matches(/^[a-f0-9]{64}$/)
  expectedVersion!: string | null;
}
export class ActivateCrmIntegrationDto {
  @Matches(/^[a-f0-9]{64}$/)
  expectedVersion!: string;
}
export class CrmOperationQueryDto {
  @IsIn(['install', 'activate'])
  operation!: 'install' | 'activate';
  @IsUUID('4')
  requestId!: string;
}
