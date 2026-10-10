import { IsIn, IsUUID, Matches, ValidateIf } from 'class-validator';
import { ConnectCrmIntegrationDto } from './connect-crm-integration.dto';
export class QualifiedConnectCrmIntegrationDto extends ConnectCrmIntegrationDto {
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
