import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { Package5Wave1Module } from '../package5-wave1/package5-wave1.module';
import { C8Store } from './c8.store';
import { C8Sources } from './c8.sources';
@Module({
  imports: [PrismaModule, TenancyModule, Package5Wave1Module],
  providers: [C8Store, C8Sources],
  exports: [C8Store, C8Sources],
})
export class C8Module {}
