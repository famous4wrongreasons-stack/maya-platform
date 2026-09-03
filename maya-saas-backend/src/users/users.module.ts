import { Module } from '@nestjs/common';

import { Package5Wave2Module } from '../package5-wave2/package5-wave2.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [Package5Wave2Module],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
