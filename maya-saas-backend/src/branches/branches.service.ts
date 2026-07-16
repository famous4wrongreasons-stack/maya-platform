import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
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
