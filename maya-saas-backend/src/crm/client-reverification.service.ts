import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { AuthRateLimitRepository } from '../auth/auth-rate-limit.repository';
import { PhoneAuthDeliveryService } from '../auth/phone-auth-delivery.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ClientChannelLinkService } from './client-channel-link.service';
import { ClientLinkChallengeService } from './client-link-challenge.service';
import { ClientReverificationCandidateService } from './client-reverification-candidate.service';

@Injectable()
export class ClientReverificationService {
  private readonly challenges: ClientLinkChallengeService;
  constructor(
    prisma: PrismaService,
    context: TenantContextService,
    encryption: EncryptionService,
    candidates: ClientReverificationCandidateService,
    delivery: PhoneAuthDeliveryService,
    limits: AuthRateLimitRepository,
  ) {
    const closed = () =>
      Promise.reject(new ForbiddenException('V2 OTP coordinator required'));
    const links = new ClientChannelLinkService(prisma, context, {
      verifyLink: closed,
      verifyRevocation: closed,
    });
    this.challenges = new ClientLinkChallengeService(
      prisma,
      context,
      encryption,
      links,
      { resolverId: 'disabled', resolve: closed },
      { authenticate: closed },
      { candidates, delivery, limits },
    );
  }
  issue(user: AuthenticatedUser) {
    return this.challenges.issueSuccessor(user);
  }
  consume(user: AuthenticatedUser, request: unknown) {
    return this.challenges.consumeSuccessor(user, request);
  }
}
