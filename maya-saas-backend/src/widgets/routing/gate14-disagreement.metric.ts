import { Injectable } from '@nestjs/common';

export const GATE14_RERESOLUTION_REASONS = Object.freeze([
  'role_denied',
  'membership_missing',
  'membership_inactive',
  'user_inactive',
  'actor_required',
  'entitlement_denied',
] as const);

export type Gate14ReresolutionReason =
  (typeof GATE14_RERESOLUTION_REASONS)[number];

/** AMB-G6-7: observability only. The Gate 14 answer always remains authoritative. */
@Injectable()
export class Gate14DisagreementMetric {
  private readonly counts = new Map<Gate14ReresolutionReason, number>();

  increment(reason: string): void {
    if (!isGate14ReresolutionReason(reason)) return;
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + 1);
  }

  value(reason?: Gate14ReresolutionReason): number {
    if (reason) return this.counts.get(reason) ?? 0;
    return [...this.counts.values()].reduce((sum, value) => sum + value, 0);
  }
}

export const isGate14ReresolutionReason = (
  value: string,
): value is Gate14ReresolutionReason =>
  (GATE14_RERESOLUTION_REASONS as readonly string[]).includes(value);
