import { C9WorkService } from './c9.work';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CrmModule } from '../crm/crm.module';
import { MeasurementModule } from '../measurement/measurement.module';
import { C8Module } from '../valuation/c8.module';
import { C9Authority } from './c9.authority';
import { C9RequestIdentity } from './c9.identity';
import { C9Sources } from './c9.sources';
import { C9Store } from './c9.store';
import { C9ContextService } from './c9.context';

@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    CrmModule,
    MeasurementModule,
    C8Module,
  ],
  providers: [
    C9ContextService,
    C9WorkService,
    C9Authority,
    C9RequestIdentity,
    C9Sources,
    C9Store,
  ],
  exports: [C9Store, C9WorkService, C9ContextService],
})
export class C9Module {}
