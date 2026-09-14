import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  giftCertificatePresentation,
  giftCertificatePresentationConfig,
} from './gift-certificate-claim.contract';

export type GiftCertificatePresentationOutcome =
  | {
      outcome: 'presented';
      bearer: string;
      presentationReference: string;
      writesPerformed: false;
    }
  | {
      outcome: 'presentation_unavailable' | 'certificate_unresolved';
      bearer: null;
      presentationReference: null;
      writesPerformed: false;
    };

/** Trusted presentation boundary. The returned bearer is never made durable. */
@Injectable()
export class GiftCertificatePresentationService {
  constructor(private readonly prisma: PrismaService) {}

  async present(input: {
    tenantId: string;
    certificateId: string;
  }): Promise<GiftCertificatePresentationOutcome> {
    const config = giftCertificatePresentationConfig();
    if (!config) return this.unavailable('presentation_unavailable');
    const certificate = await this.prisma.giftCertificate.findUnique({
      where: {
        id_tenantId: { id: input.certificateId, tenantId: input.tenantId },
      },
      select: {
        id: true,
        tenantId: true,
        issueExecutionId: true,
        issuanceIdentityHash: true,
        nominalAmountKopecks: true,
        currency: true,
        expiresAt: true,
        codeHash: true,
        presentationKeyVersion: true,
        paymentStatus: true,
        canceledAt: true,
      },
    });
    if (
      !certificate ||
      !certificate.issueExecutionId ||
      !certificate.presentationKeyVersion ||
      certificate.paymentStatus !== 'paid' ||
      certificate.canceledAt
    ) {
      return this.unavailable('certificate_unresolved');
    }
    const presentationKey = config.presentationKeys.get(
      certificate.presentationKeyVersion,
    );
    if (!presentationKey) {
      return this.unavailable('presentation_unavailable');
    }
    const material = giftCertificatePresentation(
      {
        tenantId: certificate.tenantId,
        certificateId: certificate.id,
        issuanceIdentityHash: certificate.issuanceIdentityHash,
        activationExecutionId: certificate.issueExecutionId,
        nominalAmountKopecks: certificate.nominalAmountKopecks,
        currency: certificate.currency,
        expiresAt: certificate.expiresAt.toISOString(),
      },
      {
        presentationKey,
        presentationKeyVersion: certificate.presentationKeyVersion,
        lookupKey: config.lookupKey,
      },
    );
    if (material.codeHash !== certificate.codeHash) {
      return this.unavailable('certificate_unresolved');
    }
    return {
      outcome: 'presented',
      bearer: material.bearer,
      presentationReference: material.presentationReference,
      writesPerformed: false,
    };
  }

  private unavailable(
    outcome: 'presentation_unavailable' | 'certificate_unresolved',
  ): GiftCertificatePresentationOutcome {
    return {
      outcome,
      bearer: null,
      presentationReference: null,
      writesPerformed: false,
    };
  }
}
