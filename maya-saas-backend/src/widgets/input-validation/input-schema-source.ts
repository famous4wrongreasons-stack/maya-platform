import { Injectable } from '@nestjs/common';

import type { PrismaService } from '../../prisma/prisma.service';
import type { IntentRecordRow } from '../gate.types';
import { digestEquals, sha256Hex } from '../token.util';
import { scoped } from '../stores/tenant-scope';

export type InputSchemaSourceClient = Pick<
  PrismaService,
  'widgetRenderReceipt'
>;

export type InputSchemaSourceResult =
  | {
      readonly status: 'available';
      readonly schema: unknown;
      readonly selectionDomainLabelsJson: unknown;
    }
  | { readonly status: 'unavailable' };

export interface InputSchemaSourcePort {
  read(
    record: IntentRecordRow,
    client: InputSchemaSourceClient,
  ): Promise<InputSchemaSourceResult>;
}

export class InputSchemaSourceIntegrityError extends Error {
  constructor(reason: string) {
    super(`gate 8 schema source integrity fault: ${reason}`);
    this.name = 'InputSchemaSourceIntegrityError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The only Gate 8 schema source: the exact emitted intent inside the render receipt for this token.
 * It reads through the request transaction and returns no envelope, token or unrelated intent.
 */
@Injectable()
export class InputSchemaSourceReader implements InputSchemaSourcePort {
  async read(
    record: IntentRecordRow,
    client: InputSchemaSourceClient,
  ): Promise<InputSchemaSourceResult> {
    const receipt = await client.widgetRenderReceipt.findFirst({
      where: scoped(record.tenantId, {
        widgetId: record.widgetId,
        deliveryChannel: record.deliveryChannel,
      }),
      select: {
        emittedEnvelopeJson: true,
        erasedAt: true,
        emission: {
          select: {
            intentRecords: {
              where: { intentTokenHash: record.intentTokenHash },
              select: { selectionDomainLabelsJson: true },
              take: 1,
            },
          },
        },
      },
    });
    if (
      !receipt ||
      receipt.erasedAt !== null ||
      !isRecord(receipt.emittedEnvelopeJson)
    )
      return { status: 'unavailable' };

    const intents = receipt.emittedEnvelopeJson.intents;
    if (!Array.isArray(intents)) return { status: 'unavailable' };
    const matches = intents.filter((intent) => {
      if (!isRecord(intent) || typeof intent.intent_token !== 'string')
        return false;
      return digestEquals(
        sha256Hex(intent.intent_token),
        record.intentTokenHash,
      );
    });
    if (matches.length === 0) return { status: 'unavailable' };
    if (matches.length !== 1)
      throw new InputSchemaSourceIntegrityError(
        'the emitted envelope contains the same token more than once',
      );
    const schema = (matches[0] as Record<string, unknown>).input_schema;
    if (schema === null || schema === undefined)
      return { status: 'unavailable' };
    const linked = receipt.emission?.intentRecords ?? [];
    if (linked.length !== 1)
      throw new InputSchemaSourceIntegrityError(
        'the exact intent record is not uniquely linked to the receipt',
      );
    return {
      status: 'available',
      schema,
      selectionDomainLabelsJson: linked[0].selectionDomainLabelsJson,
    };
  }
}
