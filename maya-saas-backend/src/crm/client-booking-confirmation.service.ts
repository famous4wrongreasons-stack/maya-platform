import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

export const BOOKING_CONFIRMATION_NAMESPACE =
  'maya.chat-confirmation/1:crm.appointment.create.v1';
const EVENT_KIND = 'client_booking_confirmation.v1';
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Ordered UTF-8 byte-length prefixes: no model arguments enter the identity. */
export function confirmationTuple(parts: string[]): string {
  return parts
    .map((part) => `${Buffer.byteLength(part, 'utf8')}:${part}`)
    .join('');
}
export function bookingConfirmationKey(receipt: {
  id: string;
  tenantId: string;
  clientId: string;
  actionNamespace: string;
}): string {
  if (
    receipt.actionNamespace !== BOOKING_CONFIRMATION_NAMESPACE ||
    !UUID.test(receipt.id)
  )
    throw new ForbiddenException('Unsupported booking confirmation');
  return (
    'chat-confirmation:v1:' +
    createHash('sha256')
      .update(
        confirmationTuple([
          receipt.actionNamespace,
          receipt.tenantId,
          receipt.clientId,
          receipt.id,
        ]),
        'utf8',
      )
      .digest('hex')
  );
}

export type ConfirmationAuthority = {
  tenantId: string;
  clientId: string;
  linkId: string;
  resolutionEvidenceHash: string;
};
export type ConfirmationResolver = (
  proof: string,
  tx: Prisma.TransactionClient,
) => Promise<ConfirmationAuthority>;

/** Source receipt only. Existing B31/Action Engine still own all booking effects. */
export class ClientBookingConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly resolve: ConfirmationResolver,
  ) {}

  private envelope(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('Durable booking confirmation required');
    const input = value as Record<string, unknown>;
    if (
      Object.keys(input).sort().join(',') !==
        'id,kind,sourceContext,sourceStatement' ||
      typeof input.id !== 'string' ||
      !UUID.test(input.id) ||
      input.kind !== EVENT_KIND
    )
      throw new BadRequestException('Invalid booking confirmation event');
    const normalized = (v: unknown, max: number) => {
      if (typeof v !== 'string' || !v.trim() || v.length > max)
        throw new BadRequestException('Original confirmation source required');
      return v.normalize('NFC').replace(/\r\n?/g, '\n').trim();
    };
    return {
      id: input.id,
      kind: EVENT_KIND,
      sourceStatement: normalized(input.sourceStatement, 2000),
      sourceContext: normalized(input.sourceContext, 12000),
    };
  }

  async accept(proof: string, value: unknown) {
    const event = this.envelope(value);
    return this.prisma.$transaction(async (tx) => {
      // Global event lock precedes channel resolution; different scopes cannot
      // race to accept two identities for the same source occurrence.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`b33:${event.id}`}, 0))`;
      const authority = await this.resolve(proof, tx);
      const evidence = {
        contract: EVENT_KIND,
        confirmationId: event.id,
        tenantId: authority.tenantId,
        clientId: authority.clientId,
        clientChannelLinkId: authority.linkId,
        bindingEvidenceHash: authority.resolutionEvidenceHash,
        sourceHash: this.encryption.opaqueReference(
          EVENT_KIND + ':source',
          confirmationTuple([
            event.kind,
            event.sourceStatement,
            event.sourceContext,
          ]),
        ),
      };
      const evidenceHash = this.encryption.opaqueReference(
        EVENT_KIND + ':evidence',
        confirmationTuple([
          evidence.contract,
          evidence.confirmationId,
          evidence.tenantId,
          evidence.clientId,
          evidence.clientChannelLinkId,
          evidence.bindingEvidenceHash,
          evidence.sourceHash,
        ]),
      );
      const existing = await tx.clientBookingConfirmation.findUnique({
        where: { id: event.id },
      });
      if (existing) {
        if (
          existing.tenantId !== authority.tenantId ||
          existing.clientId !== authority.clientId ||
          existing.clientChannelLinkId !== authority.linkId ||
          existing.actionNamespace !== BOOKING_CONFIRMATION_NAMESPACE ||
          existing.confirmationEvidenceHash !== evidenceHash
        )
          throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return {
          confirmationId: existing.id,
          idempotencyKey: bookingConfirmationKey(existing),
        };
      }
      const receipt = await tx.clientBookingConfirmation.create({
        data: {
          id: event.id,
          tenantId: authority.tenantId,
          clientId: authority.clientId,
          clientChannelLinkId: authority.linkId,
          actionNamespace: BOOKING_CONFIRMATION_NAMESPACE,
          confirmationEvidenceJson: evidence,
          confirmationEvidenceHash: evidenceHash,
        },
      });
      return {
        confirmationId: receipt.id,
        idempotencyKey: bookingConfirmationKey(receipt),
      };
    });
  }

  async resolveKey(proof: string, confirmationId: string) {
    if (!UUID.test(confirmationId))
      throw new BadRequestException('Durable booking confirmation required');
    return this.prisma.$transaction(async (tx) => {
      const authority = await this.resolve(proof, tx);
      const receipt = await tx.clientBookingConfirmation.findUnique({
        where: { id: confirmationId },
      });
      if (
        !receipt ||
        receipt.tenantId !== authority.tenantId ||
        receipt.clientId !== authority.clientId ||
        receipt.clientChannelLinkId !== authority.linkId
      )
        throw new ForbiddenException('Verified booking confirmation required');
      return bookingConfirmationKey(receipt);
    });
  }
}
