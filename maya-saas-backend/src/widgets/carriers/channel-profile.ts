// K6 — channel profiles and the fit.
//
// The rule this package must not break: it owns FITTING, not AUTHORITY. K3 owns the gate pipeline
// and K4 owns the floors, and a second implementation of either here would be the worst possible
// outcome — two answers to "may this happen", diverging quietly. So nothing in this file decides
// whether something is permitted. It decides what a carrier can CARRY, which is a different
// question with a different answer.
//
// §4: `profile_id` is ADVISORY and is never an authority input. Gate 8-R keys on the stored
// record's `requires_readback`, never on the submission's profile. A profile that could raise or
// lower a floor would be a channel deciding its own authority.

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import type { EffectClass } from '../../widget-contract/intent';
import type { ChannelId, RenderTier } from '../../widget-contract/lifecycle';
import {
  CHANNEL_TIER,
  TIER_EFFECTS,
  TIER_ESCAPE,
} from '../../widget-contract/tables';

export type CarrierId =
  'pwa' | 'telegram-bot' | 'web-push' | 'sms' | 'email' | 'realtime-voice';

export interface ChannelProfile {
  readonly profileId: string;
  readonly carrier: CarrierId;
  readonly tier: RenderTier;
  /** How many intents this carrier can present before the fitter must withhold some. */
  readonly maxIntents: number;
  /** Bytes of body text a carrier can carry. Beyond it the body is reduced, never truncated silently. */
  readonly maxBodyBytes: number;
  /** Can the carrier show a structured body at all, or only prose? */
  readonly structured: boolean;
  /** Must an escape verb be present? §4 says yes on every non-RICH tier — so this is never false. */
  readonly escapeRequired: true;
}

/**
 * The five carriers plus voice. Monotone-reductive: each tier can carry no more than the one above
 * it. That ordering is what makes degradation predictable rather than per-carrier folklore.
 *
 * Each profile's `tier` is the generated `CHANNEL_TIER` cell for its channel (§4.5.3), never a second
 * statement of the tier table.
 */
export const PROFILES: Readonly<Record<CarrierId, ChannelProfile>> =
  Object.freeze({
    pwa: {
      profileId: 'pwa/1',
      carrier: 'pwa',
      tier: CHANNEL_TIER.pwa,
      maxIntents: 8,
      maxBodyBytes: 16_384,
      structured: true,
      escapeRequired: true,
    },
    'telegram-bot': {
      profileId: 'telegram-bot/1',
      carrier: 'telegram-bot',
      tier: CHANNEL_TIER['telegram-bot'],
      // Telegram's own inline-keyboard limit is the binding constraint, not a preference.
      maxIntents: 6,
      maxBodyBytes: 4_096,
      structured: true,
      escapeRequired: true,
    },
    'web-push': {
      profileId: 'web-push/1',
      carrier: 'web-push',
      tier: CHANNEL_TIER['web-push'],
      maxIntents: 2,
      maxBodyBytes: 512,
      structured: false,
      escapeRequired: true,
    },
    'realtime-voice': {
      profileId: 'realtime-voice/1',
      carrier: 'realtime-voice',
      tier: CHANNEL_TIER['realtime-voice'],
      // Spoken affordances are held in working memory. More than three is not a smaller screen, it
      // is a person being asked to remember a list.
      maxIntents: 3,
      maxBodyBytes: 1_024,
      structured: false,
      escapeRequired: true,
    },
    sms: {
      profileId: 'sms/1',
      carrier: 'sms',
      tier: CHANNEL_TIER.sms,
      // R3.3.5: an SMS carries an `i`-class link that renders a confirmation and never fires. So it
      // presents no intent at all — zero is the correct number, not a small one.
      maxIntents: 0,
      maxBodyBytes: 320,
      structured: false,
      escapeRequired: true,
    },
    email: {
      profileId: 'email/1',
      carrier: 'email',
      tier: CHANNEL_TIER.email,
      maxIntents: 0,
      maxBodyBytes: 8_192,
      structured: false,
      escapeRequired: true,
    },
  } satisfies Record<CarrierId, ChannelProfile>);

export const profileFor = (carrier: string): ChannelProfile | null =>
  (PROFILES as Record<string, ChannelProfile | undefined>)[carrier] ?? null;

/** Tier order, richest first. Monotone reduction means a fit never moves up this list. */
export const TIER_ORDER: readonly RenderTier[] = [
  'RICH_INTERACTIVE',
  'RICH_CONSTRAINED',
  'ANNOUNCEMENT',
  'SPOKEN',
  'TEXT_ONLY',
  'PUBLIC_READ',
  'ANONYMOUS_CHAT',
];

/**
 * §4.5.3 CH1 and CH2 — may an intent of this effect travel on this channel at all?
 *
 * THE one implementation (GATES-PLAN-V11 D-5, TAB-8). Gate 7's tier clause keys it on the stored
 * record's `delivery_channel`, the fitter's CARRIER CEILING and the minter call the same function, and
 * nothing else reads `TIER_EFFECTS` or `TIER_ESCAPE`. Like the rest of this file it decides what a carrier
 * can CARRY: it only subtracts, and whether a surviving intent may be actuated is the floors' question.
 *   - The channel's tier cell is an allowlist of effect classes, never an ordered ceiling.
 *   - Where the cell does not reach CONTROL, the one F60 escape is admitted as well: effect CONTROL,
 *     capability `control.widget.dismiss`, priority 0 — and no other CONTROL intent.
 *   - A channel outside `ChannelId` admits nothing.
 */
export const carrierAdmits = (
  channel: string,
  effect: EffectClass,
  ref: CapabilityRef | null,
  priority: number,
): boolean => {
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_TIER, channel))
    return false;
  const cell = TIER_EFFECTS[CHANNEL_TIER[channel as ChannelId]];
  if (cell.effects.includes(effect)) return true;
  return (
    cell.escape &&
    effect === TIER_ESCAPE.effect &&
    ref !== null &&
    ref.space === TIER_ESCAPE.space &&
    ref.key === TIER_ESCAPE.key &&
    priority === TIER_ESCAPE.priority
  );
};
