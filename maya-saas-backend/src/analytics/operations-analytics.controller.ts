import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { AnalyticsRangeQueryDto } from './dto/analytics-range-query.dto';
import { BusinessStateService } from '../business-state/business-state.service';
import {
  withLegacyNet,
  withoutFactDiagnostics,
  withoutOperationalStatusBuckets,
} from './cabinet-overview.presenter';
import { OperationsAnalyticsService } from './operations-analytics.service';

const BUSINESS_ANALYTICS_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
] as const;

const BUSINESS_FINANCE_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
] as const;

const EMPLOYEE_ANALYTICS_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.MANAGER,
  UserRole.BRANCH_MANAGER,
  UserRole.PROVIDER,
  UserRole.EMPLOYEE,
  UserRole.STAFF,
] as const;

@ApiTags('analytics')
@ApiBearerAuth()
@TenantScoped()
@Controller('analytics')
export class OperationsAnalyticsController {
  constructor(
    /**
     * 🔴 Cycle 04 P3. Факты приходят от канонического владельца.
     *
     * Раньше кабинет звал собственный метод сервиса аналитики, и совместимость
     * контракта жила внутри вычисления — там же считался `net`, второй владелец
     * прибыли. Теперь вычисление одно, а совместимость — отдельный презентер на
     * HTTP-краю, под своим именем.
     */
    private readonly businessState: BusinessStateService,
    /** Финансовая сводка провайдера: другой факт, другой владелец. */
    private readonly analytics: OperationsAnalyticsService,
  ) {}

  /**
   * Кабинет просит ИСХОДНЫЙ операционный обзор, а не опубликованный срез.
   *
   * Это авторизованный фронт владельца, а не языковая модель: ему нужны
   * внешние идентификаторы мастеров и цены журнала в их разрезе. Денежный
   * контур при этом НЕ читается — кабинет его и раньше не запрашивал, и
   * добавлять сетевой вызов под видом миграции нельзя.
   */
  private cabinetRequest(tenantId: string, query: AnalyticsRangeQueryDto) {
    return {
      tenantId,
      period: query,
      comparisonMode: 'none' as const,
      comparisonPeriod: null,
      financeAllowed: false,
      bookedValueAllowed: false,
      operationalDetail: true,
      /**
       * 🔴 Кабинет не повторял чтение никогда, и не начинает.
       *
       * Повтор — политика чтения инструмента модели, а не свойство факта.
       * Приехав сюда вместе с переносом, он удвоил бы нагрузку на провайдера
       * ровно в момент его отказа и добавил бы 250 мс к каждой ошибке, которую
       * человек и так ждёт с таймаутом.
       */
      retryOnFailure: false,
      disclose: () => ({
        names: new Map<string, string>(),
        allowedExternalIds: new Set<string>(),
      }),
    };
  }

  @Get('business')
  @Roles(...BUSINESS_ANALYTICS_ROLES)
  @RequiresFeature('analytics.business')
  @ApiOperation({ summary: 'Get tenant business operational analytics' })
  async getBusiness(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.cabinet(
      await this.businessState.business(
        this.cabinetRequest(user.tenantId!, query),
      ),
    );
  }

  @Get('business/finance')
  @Roles(...BUSINESS_FINANCE_ROLES)
  @RequiresFeature('analytics.business')
  @ApiOperation({
    summary: 'Get verified tenant finance and payroll from the external CRM',
  })
  getBusinessFinance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.analytics.getBusinessFinance(user.tenantId!, query);
  }

  @Get('me')
  @Roles(...EMPLOYEE_ANALYTICS_ROLES)
  @RequiresFeature('analytics.employee')
  @ApiOperation({ summary: 'Get employee-scoped operational analytics' })
  async getMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AnalyticsRangeQueryDto,
  ) {
    return this.cabinet(
      await this.businessState.employee({
        ...this.cabinetRequest(user.tenantId!, query),
        userId: user.userId,
        nameRows: () => new Map<string, string>(),
      }),
    );
  }

  /** Канонический state → опубликованный контракт кабинета. */
  private cabinet(state: { sourceOverview: unknown }) {
    return withLegacyNet(
      withoutOperationalStatusBuckets(
        withoutFactDiagnostics(
          state.sourceOverview as Parameters<typeof withLegacyNet>[0],
        ),
      ),
    );
  }
}
