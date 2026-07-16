import { Injectable } from '@nestjs/common';

import { CrmService } from '../crm/crm.service';

@Injectable()
export class StaffService {
  constructor(private readonly crmService: CrmService) {}

  listStaff(tenantId: string) {
    return this.crmService.getStaff(tenantId);
  }
}
