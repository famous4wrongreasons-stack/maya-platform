import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async listForTenant(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const branches = await this.prisma.branch.findMany({
      where: { tenantId: scopedTenantId },
      orderBy: { createdAt: 'asc' },
    });

    return branches.map((branch) => ({
      id: branch.id,
      tenant_id: branch.tenantId,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      timezone: branch.timezone,
      created_at: branch.createdAt,
      updated_at: branch.updatedAt,
    }));
  }
}
