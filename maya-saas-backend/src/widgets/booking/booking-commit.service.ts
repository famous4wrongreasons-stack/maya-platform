// K7 — the booking commit path, and the guard that makes a COMMIT impossible outside a confirmation.
//
// The canonical flow, end to end:
//
//   MAYA CHAT → SERVICE_SELECTOR → STAFF_SELECTOR → TIME_SLOT_SELECTOR → BOOKING_CONFIRMATION
//             → TYPED INTENT → CANONICAL BOOKING OWNER → ACTION ENGINE → RECEIPT
//
// Every arrow but the last two is a REFINE: a selector narrows a draft and mints no COMMIT. The
// draft lives on the server the whole way, so the client never carries the booking it is assembling
// and cannot alter it in transit. Only the confirmation step mints a COMMIT, and only against the
// draft it displayed.
//
// The widget layer makes NO provider call. A booking write goes to the Action Engine, which calls
// the canonical booking owner, which is the only thing that touches YClients. Two hops, and the
// reason for each: the Action Engine owns the policy decision, and the owner owns the provider.

import { Injectable, Logger } from '@nestjs/common';

import { WidgetStoresService } from '../stores/widget-stores.service';
import {
  AE_WIDGET_COMMIT_ALLOWLIST,
  isAllowlisted,
  rowFor,
} from './booking-allowlist';

export type BookingStage = 'service' | 'staff' | 'slot' | 'confirm';

export interface BookingDraft {
  readonly draftRef: string;
  readonly serviceId: string | null;
  readonly staffId: string | null;
  readonly slotStartsAt: string | null;
  /** Set only at the confirmation step, and only by the server. */
  readonly confirmed: boolean;
}

export class CommitRefused extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class BookingCommitService {
  private readonly log = new Logger(BookingCommitService.name);

  constructor(private readonly stores: WidgetStoresService) {}

  /**
   * THE GUARD. A COMMIT is admissible only if every one of these holds, and each is checked
   * against SERVER state rather than against anything the submission carried.
   *
   * The submission cannot supply the draft, the capability, the confirmation kind or the record it
   * confirms — it names a token, and everything else is looked up. That is what makes "COMMIT
   * outside a confirmation" impossible rather than merely disallowed: there is no field to put one
   * in, and no branch that reaches an owner without passing here.
   */
  assertCommitAdmissible(record: {
    effect: string;
    aeCapability: string | null;
    widgetKind: string;
    confirmationOfKind: string | null;
    confirmationOfRef: string | null;
    producedByIntentTokenHash: string | null;
  }): void {
    if (record.effect !== 'COMMIT') return;

    if (!record.aeCapability)
      throw new CommitRefused(
        'effect_not_admissible',
        'a COMMIT names no capability',
      );

    // 1. The allowlist. Three rows; a fourth does not exist to be matched.
    if (!isAllowlisted(record.aeCapability))
      throw new CommitRefused(
        'effect_not_admissible',
        `${record.aeCapability} is not on the widget COMMIT allowlist`,
      );
    const row = rowFor(record.aeCapability)!;

    // 2. F72's second evaluation point: the confirmation kind is re-read from the live allowlist,
    // so a key whose row was withdrawn between mint and submission refuses HERE rather than
    // committing on a stale decision.
    if (record.widgetKind !== row.confirmationKind)
      throw new CommitRefused(
        'booking_confirmation_required',
        `${record.aeCapability} requires ${row.confirmationKind}, got ${record.widgetKind}`,
      );

    // 3. F74: a COMMIT carries a non-null confirmation_of_ref, and its kind matches the row.
    if (!record.confirmationOfRef)
      throw new CommitRefused(
        'booking_confirmation_required',
        'a COMMIT confirms nothing',
      );
    if (record.confirmationOfKind !== row.confirmationOfKind)
      throw new CommitRefused(
        'booking_confirmation_required',
        `${record.aeCapability} confirms a ${row.confirmationOfKind}, got ${record.confirmationOfKind}`,
      );

    // 4. F74's bypass guard: where the confirmation is NOT a draft, the COMMIT must name the
    // consumed record that produced it. Without this, a cancel could be minted against an
    // appointment the person never saw.
    if (row.confirmationOfKind !== 'draft' && !record.producedByIntentTokenHash)
      throw new CommitRefused(
        'effect_not_admissible',
        'a non-draft COMMIT must name the consumed record that produced it',
      );
  }

  /** Stage transitions. Each mints a REFINE — never a COMMIT — which is why the flow is safe to walk. */
  advance(
    draft: BookingDraft,
    stage: BookingStage,
    value: string,
  ): BookingDraft {
    switch (stage) {
      case 'service':
        return {
          ...draft,
          serviceId: value,
          staffId: null,
          slotStartsAt: null,
          confirmed: false,
        };
      case 'staff':
        return {
          ...draft,
          staffId: value,
          slotStartsAt: null,
          confirmed: false,
        };
      case 'slot':
        return { ...draft, slotStartsAt: value, confirmed: false };
      case 'confirm':
        // Confirmation is refused unless the draft is complete. A confirmation of a half-made
        // booking would be a person agreeing to something nobody could describe.
        if (!draft.serviceId || !draft.staffId || !draft.slotStartsAt)
          throw new CommitRefused(
            'effect_not_admissible',
            'the draft is incomplete',
          );
        return { ...draft, confirmed: true };
      default:
        // No default admission: an unknown stage refuses.
        throw new CommitRefused(
          'effect_not_admissible',
          `unknown stage ${String(stage)}`,
        );
    }
  }

  /**
   * The audit row, and the property that makes it worth writing.
   *
   * §3 requires the rows for «said it», «typed it» and «pressed it» to differ by ZERO BYTES. The
   * only way to guarantee that is for the carrier not to reach this function at all — so it does
   * not take one. A widget tap, a typed sentence and a spoken phrase all arrive here having already
   * been lowered to the same utterance, and what is recorded is the utterance.
   */
  auditRow(args: {
    draftRef: string;
    utterance: string;
    capability: string;
  }): string {
    return JSON.stringify({
      draft_ref: args.draftRef,
      utterance: args.utterance,
      capability: args.capability,
    });
  }

  /** The allowlist's size, exposed so the exit can assert it rather than read it. */
  get allowlistSize(): number {
    return AE_WIDGET_COMMIT_ALLOWLIST.length;
  }

  async persistDraft(args: {
    tenantId: string;
    principalProofHash: string;
    draft: BookingDraft;
  }): Promise<void> {
    await this.stores.putDraft({
      tenantId: args.tenantId,
      draftRef: args.draft.draftRef,
      draftClass: 'task',
      ownerCapabilitySpace: 'C9',
      ownerCapabilityKey: 'c9.booking.propose',
      principalProofHash: args.principalProofHash,
      diff: args.draft,
      ttlSeconds: 900,
    });
    this.log.debug(
      `booking draft ${args.draft.draftRef} persisted server-side`,
    );
  }
}
