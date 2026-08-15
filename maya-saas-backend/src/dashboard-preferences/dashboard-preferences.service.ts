import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { AuditLogService } from '../audit-log/audit-log.service';
import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  ASSISTANT_CAPABILITIES,
  ASSISTANT_CAPABILITY_CATALOG,
  DEFAULT_ASSISTANT_CAPABILITIES,
  type AssistantCapability,
} from './assistant-capabilities.constants';
import { UpdateAssistantPreferencesDto } from './dto/update-assistant-preferences.dto';
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

const FINANCE_SECTION = 'finance';
const ASSISTANT_SECTION = 'assistant';
const EXTERNAL_STAFF_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

type AssistantConfig = {
  schema_version: 1;
  enabled_capabilities: AssistantCapability[];
};

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
          section: FINANCE_SECTION,
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
          section: FINANCE_SECTION,
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
          section: FINANCE_SECTION,
        },
      },
      create: {
        tenantId: scopedTenantId,
        userId,
        section: FINANCE_SECTION,
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
      section: FINANCE_SECTION,
      config,
      updated_at: updatedAt,
    };
  }

  async getAssistant(tenantId: string, userId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const preference = await this.prisma.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          userId,
          tenantId: scopedTenantId,
          section: ASSISTANT_SECTION,
        },
      },
    });
    return this.serializeAssistant(
      scopedTenantId,
      userId,
      this.normalizeAssistantConfig(preference?.configJson),
      preference?.updatedAt ?? null,
    );
  }

  async filterUsersWithAssistantCapability(
    tenantId: string,
    userIds: string[],
    capability: AssistantCapability,
  ): Promise<string[]> {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) return [];

    const preferences = await this.prisma.dashboardPreference.findMany({
      where: {
        tenantId: scopedTenantId,
        userId: { in: uniqueUserIds },
        section: ASSISTANT_SECTION,
      },
      select: { userId: true, configJson: true },
    });
    const configs = new Map(
      preferences.map((preference) => [
        preference.userId,
        this.normalizeAssistantConfig(preference.configJson),
      ]),
    );

    return uniqueUserIds.filter((userId) =>
      (configs.get(userId) ?? this.normalizeAssistantConfig(undefined))
        .enabled_capabilities.includes(capability),
    );
  }

  async updateAssistant(
    tenantId: string,
    userId: string,
    dto: UpdateAssistantPreferencesDto,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const current = await this.prisma.dashboardPreference.findUnique({
      where: {
        userId_tenantId_section: {
          userId,
          tenantId: scopedTenantId,
          section: ASSISTANT_SECTION,
        },
      },
    });
    const previous = this.normalizeAssistantConfig(current?.configJson);
    const next: AssistantConfig = {
      schema_version: 1,
      enabled_capabilities:
        dto.enabledCapabilities === undefined
          ? previous.enabled_capabilities
          : this.normalizeAssistantCapabilities(dto.enabledCapabilities),
    };
    const preference = await this.prisma.dashboardPreference.upsert({
      where: {
        userId_tenantId_section: {
          userId,
          tenantId: scopedTenantId,
          section: ASSISTANT_SECTION,
        },
      },
      create: {
        tenantId: scopedTenantId,
        userId,
        section: ASSISTANT_SECTION,
        configJson: asJson(next),
      },
      update: { configJson: asJson(next) },
    });
    await this.auditLogService.log({
      tenantId: scopedTenantId,
      userId,
      action: 'assistant.preferences.updated',
      entityType: 'dashboard_preference',
      entityId: preference.id,
      metadata: { enabled_capabilities: next.enabled_capabilities },
    });
    return this.serializeAssistant(
      scopedTenantId,
      userId,
      next,
      preference.updatedAt,
    );
  }

  private normalizeAssistantConfig(
    value: Prisma.JsonValue | undefined,
  ): AssistantConfig {
    const source =
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      schema_version: 1,
      enabled_capabilities:
        source.enabled_capabilities === undefined
          ? [...DEFAULT_ASSISTANT_CAPABILITIES]
          : this.normalizeAssistantCapabilities(source.enabled_capabilities),
    };
  }

  private normalizeAssistantCapabilities(
    value: unknown,
  ): AssistantCapability[] {
    if (!Array.isArray(value)) return [...DEFAULT_ASSISTANT_CAPABILITIES];
    const allowed = new Set<string>(ASSISTANT_CAPABILITIES);
    return value.filter(
      (capability, index, capabilities): capability is AssistantCapability =>
        typeof capability === 'string' &&
        allowed.has(capability) &&
        capabilities.indexOf(capability) === index,
    );
  }

  private serializeAssistant(
    tenantId: string,
    userId: string,
    config: AssistantConfig,
    updatedAt: Date | null,
  ) {
    return {
      tenant_id: tenantId,
      user_id: userId,
      section: ASSISTANT_SECTION,
      config,
      catalog: ASSISTANT_CAPABILITY_CATALOG,
      updated_at: updatedAt,
    };
  }
}
