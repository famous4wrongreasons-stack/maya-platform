import { Module } from '@nestjs/common';

import { BrandingService } from './branding.service';

@Module({
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
