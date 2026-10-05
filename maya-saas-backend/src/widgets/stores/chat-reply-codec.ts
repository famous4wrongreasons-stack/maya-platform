import { stableActionJson } from '../../action-engine/action-engine.identity';
import type { ChatReplyCipher } from '../owner-ports/chat-reply-cipher.port';
import { sha256Hex } from '../token.util';

// Versioned content encoding inside the existing erasable text column. RT6
// clears that column unchanged; this is not a second transcript or receipt store.
const PREFIX = 'maya.chat-reply/1:';
export const chatReplyId = (tenantId: string, parentId: string): string => {
  const h = sha256Hex(`maya.assistant-reply/1:${tenantId}:${parentId}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const isChatReply = (text: string): boolean => text.startsWith(PREFIX);
export const encodeChatReply = (
  encryption: ChatReplyCipher,
  text: string,
  completionHash: string,
  parentId: string,
  semanticContext?: unknown,
): string =>
  PREFIX +
  encryption.encrypt(
    stableActionJson({ text, completionHash, parentId, semanticContext }),
  );
export const decodeChatCompletion = (
  encryption: ChatReplyCipher | undefined,
  value: string,
): {
  text: string;
  completionHash: string;
  parentId: string;
  semanticContext?: unknown;
} => {
  if (!encryption || !isChatReply(value))
    throw new Error('conversation_codec_unavailable');
  const decoded: unknown = JSON.parse(
    encryption.decrypt(value.slice(PREFIX.length)),
  );
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    !('text' in decoded) ||
    typeof decoded.text !== 'string' ||
    !('completionHash' in decoded) ||
    typeof decoded.completionHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(decoded.completionHash) ||
    !('parentId' in decoded) ||
    typeof decoded.parentId !== 'string'
  )
    throw new Error('conversation_codec_invalid');
  return {
    text: decoded.text,
    completionHash: decoded.completionHash,
    parentId: decoded.parentId,
    semanticContext:
      'semanticContext' in decoded ? decoded.semanticContext : null,
  };
};
export const decodeChatReply = (
  encryption: ChatReplyCipher | undefined,
  text: string,
): string => {
  if (!isChatReply(text)) return text;
  return decodeChatCompletion(encryption, text).text;
};
