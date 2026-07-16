import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantsService } from '../tenants/tenants.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantsService: TenantsService,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(tenantId: string, actorUserId: string, dto: CreateExpenseDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    if (dto.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        dto.branchId,
        scopedTenantId,
      );
    }
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid expense date');
    }

    const expense = await this.prisma.expense.create({
      data: {
        tenantId: scopedTenantId,
        branchId: dto.branchId ?? null,
        branchTenantId: dto.branchId ? scopedTenantId : null,
        createdById: actorUserId,
        createdByTenantId: scopedTenantId,
        category: dto.category,
        amountKopecks: dto.amountKopecks,
        currency: dto.currency ?? 'RUB',
        occurredAt,
        encryptedNote: dto.note?.trim()
          ? this.encryptionService.encrypt(dto.note.trim())
          : null,
      },
    });

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'expense.created',
      entityType: 'expense',
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amount_kopecks: expense.amountKopecks,
        currency: expense.currency,
        occurred_at: expense.occurredAt.toISOString(),
      },
    });

    return this.serialize(expense);
  }

  async list(tenantId: string, query: ListExpensesQueryDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.assertRange(from, to);
    if (query.branchId) {
      await this.tenantsService.assertBranchBelongsToTenant(
        query.branchId,
        scopedTenantId,
      );
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId: scopedTenantId,
        occurredAt: { gte: from, lte: to },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return {
      items: expenses.map((expense) => this.serialize(expense)),
      totals: Object.values(
        expenses.reduce<
          Record<string, { currency: string; amount_kopecks: number }>
        >((totals, expense) => {
          const current = totals[expense.currency] ?? {
            currency: expense.currency,
            amount_kopecks: 0,
          };
          current.amount_kopecks += expense.amountKopecks;
          totals[expense.currency] = current;
          return totals;
        }, {}),
      ),
      truncated: expenses.length === 500,
    };
  }

  async remove(tenantId: string, actorUserId: string, expenseId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tenantId: scopedTenantId },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.prisma.expense.delete({
      where: { id_tenantId: { id: expenseId, tenantId: scopedTenantId } },
    });
    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId: actorUserId,
      action: 'expense.deleted',
      entityType: 'expense',
      entityId: expenseId,
      metadata: {
        category: expense.category,
        amount_kopecks: expense.amountKopecks,
        currency: expense.currency,
      },
    });

    return { ok: true, expense_id: expenseId };
  }

  private assertRange(from: Date, to: Date): void {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() > to.getTime()
    ) {
      throw new BadRequestException('Invalid expense date range');
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Expense date range cannot exceed 366 days',
      );
    }
  }

  private serialize(expense: {
    id: string;
    tenantId: string;
    branchId: string | null;
    category: string;
    amountKopecks: number;
    currency: string;
    occurredAt: Date;
    encryptedNote: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: expense.id,
      tenant_id: expense.tenantId,
      branch_id: expense.branchId,
      category: expense.category,
      amount_kopecks: expense.amountKopecks,
      currency: expense.currency,
      occurred_at: expense.occurredAt,
      note: expense.encryptedNote
        ? this.encryptionService.decrypt(expense.encryptedNote)
        : null,
      created_at: expense.createdAt,
      updated_at: expense.updatedAt,
    };
  }
}
