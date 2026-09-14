import { EncryptionService } from '../encryption/encryption.service';
import type { ClientChannelProvider } from './client-channel-link.service';

/** V1 identity does not include session, device, bot or proof versions. */
export function clientChannelSubjectHash(
  encryption: EncryptionService,
  provider: ClientChannelProvider,
  subject: string,
) {
  return encryption.opaqueReference(
    'a18.client-channel.subject.v1',
    JSON.stringify([provider, subject]),
  );
}
