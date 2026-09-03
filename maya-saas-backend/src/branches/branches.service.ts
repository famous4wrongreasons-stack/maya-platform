import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Package5Wave2CanonicalCutoverService } from '../package5-wave2/package5-wave2-canonical-cutover.service';
import { QuotaResource } from '../quotas/quota-resource';
import { QuotaService } from '../quotas/quota.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly quotas: QuotaService,
    private readonly canonicalWave2: Package5Wave2CanonicalCutoverService,
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

  async createForTenant(
    tenantId: string,
    actorUserId: string,
    dto: CreateBranchDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.quotas.assertCanCreate(scopedTenantId, QuotaResource.BRANCHES);
    const sourceIntentRef = this.canonicalWave2.intentRef();
    const branchId = this.canonicalWave2.deterministicTargetId(
      'create_tenant_branch',
      scopedTenantId,
      sourceIntentRef,
    );
    await this.canonicalWave2.execute(
      scopedTenantId,
      { userId: actorUserId },
      {
        operation: 'create_tenant_branch',
        branchId,
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        timezone: dto.timezone,
      },
      sourceIntentRef,
    );
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: {
        id_tenantId: { id: branchId, tenantId: scopedTenantId },
      },
    });

    return {
      id: branch.id,
      tenant_id: branch.tenantId,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      timezone: branch.timezone,
      created_at: branch.createdAt,
      updated_at: branch.updatedAt,
    };
  }
}
