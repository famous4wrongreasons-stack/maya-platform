import { Injectable } from '@nestjs/common';

import { CrmService } from '../crm/crm.service';

@Injectable()
export class ServicesService {
  constructor(private readonly crmService: CrmService) {}

  listServices(tenantId: string) {
    return this.crmService.getServices(tenantId);
  }
}
