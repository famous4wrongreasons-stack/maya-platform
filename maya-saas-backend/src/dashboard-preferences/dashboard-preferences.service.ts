import {
  filterAssistantCapability,
  normalizeAssistantConfig,
  normalizeAssistantCapabilities,
  type AssistantConfig,
} from './assistant-preferences.read';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { Package5Wave1CanonicalCutoverService } from '../package5-wave1/package5-wave1-canonical-cutover.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  ASSISTANT_CAPABILITY_CATALOG,
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

@Injectable()
export class DashboardPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly canonicalWave1: Package5Wave1CanonicalCutoverService,
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
    idempotencyKey?: string,
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

    await this.canonicalWave1.updateFinance(
      scopedTenantId,
      userId,
      {
        enabledWidgets: next.enabled_widgets,
        monthlyTargetRub: next.monthly_target_rub,
        staffTargetsRub: next.staff_targets_rub,
      },
      idempotencyKey,
    );
    return this.getFinance(scopedTenantId, userId);
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
    return filterAssistantCapability(
      this.prisma,
      scopedTenantId,
      userIds,
      capability,
    );
  }

  async updateAssistant(
    tenantId: string,
    userId: string,
    dto: UpdateAssistantPreferencesDto,
    idempotencyKey?: string,
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
    await this.canonicalWave1.updateAssistant(
      scopedTenantId,
      userId,
      { enabledCapabilities: next.enabled_capabilities },
      idempotencyKey,
    );
    return this.getAssistant(scopedTenantId, userId);
  }

  private normalizeAssistantConfig(
    value: Prisma.JsonValue | undefined,
  ): AssistantConfig {
    return normalizeAssistantConfig(value);
  }

  private normalizeAssistantCapabilities(
    value: unknown,
  ): AssistantCapability[] {
    return normalizeAssistantCapabilities(value);
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
