import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  HistorisedWidget,
  TerminalLine,
} from '../../widget-contract/lifecycle';
import type { PrincipalResolver } from '../authority/principal-view';
import { PRINCIPAL_RESOLVER, SEAL_VERIFIER } from '../di-tokens';
import type { SealVerifier } from '../emission/seal-verifier.service';

export interface ThreadPageRequest {
  readonly before?: string;
  readonly limit: number;
}

export interface NavigateEmissionSource {
  readonly conversationId: string;
  readonly turnId: string;
  readonly deliveryChannel: string;
  readonly envelope: Readonly<Record<string, unknown>>;
}

/** P-RESOLVE: one bounded, current-principal-only timeline read. */
@Injectable()
export class WidgetThreadPageService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRINCIPAL_RESOLVER)
    private readonly principals: PrincipalResolver,
    @Inject(SEAL_VERIFIER)
    private readonly seals: SealVerifier,
  ) {}

  async read(request: ThreadPageRequest): Promise<readonly HistorisedWidget[]> {
    return this.prisma.$transaction(async (tx) => {
      const principal = await this.principals.resolve(tx);
      if (principal === null) return [];
      const tenantId = principal.authority.tenantId;
      const cursor =
        request.before === undefined
          ? null
          : await tx.widgetEmission.findFirst({
              where: {
                tenantId,
                widgetId: request.before,
                intentRecords: {
                  some: { principalProofHash: principal.proofHash },
                },
              },
              select: { issuedAt: true },
            });
      // A foreign/non-existent cursor is indistinguishable from an empty page.
      if (request.before !== undefined && cursor === null) return [];

      const rows = await tx.widgetEmission.findMany({
        where: {
          tenantId,
          ...(cursor === null ? {} : { issuedAt: { lt: cursor.issuedAt } }),
          intentRecords: {
            some: { principalProofHash: principal.proofHash },
          },
        },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: request.limit,
        select: {
          terminalLinesJson: true,
          intentRecords: {
            where: { principalProofHash: principal.proofHash },
            orderBy: { issuedAt: 'asc' },
            take: 1,
            select: { intentTokenHash: true },
          },
          renderReceipts: {
            where: { erasedAt: null },
            orderBy: { degradedAt: 'desc' },
            take: 1,
            select: { emittedEnvelopeJson: true },
          },
        },
      });

      const page: HistorisedWidget[] = [];
      for (const row of rows) {
        const tokenHash = row.intentRecords[0]?.intentTokenHash;
        const envelope = row.renderReceipts[0]?.emittedEnvelopeJson;
        if (
          tokenHash === undefined ||
          envelope === null ||
          envelope === undefined
        )
          continue;
        const seal = await this.seals.verify(tokenHash, { tenantId }, tx);
        if (!seal.ok) continue;
        page.push({
          envelope: envelope as unknown as HistorisedWidget['envelope'],
          terminal_lines: terminalLines(row.terminalLinesJson),
          // Fresh reread tokens are owned by the later projector edge.
          reread_intent: null,
        });
      }
      return page;
    });
  }

  /**
   * Contract V1.2's stored-widget resolver.  The caller supplies only the current, server-resolved
   * tenant/proof pair; foreign, revoked, erased or unsealed rows are indistinguishable from absence.
   */
  async resolveForNavigate(input: {
    tenantId: string;
    widgetId: string;
    principalProofHash: string;
  }): Promise<NavigateEmissionSource | null> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.widgetEmission.findFirst({
        where: {
          tenantId: input.tenantId,
          widgetId: input.widgetId,
          erasedAt: null,
          intentRecords: {
            some: { principalProofHash: input.principalProofHash },
          },
        },
        select: {
          turnId: true,
          deliveryChannel: true,
          turn: { select: { conversationId: true } },
          intentRecords: {
            where: { principalProofHash: input.principalProofHash },
            orderBy: { issuedAt: 'asc' },
            take: 1,
            select: { intentTokenHash: true },
          },
          renderReceipts: {
            where: { erasedAt: null },
            orderBy: { degradedAt: 'desc' },
            take: 1,
            select: { emittedEnvelopeJson: true },
          },
        },
      });
      const tokenHash = row?.intentRecords[0]?.intentTokenHash;
      const envelope = row?.renderReceipts[0]?.emittedEnvelopeJson;
      if (row === null || tokenHash === undefined || !isRecord(envelope))
        return null;
      const seal = await this.seals.verify(
        tokenHash,
        { tenantId: input.tenantId },
        tx,
      );
      if (!seal.ok) return null;
      return Object.freeze({
        conversationId: row.turn.conversationId,
        turnId: row.turnId,
        deliveryChannel: row.deliveryChannel,
        envelope: Object.freeze(envelope),
      });
    });
  }
}

const terminalLines = (value: unknown): TerminalLine[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isTerminalLine);
};

const isTerminalLine = (value: unknown): value is TerminalLine =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { outcome?: unknown }).outcome === 'string' &&
  typeof (value as { text?: unknown }).text === 'string' &&
  (((value as { action_receipt_ref?: unknown }).action_receipt_ref ?? null) ===
    null ||
    typeof (value as { action_receipt_ref?: unknown }).action_receipt_ref ===
      'string');

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
