import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { CashDeclarationService } from './cash-declaration.service';
@Controller('cash-declarations')
@TenantScoped()
@Roles(UserRole.TENANT_OWNER,UserRole.BUSINESS_OWNER,UserRole.ACCOUNTANT)
export class CashDeclarationController {
 constructor(private readonly owner:CashDeclarationService) {}
 @Get('branches') branches(@CurrentUser() actor:AuthenticatedUser){return this.owner.branches(actor.tenantId!,actor.userId);}
 @Get() read(@CurrentUser() actor:AuthenticatedUser,@Query('branchId') branchId:string,@Query('businessDay') day:string){return this.owner.read(actor.tenantId!,actor.userId,branchId,day);}
 @Post('declare') declare(@CurrentUser() actor:AuthenticatedUser,@Body() command:unknown,@Headers('idempotency-key') key:string|undefined){return this.owner.submit(actor.tenantId!,actor.userId,'declare',command,key);}
 @Post('correct') correct(@CurrentUser() actor:AuthenticatedUser,@Body() command:unknown,@Headers('idempotency-key') key:string|undefined){return this.owner.submit(actor.tenantId!,actor.userId,'correct',command,key);}
}
