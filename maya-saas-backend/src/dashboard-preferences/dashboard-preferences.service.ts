import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateFinanceDashboardDto } from './dto/update-finance-dashboard.dto';
import {
  DEFAULT_FINANCE_DASHBOARD_WIDGETS,
  FINANCE_DASHBOARD_WIDGETS,
  type FinanceDashboardWidget,
} from './finance-dashboard.constants';

type FinanceDashboardConfig = {
  schema_version: 1;
  enabled_widgets: FinanceDashboardWidget[];
  monthly_target_rub: number | null;
  staff_targets_rub: Record<string, number>;
};

const SECTION = 'finance';
const EXTERNAL_STAFF_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

@Injectable()
export class DashboardPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getFinance(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const preference = await this.prisma.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          userId,
          tenantId: scopedTenantId,
          section: SECTION,
        },
      },
    });

    return this.serialize(
      scopedTenantId,
      userId,
      this.normalizeConfig(preference?.configJson),
      preference?.updatedAt ?? null,
    );
  }

  async updateFinance(
    tenantId: string,
    userId: string,
    dto: UpdateFinanceDashboardDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const current = await this.prisma.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          userId,
          tenantId: scopedTenantId,
          section: SECTION,
        },
      },
    });
    const previous = this.normalizeConfig(current?.configJson);
    const next: FinanceDashboardConfig = {
      schema_version: 1,
      enabled_widgets:
        dto.enabledWidgets === undefined
          ? previous.enabled_widgets
          : this.normalizeWidgets(dto.enabledWidgets),
      monthly_target_rub:
        dto.monthlyTargetRub === undefined
          ? previous.monthly_target_rub
          : dto.monthlyTargetRub,
      staff_targets_rub:
        dto.staffTargetsRub === undefined
          ? previous.staff_targets_rub
          : this.normalizeStaffTargets(dto.staffTargetsRub, true),
    };

    const preference = await this.prisma.dashboardPreference.upsert({
      where: {
        userId_tenantId_section: {
          userId,
          tenantId: scopedTenantId,
          section: SECTION,
        },
      },
      create: {
        tenantId: scopedTenantId,
        userId,
        section: SECTION,
        configJson: asJson(next),
      },
      update: { configJson: asJson(next) },
    });

    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId,
      action: 'dashboard.finance.updated',
      entityType: 'dashboard_preference',
      entityId: preference.id,
      metadata: {
        enabled_widgets: next.enabled_widgets,
        has_monthly_target: next.monthly_target_rub !== null,
        staff_target_count: Object.keys(next.staff_targets_rub).length,
      },
    });

    return this.serialize(scopedTenantId, userId, next, preference.updatedAt);
  }

  private normalizeConfig(
    value: Prisma.JsonValue | undefined,
  ): FinanceDashboardConfig {
    const source =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      schema_version: 1,
      enabled_widgets: this.normalizeWidgets(source.enabled_widgets),
      monthly_target_rub: this.normalizeNullableTarget(
        source.monthly_target_rub,
      ),
      staff_targets_rub: this.normalizeStaffTargets(source.staff_targets_rub),
    };
  }

  private normalizeWidgets(value: unknown): FinanceDashboardWidget[] {
    if (!Array.isArray(value)) return [...DEFAULT_FINANCE_DASHBOARD_WIDGETS];
    const allowed = new Set<string>(FINANCE_DASHBOARD_WIDGETS);
    return value.filter(
      (widget, index, widgets): widget is FinanceDashboardWidget =>
        typeof widget === 'string' &&
        allowed.has(widget) &&
        widgets.indexOf(widget) === index,
    );
  }

  private normalizeNullableTarget(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const target = Number(value);
    if (!Number.isFinite(target) || target < 0 || target > 100_000_000) {
      return null;
    }
    return Math.round(target * 100) / 100;
  }

  private normalizeStaffTargets(
    value: unknown,
    rejectInvalid = false,
  ): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, number> = {};
    for (const [staffId, rawTarget] of Object.entries(value)) {
      if (!EXTERNAL_STAFF_ID.test(staffId)) {
        if (rejectInvalid) {
          throw new BadRequestException('Invalid external staff id in targets');
        }
        continue;
      }
      const target = Number(rawTarget);
      if (!Number.isFinite(target) || target < 0 || target > 100_000_000) {
        if (rejectInvalid) {
          throw new BadRequestException('Invalid staff finance target');
        }
        continue;
      }
      result[staffId] = Math.round(target * 100) / 100;
    }
    return result;
  }

  private serialize(
    tenantId: string,
    userId: string,
    config: FinanceDashboardConfig,
    updatedAt: Date | null,
  ) {
    return {
      tenant_id: tenantId,
      user_id: userId,
      section: SECTION,
      config,
      updated_at: updatedAt,
    };
  }
}
