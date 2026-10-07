import { Injectable } from '@nestjs/common';

import { CrmService } from '../crm/crm.service';

@Injectable()
export class ServicesService {
  constructor(private readonly crmService: CrmService) {}

  async listServices(tenantId: string) {
    return (await this.crmService.readServiceCatalog(tenantId)).services;
  }
}
