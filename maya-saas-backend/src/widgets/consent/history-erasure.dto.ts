import { BadRequestException } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Confirmation identity only. Tenant, user, proof and timestamps are never inputs. */
export class HistoryErasureDto {
  @IsString()
  @Matches(UUID)
  requestId!: string;
}

/** Also called by the owner, so direct calls cannot bypass transport validation. */
export const historyErasureInput = (
  conversationId: unknown,
  body: unknown,
): Readonly<{ conversationId: string; requestId: string }> => {
  if (
    typeof conversationId !== 'string' ||
    !UUID.test(conversationId) ||
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, 'requestId')
  )
    throw new BadRequestException('history_erasure_request_invalid');
  const requestId = (body as { requestId: unknown }).requestId;
  if (typeof requestId !== 'string' || !UUID.test(requestId))
    throw new BadRequestException('history_erasure_request_invalid');
  // UUID aliases must bind the same advisory lock and immutable request scope.
  return Object.freeze({
    conversationId: conversationId.toLowerCase(),
    requestId: requestId.toLowerCase(),
  });
};
