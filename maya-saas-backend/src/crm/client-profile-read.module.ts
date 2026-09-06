import { Module } from '@nestjs/common';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { ClientProfileReadService } from './client-profile-read.service';

/** Independent of UsersModule: profile reads cannot infer identity via User helpers. */
@Module({
  providers: [ClientChannelAuthenticatorService, ClientProfileReadService],
  exports: [ClientProfileReadService],
})
export class ClientProfileReadModule {}
