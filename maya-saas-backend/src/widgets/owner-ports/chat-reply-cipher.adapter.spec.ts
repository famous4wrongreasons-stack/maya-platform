import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../encryption/encryption.service';
import { ChatReplyCipherAdapter } from './chat-reply-cipher.adapter';
import {
  decodeChatCompletion,
  encodeChatReply,
  chatReplyId,
} from '../stores/chat-reply-codec';

const owner = () =>
  new EncryptionService(
    new ConfigService({
      CRM_ENCRYPTION_KEY: 'synthetic-chat-cipher-test-key-only',
    }),
  );

describe('existing encrypted conversation owner behind D-6', () => {
  it('reads pre-port encrypted replies, including their semantic context and correlation', () => {
    const encryption = owner();
    const old = {
      text: 'Synthetic reply',
      completionHash: 'a'.repeat(64),
      parentId: 'prior-turn',
      semanticContext: { version: 'maya.chat-semantic-context/1' },
    };
    const ciphertext =
      'maya.chat-reply/1:' + encryption.encrypt(JSON.stringify(old));
    expect(
      decodeChatCompletion(new ChatReplyCipherAdapter(encryption), ciphertext),
    ).toEqual(old);
  });

  it('writes through the same owner and codec without a new key or ciphertext format', () => {
    const encryption = owner();
    const cipher = new ChatReplyCipherAdapter(encryption);
    const encoded = encodeChatReply(
      cipher,
      'Synthetic reply',
      'b'.repeat(64),
      'turn',
    );
    expect(
      JSON.parse(
        encryption.decrypt(encoded.slice('maya.chat-reply/1:'.length)),
      ),
    ).toEqual({
      text: 'Synthetic reply',
      completionHash: 'b'.repeat(64),
      parentId: 'turn',
    });
    expect(encoded).not.toContain('Synthetic reply');
    expect(() => decodeChatCompletion(cipher, encoded + 'tampered')).toThrow();
  });

  it('keeps the stored reply identity stable across the canonical serializer change', () => {
    expect(chatReplyId('tenant', 'parent:completion')).toBe(
      'e5eb66be-ebe5-4cb6-ac65-976e7246c3ba',
    );
  });
});
