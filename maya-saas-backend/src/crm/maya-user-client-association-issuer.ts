import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  ClientChallengeIssuerAuthority,
  TrustedClientResolution,
} from './client-link-challenge.service';

/** Retired upstream FK heuristic. Never a verified Client provenance source.
 * Kept fail closed so a stale internal caller cannot recreate that authority.
 */
export class MayaUserClientAssociationIssuer implements ClientChallengeIssuerAuthority {
  readonly resolverId = 'a18.maya-user-client-association.v1';
  resolve(
    proof: string,
    tx: Prisma.TransactionClient,
  ): Promise<TrustedClientResolution> {
    void proof;
    void tx;
    return Promise.reject(
      new ForbiddenException('Trusted verified Client resolution required'),
    );
  }
}
