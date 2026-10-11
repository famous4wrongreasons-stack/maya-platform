import { PickType } from '@nestjs/swagger';
import { StartOauthLoginDto } from './start-oauth-login.dto';

// The current authenticated tenant owns the link. No caller-selected tenant,
// user, Client, phone or provider identity is accepted by this entry.
export class StartOauthLinkDto extends PickType(StartOauthLoginDto, [
  'platform',
  'redirectUri',
] as const) {}
