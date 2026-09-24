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
