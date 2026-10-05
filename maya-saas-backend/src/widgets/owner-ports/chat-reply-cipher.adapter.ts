import { Injectable } from '@nestjs/common';
import { EncryptionService } from '../../encryption/encryption.service';
import type { ChatReplyCipher } from './chat-reply-cipher.port';

/** Preserve the existing encryption owner, key and ciphertext format behind D-6. */
@Injectable()
export class ChatReplyCipherAdapter implements ChatReplyCipher {
  constructor(private readonly encryption: EncryptionService) {}

  encrypt(plainText: string): string {
    return this.encryption.encrypt(plainText);
  }

  decrypt(cipherText: string): string {
    return this.encryption.decrypt(cipherText);
  }
}
