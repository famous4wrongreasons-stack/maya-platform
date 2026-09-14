import { C9WorkService } from './c9.work';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CrmModule } from '../crm/crm.module';
import { MeasurementModule } from '../measurement/measurement.module';
import { C8Module } from '../valuation/c8.module';
import { Package5Wave1Module } from '../package5-wave1/package5-wave1.module';
import { C9Agents } from './c9.agents';
import { C9Allowance } from './c9.allowance';
import { C9Authority } from './c9.authority';
import { C9Controller } from './c9.controller';
import { C9ModelGateway } from './c9.model';
import { C9Orchestrator } from './c9.orchestrator';
import { C9RequestIdentity } from './c9.identity';
import { C9Sources } from './c9.sources';
import { C9Store } from './c9.store';
import { C9ContextService } from './c9.context';
import { C9PolicyService } from './c9.policy.service';

@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    CrmModule,
    MeasurementModule,
    C8Module,
    Package5Wave1Module,
  ],
  controllers: [C9Controller],
  providers: [
    C9Agents,
    C9Allowance,
    C9ContextService,
    C9ModelGateway,
    C9Orchestrator,
    C9WorkService,
    C9Authority,
    C9RequestIdentity,
    C9Sources,
    C9Store,
    C9PolicyService,
  ],
  exports: [
    C9Store,
    C9WorkService,
    C9ContextService,
    C9Orchestrator,
    C9PolicyService,
  ],
})
export class C9Module {}
