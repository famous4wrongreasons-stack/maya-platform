import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    const fullUser = user.tenantId
      ? await this.usersService.getTenantUserOrThrow(user.userId, user.tenantId)
      : await this.usersService.getUserOrThrow(user.userId);
    return this.usersService.serializeUser(fullUser);
  }

  @Patch()
  @ApiOperation({
    summary:
      'Update the current authenticated user profile, including initial phone completion for social logins.',
  })
  updateCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCurrentUserDto,
  ) {
    return this.usersService.updateCurrentUserProfile(
      user.userId,
      dto,
      user.tenantId,
    );
  }
}
