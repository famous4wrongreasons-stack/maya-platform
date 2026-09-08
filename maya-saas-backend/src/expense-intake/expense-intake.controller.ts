import { Body,Controller,Get,Headers,Post,Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { ExpenseIntakeSourceService } from './expense-intake-source.service';
import { ExpenseIntakeService } from './expense-intake.service';
@Controller('internal/expense-intake/source')
export class ExpenseIntakeSourceController{
 constructor(private readonly source:ExpenseIntakeSourceService){}
 @Public() @Post() capsule(@Headers('x-maya-legacy-bridge') secret:string|undefined,@Body() body:unknown){return this.source.capsule(secret,body);}
}
@TenantScoped() @Controller('expense-intake')
export class ExpenseIntakeController{
 constructor(private readonly source:ExpenseIntakeSourceService,private readonly intake:ExpenseIntakeService){}
 @Post('admit') async admit(@CurrentUser() user:AuthenticatedUser,@Body() body:{capsule?:unknown;sourceText?:unknown}){return this.intake.admit(await this.source.verify(user,body?.capsule,body?.sourceText));}
 @Get('report-period') report(@CurrentUser() user:AuthenticatedUser,@Query('day') day:string){return this.intake.reportPeriod(user,day);}
 @Get('contexts') contexts(@CurrentUser() user:AuthenticatedUser){return this.intake.ownContexts(user);}
}
