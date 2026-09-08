import { Body, Controller, Post } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { UserRole } from '../common/domain.enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { ConsentSecurityInvalidationService } from './consent-security-invalidation.service';

/** Existing global JWT/session and role guards authenticate the initiator.
 * The A18 owner independently checks current authority and the pinned incident. */
@Controller('internal/security/client-consent-invalidations')
export class ConsentSecurityInvalidationController {
  constructor(private readonly owner: ConsentSecurityInvalidationService) {}

  @Post()
  @Roles(UserRole.PLATFORM_OWNER)
  remediate(@CurrentUser() actor: AuthenticatedUser, @Body() value: unknown) {
    return this.owner.remediate(actor, value);
  }
}
