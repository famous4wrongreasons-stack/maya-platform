import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

/** Shared read-only catalog/policy; importing it never installs an AI executor. */
@Module({imports:[EntitlementsModule,TenancyModule],providers:[AiToolPolicyService,AiToolRegistryService],exports:[AiToolPolicyService,AiToolRegistryService]})
export class AiToolPolicyModule {}
