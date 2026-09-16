// K3 — the control registry, and its single key.
//
// §3.9 Gate 13: "`CONTROL` → the one registered control handler, which performs its own principal
// and tenant check; no Action Engine edge." Both halves matter. A control does its own checks
// because it is reached by a different route than a capability; and it has NO Action Engine edge
// because a control must never be a way to reach a business effect by another name.
//
// The registry is closed. `control.widget.dismiss` is the only key K3 registers, and a CONTROL
// token naming anything else refuses at Gate 7 — because the key is not here, not because a
// handler decided to say no.

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * The keys a SUBMISSION may name — which is not the same as the CONTROL key space.
 *
 * §0.7 F27 closes the space at three: `control.widget.dismiss`, `control.run.cancel` and
 * `control.delivery.resolve`. Only the first is dispatched here. `control.run.cancel` has its own
 * owner endpoint in the orchestrator and is write-once under a cancel key hash; and
 * `control.delivery.resolve` is exercised by the SCHEDULER on the delivery path, never by an
 * intent token — a person does not ask which channel their reminder goes out on.
 *
 * The difference between the two sets is asserted in `proactive.spec.ts` rather than left as a
 * comment, so a key added to one and forgotten in the other fails a test instead of drifting.
 */
export const CONTROL_KEYS = ['control.widget.dismiss'] as const;
export type ControlKey = (typeof CONTROL_KEYS)[number];

/** Registered in the space, dispatched elsewhere. Named so the gap is explicit, not accidental. */
export const CONTROL_KEYS_DISPATCHED_ELSEWHERE = [
  'control.run.cancel',
  'control.delivery.resolve',
] as const;

export interface ControlOutcome {
  readonly handled: boolean;
  readonly code: 'dismissed' | 'not_found' | 'forbidden' | 'unknown_control';
}

@Injectable()
export class ControlRegistryService {
  private readonly log = new Logger(ControlRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  isRegistered(key: string): key is ControlKey {
    return (CONTROL_KEYS as readonly string[]).includes(key);
  }

  /**
   * Dismiss a widget.
   *
   * It is the one control that must exist everywhere, because §4 requires an escape verb on every
   * tier: a person who cannot dismiss what is in front of them is stuck, and a chat-first product
   * that can trap someone is worse than the navigation it replaced.
   *
   * It changes presentation and nothing else. The lifecycle moves to CANCELLED; no capability is
   * called, no business row is touched, and no receipt of a business effect is written — because
   * dismissing a widget is not an effect, it is the absence of one.
   */
  async dismiss(args: {
    tenantId: string;
    widgetId: string;
    principalProofHash: string;
    now?: Date;
  }): Promise<ControlOutcome> {
    const now = args.now ?? new Date();

    // The principal check is the control's own, per Gate 13, and it is in the WHERE clause: a
    // widget belonging to another principal is not found rather than found-and-refused, so a probe
    // cannot use the difference to learn that it exists.
    const target = await this.prisma.widgetEmission.findFirst({
      where: { tenantId: args.tenantId, widgetId: args.widgetId },
      select: {
        id: true,
        lifecycleState: true,
        intentRecords: { select: { principalProofHash: true } },
      },
    });
    if (!target) return { handled: false, code: 'not_found' };

    const owned = target.intentRecords.some(
      (r) => r.principalProofHash === args.principalProofHash,
    );
    if (!owned) return { handled: false, code: 'not_found' };

    // Already-terminal states are left alone: dismissing a consumed or superseded widget is a
    // no-op rather than a state change, so a double tap cannot rewrite history.
    if (
      ['CONSUMED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(
        target.lifecycleState,
      )
    )
      return { handled: true, code: 'dismissed' };

    await this.prisma.widgetEmission.update({
      where: { id: target.id },
      data: {
        lifecycleState: 'CANCELLED',
        deliveryStateJson: {
          state: 'dismissed',
          at: now.toISOString(),
        } as never,
      },
    });
    this.log.debug(`control.widget.dismiss -> ${args.widgetId}`);
    return { handled: true, code: 'dismissed' };
  }
}
