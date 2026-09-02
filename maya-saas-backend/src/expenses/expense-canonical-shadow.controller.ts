import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import {
  CreateExpenseShadowDto,
  DeclareExpensePeriodShadowDto,
  DeleteExpenseShadowDto,
} from './dto/expense-shadow.dto';
import { ExpenseCanonicalShadowService } from './expense-canonical-shadow.service';

@ApiTags('expenses')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('expenses.core')
@Controller('expenses/internal/shadow')
export class ExpenseCanonicalShadowController {
  constructor(private readonly shadow: ExpenseCanonicalShadowService) {}

  @Post('create')
  @Roles(
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
    UserRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Plan an expense without expense mutation' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseShadowDto,
  ) {
    return this.shadow.planCreate(user.tenantId!, user.userId, dto);
  }

  @Post('delete')
  @Roles(
    UserRole.TENANT_OWNER,
    UserRole.BUSINESS_OWNER,
    UserRole.TENANT_ADMIN,
    UserRole.ADMINISTRATOR,
    UserRole.ACCOUNTANT,
  )
  @ApiOperation({ summary: 'Plan an exact expense deletion without mutation' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteExpenseShadowDto,
  ) {
    return this.shadow.planDelete(user.tenantId!, user.userId, dto);
  }

  @Post('declare-period')
  @Roles(UserRole.TENANT_OWNER, UserRole.BUSINESS_OWNER)
  @ApiOperation({
    summary: 'Plan a period completeness declaration without mutation',
  })
  declare(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeclareExpensePeriodShadowDto,
  ) {
    return this.shadow.planDeclare(user.tenantId!, user.userId, dto);
  }
}
