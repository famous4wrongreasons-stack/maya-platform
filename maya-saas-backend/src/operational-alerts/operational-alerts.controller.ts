import { BadRequestException,Body,Controller,Headers,Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { BridgeSourceService } from '../tenancy/bridge-source.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { OperationalAlertsService } from './operational-alerts.service';
@Controller('internal/legacy/operational-alerts')
export class OperationalAlertsController {
 constructor(private readonly owner:OperationalAlertsService,private readonly bridge:BridgeSourceService,private readonly context:TenantContextService){}
 @Public() @Post('tick') async tick(@Headers('x-maya-legacy-bridge') secret:string|undefined,@Body() body:unknown){
  this.bridge.assertBridgeSecret(secret,'MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN',{disabled:'alert_bridge_disabled',unauthorized:'alert_bridge_unauthorized'});
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='externalCompanyId,provider')throw new BadRequestException('R06 trigger contains only source binding');
  const value=body as Record<string,unknown>;if(typeof value.provider!=='string'||typeof value.externalCompanyId!=='string')throw new BadRequestException('R06 exact source required');
  const source=this.bridge.assertBridgeIntegrationBinding({provider:value.provider,externalCompanyId:value.externalCompanyId},{provider:'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_PROVIDER',externalCompanyId:'MAYA_LEGACY_APPOINTMENT_BRIDGE_SOURCE_COMPANY_ID'},{disabled:'alert_bridge_binding_disabled',mismatch:'alert_bridge_source_mismatch'});
  const tenant=await this.bridge.resolveTenantByIntegration(source,'alert_tenant_unresolved');return this.context.runAsSystemTenant(tenant.tenantId,()=>this.owner.tickTenant(tenant.tenantId));
 }
}
