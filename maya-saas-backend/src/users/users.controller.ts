import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    const fullUser = await this.usersService.getUserOrThrow(user.userId);
    return this.usersService.serializeUser(fullUser);
  }
}
