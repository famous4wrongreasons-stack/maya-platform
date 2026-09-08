import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { TEAM_CHUNK_BYTES } from '../package5-wave4/package5-team-object-store';
import { teamObject, type TeamOperation } from './team-communications.contract';
import { TeamCommunicationsService } from './team-communications.service';
@Controller('team-communications')
@TenantScoped()
@Roles(UserRole.TENANT_OWNER,UserRole.BUSINESS_OWNER,UserRole.TENANT_ADMIN,UserRole.ADMINISTRATOR,UserRole.STAFF)
export class TeamCommunicationsController{
  constructor(private readonly owner:TeamCommunicationsService){}
  @Get('messages')feed(@CurrentUser()a:AuthenticatedUser,@Query('before')before?:string){return this.owner.feed(a.tenantId!,a.userId,before);}
  @Post('commands/:operation')act(@CurrentUser()a:AuthenticatedUser,@Param('operation')operation:string,@Body()value:unknown,@Headers('idempotency-key')key:string|undefined){if(!['send','withdraw','reserve','finalize'].includes(operation))throw new BadRequestException('Explicit team command required');return this.owner.act(a.tenantId!,a.userId,operation as TeamOperation,value,key);}
  @Post('attachments/:id/chunks/:index')chunk(@CurrentUser()a:AuthenticatedUser,@Param('id')id:string,@Param('index')index:string,@Body()value:unknown){
    const x=teamObject(value,['base64']);if(!/^(0|[1-9][0-9]{0,3})$/.test(index)||typeof x.base64!=='string'||x.base64.length>Math.ceil(TEAM_CHUNK_BYTES/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(x.base64))throw new BadRequestException('Bounded canonical upload chunk required');
    const bytes=Buffer.from(x.base64,'base64');if(bytes.toString('base64')!==x.base64)throw new BadRequestException('Canonical base64 chunk required');return this.owner.chunk(a.tenantId!,a.userId,id,Number(index),bytes);
  }
  @Get('attachments/:id')async media(@CurrentUser()a:AuthenticatedUser,@Param('id')id:string,@Res({passthrough:true})response:Response){const media=await this.owner.media(a.tenantId!,a.userId,id);response.setHeader('Cache-Control','private, no-store');response.setHeader('X-Content-Type-Options','nosniff');return new StreamableFile(media.stream,{type:'application/octet-stream',length:media.size,disposition:`attachment; filename*=UTF-8''${encodeURIComponent(media.filename)}`});}
}
