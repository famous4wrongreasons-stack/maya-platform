import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { RequiresFeature } from '../entitlements/requires-feature.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { ExpensesService } from './expenses.service';

const EXPENSE_MANAGER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
  UserRole.ADMINISTRATOR,
  UserRole.ACCOUNTANT,
] as const;

@ApiTags('expenses')
@ApiBearerAuth()
@TenantScoped()
@RequiresFeature('expenses.core')
@Roles(...EXPENSE_MANAGER_ROLES)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Create an encrypted-note tenant expense' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.expensesService.create(user.tenantId!, user.userId, dto, {
      source: 'manual',
      initiator: 'http',
      idempotencyKey,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List tenant expenses for a bounded date range' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListExpensesQueryDto,
  ) {
    return this.expensesService.list(user.tenantId!, query);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one tenant expense with an audit record' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') expenseId: string,
  ) {
    return this.expensesService.remove(user.tenantId!, user.userId, expenseId);
  }
}
