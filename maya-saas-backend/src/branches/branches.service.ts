import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
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

  async createForTenant(tenantId: string, dto: CreateBranchDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    await this.quotas.assertCanCreate(scopedTenantId, QuotaResource.BRANCHES);
    const branch = await this.prisma.branch.create({
      data: {
        tenantId: scopedTenantId,
        name: dto.name.trim(),
        address: dto.address?.trim() || null,
        phone: dto.phone?.trim() || null,
        timezone: dto.timezone?.trim() || null,
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
