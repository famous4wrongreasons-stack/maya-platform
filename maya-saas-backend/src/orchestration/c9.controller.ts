import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { C9Orchestrator } from './c9.orchestrator';
import { C9Store } from './c9.store';
import { C9WorkService } from './c9.work';
import { C9PolicyService } from './c9.policy.service';
import { c9Id, c9Object, c9String } from './c9.contract';

/**
 * The finite coordination surface. Every route resolves the current authenticated
 * principal again inside its transaction — the request envelope proves the age of a
 * request, never the authority to make it, and no route performs a business effect.
 */
@ApiTags('orchestration')
@ApiBearerAuth()
@TenantScoped()
@Controller('orchestration')
export class C9Controller {
  constructor(
    private readonly orchestrator: C9Orchestrator,
    private readonly store: C9Store,
    private readonly work: C9WorkService,
    private readonly policy: C9PolicyService,
  ) {}

  @Post('request-identity')
  @ApiOperation({
    summary:
      'Issue a purpose-bound expiring C9 request envelope (no authority granted)',
  })
  requestIdentity(@Body() body: unknown) {
    return this.orchestrator.requestIdentity(channelProof(body));
  }

  @Post('runs')
  @ApiOperation({
    summary: 'Admit one bounded coordination request and answer it',
  })
  runs(@Body() body: unknown) {
    const dto = c9Object(body);
    return this.orchestrator.coordinate(
      c9String(4096)(dto.eventToken) as string,
      dto.request,
      channelProof(dto),
    );
  }

  @Post('runs/:id/cancel')
  @ApiOperation({
    summary: 'Cancel a coordination run under current authority',
  })
  cancel(@Param('id') id: string, @Body() body: unknown) {
    const dto = c9Object(body);
    return this.store.cancel(
      c9Id(id) as string,
      c9Id(dto.cancelKey) as string,
      channelProof(dto),
    );
  }

  @Post('runs/:id/continue')
  @ApiOperation({
    summary: 'Resume bound work only; never autonomous replanning or resend',
  })
  continue(@Param('id') id: string, @Body() body: unknown) {
    return this.work.recover(c9Id(id) as string, channelProof(body));
  }

  @Get('tenant-context')
  @ApiOperation({
    summary:
      'Currently confirmed C9 tenant context as its A22 owner reports it',
  })
  tenantContext() {
    return this.policy.current();
  }

  @Post('tenant-context/draft')
  @ApiOperation({
    summary:
      'Validate an extracted proposal into a typed draft and material diff; writes nothing',
  })
  tenantContextDraft(@Body() body: unknown) {
    const dto = c9Object(body);
    return this.policy.draft(dto.proposal, channelProof(dto));
  }

  @Get('runs/:id')
  @ApiOperation({
    summary: 'Permitted minimized coordination state projection',
  })
  run(@Param('id') id: string) {
    return this.store.snapshot(c9Id(id) as string);
  }
}
function channelProof(body: unknown): string | undefined {
  const dto = body && typeof body === 'object' ? c9Object(body) : {};
  return dto.channelProof === undefined || dto.channelProof === null
    ? undefined
    : (c9String(4096)(dto.channelProof) as string);
}
