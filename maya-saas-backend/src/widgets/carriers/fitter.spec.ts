// K6's exit: every withheld intent and every reduction names something actually emitted, the escape
// verb survives every tier, and a degraded envelope keeps its undegraded original under one id.

import fs from 'node:fs';

import { PROFILES, profileFor } from './channel-profile';
import { FitterRefusal, fit, type FitIntent } from './fitter';

const ESCAPE: FitIntent = {
  token: 'tok-escape',
  label: 'Отмена',
  role: 'escape',
  isEscape: true,
};
const intent = (n: number): FitIntent => ({
  token: `tok-${n}`,
  label: `action ${n}`,
  role: 'primary',
  isEscape: false,
});

describe('K6 — channel profiles', () => {
  it('covers the five carriers plus voice', () => {
    expect(Object.keys(PROFILES).sort()).toEqual(
      [
        'email',
        'pwa',
        'realtime-voice',
        'sms',
        'telegram-bot',
        'web-push',
      ].sort(),
    );
  });

  it('is monotone-reductive IN THE DIRECTION THAT MATTERS: a fit never gains capacity', () => {
    // A first version of this test asserted maxIntents was monotone across TIER_ORDER, and it
    // failed — correctly. ANNOUNCEMENT carries 2 and SPOKEN carries 3, because a push notification
    // and a voice turn are different MODALITIES, not two rungs of one ladder: three spoken options
    // is what a person can hold in working memory, and two is what a notification has room to
    // draw. The tier order is a declaration order, not a capacity order, and asserting otherwise
    // was asserting something false.
    //
    // What monotone reduction actually means is that FITTING never produces more than the carrier
    // allows — which is the property a person is protected by.
    for (const p of Object.values(PROFILES)) {
      const intents = [
        ESCAPE,
        ...Array.from({ length: 20 }, (_, i) => intent(i)),
      ];
      const r = fit({
        carrier: p.carrier,
        intents,
        bodyText: 'x',
        reachableVia: 'fs.report',
      });
      expect(r.emitted.length).toBeLessThanOrEqual(Math.max(p.maxIntents, 1));
      expect(r.tier).toBe(p.tier);
    }
  });

  it('puts TEXT_ONLY at the floor: no carrier there presents an actionable intent', () => {
    for (const p of Object.values(PROFILES))
      if (p.tier === 'TEXT_ONLY') expect(p.maxIntents).toBe(0);
  });

  it('requires an escape verb on every tier, with no exceptions', () => {
    for (const p of Object.values(PROFILES))
      expect(p.escapeRequired).toBe(true);
  });

  it('gives SMS zero intents: an i-class link renders a confirmation and never fires', () => {
    expect(PROFILES.sms.maxIntents).toBe(0);
    expect(PROFILES.email.maxIntents).toBe(0);
  });

  it('fails closed on a carrier it has no profile for', () => {
    expect(profileFor('carrier-pigeon')).toBeNull();
    expect(() =>
      fit({
        carrier: 'carrier-pigeon',
        intents: [ESCAPE],
        bodyText: 'x',
        reachableVia: 'fs.report',
      }),
    ).toThrow(FitterRefusal);
  });
});

describe('K6 — the fitter leaves a way back, or refuses', () => {
  it('withholds beyond capacity and names a reachable_via that IS emitted', () => {
    const intents = [
      ESCAPE,
      ...Array.from({ length: 10 }, (_, i) => intent(i)),
    ];
    const r = fit({
      carrier: 'telegram-bot',
      intents,
      bodyText: 'hello',
      reachableVia: 'fs.report',
    });
    expect(r.emitted.length).toBeLessThanOrEqual(
      PROFILES['telegram-bot'].maxIntents,
    );
    expect(r.intentsWithheld.length).toBeGreaterThan(0);
    for (const w of r.intentsWithheld) expect(w.reachableVia).toBe('fs.report');
  });

  it('REFUSES rather than emitting when the way back is not present', () => {
    // The property §4.5.5 states. A fitter that dropped an affordance with no route back can
    // strand someone, and a person stranded on a small screen has no recourse the software offers.
    const intents = [
      ESCAPE,
      ...Array.from({ length: 10 }, (_, i) => intent(i)),
    ];
    expect(() =>
      fit({
        carrier: 'telegram-bot',
        intents,
        bodyText: 'x',
        reachableVia: '',
      }),
    ).toThrow(/needs a way back/);
  });

  it('never withholds the escape verb, even where capacity is zero', () => {
    const r = fit({
      carrier: 'sms',
      intents: [ESCAPE, intent(1), intent(2)],
      bodyText: 'x',
      reachableVia: 'fs.report',
    });
    expect(r.emitted.map((i) => i.role)).toContain('escape');
    expect(r.intentsWithheld.every((w) => w.role !== 'escape')).toBe(true);
  });

  it('reduces a body rather than truncating it silently, and says how to restore it', () => {
    const long = 'x'.repeat(10_000);
    const r = fit({
      carrier: 'web-push',
      intents: [ESCAPE],
      bodyText: long,
      reachableVia: 'fs.report',
    });
    expect(r.bodyReductions).toHaveLength(1);
    expect(r.bodyReductions[0]?.restoredBy).toBe('fs.report');
    expect(Buffer.byteLength(r.textEquivalent, 'utf8')).toBeLessThanOrEqual(
      PROFILES['web-push'].maxBodyBytes,
    );
  });

  it('marks the text equivalent canonical exactly where the text IS the widget', () => {
    const args = {
      intents: [ESCAPE],
      bodyText: 'short',
      reachableVia: 'fs.report',
    };
    expect(fit({ ...args, carrier: 'sms' }).textEquivalentIsCanonical).toBe(
      true,
    );
    expect(
      fit({ ...args, carrier: 'realtime-voice' }).textEquivalentIsCanonical,
    ).toBe(true);
    expect(fit({ ...args, carrier: 'pwa' }).textEquivalentIsCanonical).toBe(
      false,
    );
  });

  it('records what was minted as well as what was emitted', () => {
    // A receipt that recorded only what survived could not answer "what did this person not see?",
    // which is the only question the receipt exists to answer.
    const intents = [ESCAPE, ...Array.from({ length: 5 }, (_, i) => intent(i))];
    const r = fit({
      carrier: 'realtime-voice',
      intents,
      bodyText: 'x',
      reachableVia: 'fs.report',
    });
    expect(r.intentsMinted).toBe(6);
    expect(r.emitted.length + r.intentsWithheld.length).toBe(r.intentsMinted);
  });
});

describe('K6 — it does not re-implement K3 or K4', () => {
  it('the fitter takes no principal, no floor and no token secret', () => {
    // A fitter that could see a floor could apply one, and then two components would answer "may
    // this happen" — the failure this package is most at risk of.
    const src = fs.readFileSync(`${__dirname}/fitter.ts`, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const forbidden of [
      'verificationFloor',
      'subjectFloorFor',
      'principalProofHash',
      'FLOOR_EXEMPT',
    ])
      expect(code).not.toContain(forbidden);
  });
});
