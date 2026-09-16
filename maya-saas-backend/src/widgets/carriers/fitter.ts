// K6 — the fitter, and the render receipt that makes its choices reviewable.
//
// §4.5.5 states the property that makes this safe: every withheld intent must name a `reachable_via`
// that is PRESENT IN THE EMITTED ENVELOPE, and every body reduction a `restored_by` — "or the fitter
// throws rather than emitting". A fitter that could drop an affordance without leaving a way back
// is a fitter that can strand someone, and a person stranded on a small screen has no recourse the
// software can offer.
//
// This file decides what fits. It does not decide what is allowed — K4 owns that, and is not
// consulted here, because a fitter that could raise or lower a floor would be a second authority.

import { type ChannelProfile, profileFor } from './channel-profile';

export interface FitIntent {
  readonly token: string;
  readonly label: string;
  readonly role: string;
  /** Escape verbs are never withheld: §4 requires one on every tier. */
  readonly isEscape: boolean;
}

export interface WithheldIntent {
  readonly role: string;
  readonly reason:
    | 'capacity'
    | 'carrier_limit'
    | 'verification_floor'
    | 'bridge_absent'
    | 'policy'
    | 'secure_surface_only';
  /** REQUIRED. An emitted intent token or route key through which the withheld one is still reachable. */
  readonly reachableVia: string;
}

export interface BodyReduction {
  readonly path: string;
  readonly reduction: 'summarised' | 'paginated' | 'masked' | 'omitted';
  /** REQUIRED, for the same reason: a reduction with no way back is a loss, not a reduction. */
  readonly restoredBy: string;
}

export interface FitResult {
  readonly profileId: string;
  readonly tier: ChannelProfile['tier'];
  readonly emitted: readonly FitIntent[];
  readonly intentsMinted: number;
  readonly intentsWithheld: readonly WithheldIntent[];
  readonly bodyReductions: readonly BodyReduction[];
  readonly textEquivalent: string;
  readonly textEquivalentIsCanonical: boolean;
}

export class FitterRefusal extends Error {}

/**
 * Fit an envelope to a carrier.
 *
 * Throws rather than emitting when it cannot leave a way back. That is deliberate and is the
 * contract's own instruction: an envelope that silently loses an affordance is worse than one that
 * fails to send, because the failure is visible and the loss is not.
 */
export const fit = (args: {
  carrier: string;
  intents: readonly FitIntent[];
  bodyText: string;
  /** A route key the whole widget remains reachable through — the fallback every withholding uses. */
  reachableVia: string;
}): FitResult => {
  const profile = profileFor(args.carrier);
  if (!profile)
    throw new FitterRefusal(`no channel profile for ${args.carrier}`);
  if (!args.reachableVia)
    throw new FitterRefusal(
      'refusing to fit without a reachable_via: a withheld intent needs a way back',
    );

  // The escape verb is placed first and never counted against capacity. A carrier that could push
  // the escape out of the list would be a carrier that can trap someone.
  const escapes = args.intents.filter((i) => i.isEscape);
  const rest = args.intents.filter((i) => !i.isEscape);

  const room = Math.max(0, profile.maxIntents - escapes.length);
  const kept = rest.slice(0, room);
  const dropped = rest.slice(room);

  const intentsWithheld: WithheldIntent[] = dropped.map((i) => ({
    role: i.role,
    reason: profile.maxIntents === 0 ? 'carrier_limit' : 'capacity',
    reachableVia: args.reachableVia,
  }));

  // Body reduction, never silent truncation. §3.9 Gate 8 says oversize is refused rather than cut;
  // on the emission side the equivalent is a DECLARED reduction that names how to get the rest.
  const bodyReductions: BodyReduction[] = [];
  let text = args.bodyText;
  if (Buffer.byteLength(text, 'utf8') > profile.maxBodyBytes) {
    text = Buffer.from(text, 'utf8')
      .subarray(0, profile.maxBodyBytes - 1)
      .toString('utf8');
    bodyReductions.push({
      path: '/body',
      reduction: 'summarised',
      restoredBy: args.reachableVia,
    });
  }

  const emitted = [...escapes, ...kept];

  // §4.5.5's guarantee, enforced: everything named must actually be present. Checked HERE, at the
  // moment of emission, because checking it later means checking something already sent.
  const reachable = new Set<string>([
    args.reachableVia,
    ...emitted.map((i) => i.token),
  ]);
  for (const w of intentsWithheld)
    if (!reachable.has(w.reachableVia))
      throw new FitterRefusal(
        `withheld ${w.role} names reachable_via ${w.reachableVia}, which is not emitted`,
      );
  for (const r of bodyReductions)
    if (!reachable.has(r.restoredBy))
      throw new FitterRefusal(
        `reduction at ${r.path} names restored_by ${r.restoredBy}, which is not emitted`,
      );

  if (profile.escapeRequired && escapes.length === 0 && emitted.length > 0)
    throw new FitterRefusal(
      `${profile.carrier} requires an escape verb and none was supplied`,
    );

  return {
    profileId: profile.profileId,
    tier: profile.tier,
    emitted,
    intentsMinted: args.intents.length,
    intentsWithheld,
    bodyReductions,
    textEquivalent: text,
    // On a text-only tier the text IS the widget, which §4 marks explicitly so a reader knows the
    // structured body was not merely omitted from a richer rendering.
    textEquivalentIsCanonical:
      profile.tier === 'TEXT_ONLY' || profile.tier === 'SPOKEN',
  };
};
