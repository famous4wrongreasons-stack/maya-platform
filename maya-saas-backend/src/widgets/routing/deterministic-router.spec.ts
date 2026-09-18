// U10a — the router matrix (AREA-B §3.4: escape first; tapped not privileged; normalisation; slotted
// matching; skip erased or malformed candidates; no substring match).
//
// Class U (unit). Never live proof (§0.5): the candidates here are hand-built rows, no gate runs, and
// nothing flips a clause. 10.2's LIVE half is U10b's, over production-minted records; 10.10's duty is
// `r3124-routing-duty.build.spec.ts`, over production-RECORDED emission fixtures. What this spec
// pins is the function's own behaviour, mutant by mutant.

import { renderUtterance } from '../lowering/lowering';
import {
  ESCAPE_VERBS,
  type RoutingCandidate,
  assertRoutingResolves,
  normaliseUtterance,
  routeUtterance,
} from './deterministic-router';

const ISSUED = new Date('2026-09-17T10:00:00.000Z');

let seq = 0;
const candidate = (over: Partial<RoutingCandidate> = {}): RoutingCandidate => ({
  intentTokenHash: `hash-${++seq}`,
  effect: 'NAVIGATE',
  priority: 3,
  capabilitySpace: null,
  capabilityKey: null,
  issuedAt: ISSUED,
  erasedAt: null,
  utteranceTemplate: 'мои записи',
  selectionDomainLabelsJson: null,
  ...over,
});

/** The escape record F60 mints on every non-`RICH_INTERACTIVE` tier: CONTROL, priority 0, dismiss. */
const escapeCandidate = (
  over: Partial<RoutingCandidate> = {},
): RoutingCandidate =>
  candidate({
    effect: 'CONTROL',
    priority: 0,
    capabilitySpace: 'CONTROL',
    capabilityKey: 'control.widget.dismiss',
    utteranceTemplate: 'закрыть карточку',
    ...over,
  });

/** A slotted record: one closed field, its labels keyed by field then option id (B-09, AMB-17). */
const slotted = (
  labels: Record<string, string>,
  over: Partial<RoutingCandidate> = {},
): RoutingCandidate =>
  candidate({
    utteranceTemplate: 'записаться на {{selection}}',
    selectionDomainLabelsJson: { service_id: labels },
    ...over,
  });

describe('U10a — routeUtterance (C11:4805-4810, §4.7 V1 and V9)', () => {
  // ── normalisation ──────────────────────────────────────────────────────────────────────────────

  it('U10A-R-1 normaliseUtterance trims, lowercases, drops ONE leading slash and collapses spaces', () => {
    expect(normaliseUtterance('  Мои   Записи ')).toBe('мои записи');
    expect(normaliseUtterance('/cancel')).toBe('cancel');
    expect(normaliseUtterance('/ cancel')).toBe('cancel');
    expect(normaliseUtterance('//cancel')).toBe('/cancel');
    expect(normaliseUtterance('MY\tAPPOINTMENTS')).toBe('my appointments');
    expect(normaliseUtterance('   ')).toBe('');
    // It changes NOTHING else: punctuation, ё and hyphens are content, not noise.
    expect(normaliseUtterance('мои записи?')).toBe('мои записи?');
    expect(normaliseUtterance('всё')).toBe('всё');
  });

  it('U10A-R-2 an utterance matches a slot-less template up to normalisation only', () => {
    const c = candidate({ utteranceTemplate: 'Мои  записи' });
    expect(routeUtterance('мои записи', [c])).toBe(c);
    expect(routeUtterance('  МОИ ЗАПИСИ  ', [c])).toBe(c);
    expect(routeUtterance('/мои записи', [c])).toBe(c);
    expect(routeUtterance('мои записи?', [c])).toBeNull();
    expect(routeUtterance('моизаписи', [c])).toBeNull();
  });

  it('U10A-R-3 an empty utterance and an empty candidate list match nothing', () => {
    expect(routeUtterance('', [candidate()])).toBeNull();
    expect(routeUtterance('   ', [candidate()])).toBeNull();
    expect(routeUtterance('/', [candidate()])).toBeNull();
    expect(routeUtterance('мои записи', [])).toBeNull();
  });

  // ── the match itself ───────────────────────────────────────────────────────────────────────────

  it('U10A-R-4 the match is the CANDIDATE, carrying «the same token» (C11:4809)', () => {
    const c = candidate({ intentTokenHash: 'the-same-token' });
    const matched = routeUtterance('мои записи', [
      candidate({ utteranceTemplate: 'другое' }),
      c,
    ]);
    expect(matched).toBe(c);
    expect(matched?.intentTokenHash).toBe('the-same-token');
  });

  it('U10A-R-5 no substring, prefix or suffix match [M10-24]', () => {
    const c = candidate({ utteranceTemplate: 'показать свободное время' });
    expect(routeUtterance('свободное время', [c])).toBeNull();
    expect(routeUtterance('показать свободное', [c])).toBeNull();
    expect(routeUtterance('показать свободное время сегодня', [c])).toBeNull();
    expect(routeUtterance('показать свободное время', [c])).toBe(c);
  });

  it('U10A-R-6 array order decides, and the tapped record is not privileged [M10-15]', () => {
    const first = candidate({
      intentTokenHash: 'first',
      utteranceTemplate: 'мои записи',
    });
    const tapped = candidate({
      intentTokenHash: 'tapped',
      utteranceTemplate: 'мои записи',
      issuedAt: new Date('2026-09-17T12:00:00.000Z'),
    });
    // The tapped record is newer AND is the one that was submitted; the router still answers the
    // candidate its caller put first. Ordering is `liveCandidates`' decision (U10b), never the
    // router's.
    expect(routeUtterance('мои записи', [first, tapped])).toBe(first);
    expect(routeUtterance('мои записи', [tapped, first])).toBe(tapped);
  });

  it('U10A-R-7 the router neither sorts nor mutates the array it is given', () => {
    const a = candidate({ utteranceTemplate: 'один' });
    const b = candidate({ utteranceTemplate: 'два' });
    const candidates = [a, b];
    const snapshot = [...candidates];
    expect(routeUtterance('два', candidates)).toBe(b);
    expect(candidates).toEqual(snapshot);
    expect(candidates[0]).toBe(a);
    // Pure: the same call twice answers the same object.
    expect(routeUtterance('два', candidates)).toBe(
      routeUtterance('два', candidates),
    );
  });

  // ── slotted templates ──────────────────────────────────────────────────────────────────────────

  it('U10A-R-8 a slotted template matches once per label of its selection domain', () => {
    const c = slotted({ s1: 'стрижку', s2: 'бороду' });
    expect(routeUtterance('записаться на стрижку', [c])).toBe(c);
    expect(routeUtterance('Записаться  на  Бороду', [c])).toBe(c);
    expect(routeUtterance('записаться на укладку', [c])).toBeNull();
    // The OPTION ID is not a label: raw client bytes never route (R3.9.2).
    expect(routeUtterance('записаться на s1', [c])).toBeNull();
    // The template with its slot unfilled is not an utterance either.
    expect(routeUtterance('записаться на {{selection}}', [c])).toBeNull();
  });

  it('U10A-R-9 a label carrying `$&`, `$1` or `$$` routes by its own bytes', () => {
    const c = slotted({ s1: 'скидка $$ 50% ($1) $&' });
    const rendered = renderUtterance('записаться на {{selection}}', [
      'скидка $$ 50% ($1) $&',
    ]);
    expect(rendered.ok).toBe(true);
    expect(routeUtterance(rendered.ok ? rendered.utterance : '', [c])).toBe(c);
    expect(routeUtterance('записаться на скидка $$ 50% ($1) $&', [c])).toBe(c);
  });

  it('U10A-R-10 labels are read across fields, de-duplicated, and a non-string is ignored', () => {
    const c = candidate({
      utteranceTemplate: 'выбрать {{selection}}',
      selectionDomainLabelsJson: {
        staff_id: { a: 'Илью', b: 'Илью' },
        service_id: { c: 'стрижку', d: 7, e: null },
      },
    });
    expect(routeUtterance('выбрать Илью', [c])).toBe(c);
    expect(routeUtterance('выбрать стрижку', [c])).toBe(c);
    expect(routeUtterance('выбрать 7', [c])).toBeNull();
  });

  // ── candidates that cannot render are skipped ──────────────────────────────────────────────────

  it('U10A-R-11 an erased record is skipped, and a later candidate still matches', () => {
    const erased = candidate({
      utteranceTemplate: 'мои записи',
      erasedAt: new Date('2026-09-17T11:00:00.000Z'),
    });
    const live = candidate({ utteranceTemplate: 'мои записи' });
    expect(routeUtterance('мои записи', [erased])).toBeNull();
    expect(routeUtterance('мои записи', [erased, live])).toBe(live);
  });

  it('U10A-R-12 an absent, blank or brace-broken template is skipped, never thrown on', () => {
    const skipped = [
      candidate({ utteranceTemplate: null }),
      candidate({ utteranceTemplate: '' }),
      candidate({ utteranceTemplate: '   ' }),
      candidate({ utteranceTemplate: '{{who}} записи' }),
      candidate({ utteranceTemplate: 'мои {{selection}} {{other}}' }),
    ];
    for (const c of skipped) {
      expect(() => routeUtterance('мои записи', [c])).not.toThrow();
      expect(routeUtterance('мои записи', [c])).toBeNull();
      expect(routeUtterance('', [c])).toBeNull();
    }
  });

  it('U10A-R-13 a slotted template with no usable labels is skipped, never thrown on', () => {
    const shapes: unknown[] = [
      null,
      {},
      { service_id: {} },
      { service_id: null },
      { service_id: ['стрижку'] },
      ['стрижку'],
      'стрижку',
      42,
      { service_id: { s1: 7 } },
    ];
    for (const selectionDomainLabelsJson of shapes) {
      const c = candidate({
        utteranceTemplate: 'записаться на {{selection}}',
        selectionDomainLabelsJson,
      });
      expect(() => routeUtterance('записаться на стрижку', [c])).not.toThrow();
      expect(routeUtterance('записаться на стрижку', [c])).toBeNull();
    }
  });

  // ── the escape verb (§4.7 V9) ──────────────────────────────────────────────────────────────────

  it('U10A-R-14 ESCAPE_VERBS is V9’s vocabulary, normalised and unique', () => {
    expect([...ESCAPE_VERBS]).toEqual(['отмена', 'стоп', 'хватит', 'cancel']);
    for (const verb of ESCAPE_VERBS)
      expect(normaliseUtterance(verb)).toBe(verb);
    expect(new Set(ESCAPE_VERBS).size).toBe(ESCAPE_VERBS.length);
  });

  it('U10A-R-15 an escape verb matches the escape candidate BEFORE any other [M10-14]', () => {
    const escape = escapeCandidate({ intentTokenHash: 'escape' });
    // A live REFINE record whose own words are literally «стоп»: without V9's precedence it would
    // win on array order, and the person's cancel would run someone else's intent.
    const impostor = candidate({
      intentTokenHash: 'impostor',
      effect: 'REFINE',
      utteranceTemplate: 'стоп',
    });
    for (const verb of ESCAPE_VERBS) {
      expect(routeUtterance(verb, [impostor, escape])).toBe(escape);
      expect(
        routeUtterance(` /${verb.toUpperCase()} `, [impostor, escape]),
      ).toBe(escape);
    }
    expect(routeUtterance('стоп', [escape, impostor])).toBe(escape);
  });

  it('U10A-R-16 with no escape candidate the escape verb falls through to the ordinary match', () => {
    const impostor = candidate({ effect: 'REFINE', utteranceTemplate: 'стоп' });
    expect(routeUtterance('стоп', [impostor])).toBe(impostor);
    expect(routeUtterance('отмена', [impostor])).toBeNull();
  });

  it('U10A-R-17 the escape candidate is exactly F60’s: priority 0, CONTROL, widget.dismiss', () => {
    const near: RoutingCandidate[] = [
      escapeCandidate({ priority: 1 }),
      escapeCandidate({ effect: 'NAVIGATE' }),
      escapeCandidate({ capabilityKey: 'control.run.cancel' }),
      escapeCandidate({ capabilitySpace: 'C9' }),
      escapeCandidate({ capabilityKey: null, capabilitySpace: null }),
    ];
    for (const c of near) expect(routeUtterance('отмена', [c])).toBeNull();
    const real = escapeCandidate();
    expect(routeUtterance('отмена', [...near, real])).toBe(real);
  });

  it('U10A-R-18 the escape door survives RT6 erasure and an absent template (V9 "always live")', () => {
    const erasedEscape = escapeCandidate({
      erasedAt: new Date('2026-09-17T11:00:00.000Z'),
      utteranceTemplate: null,
    });
    expect(routeUtterance('отмена', [erasedEscape])).toBe(erasedEscape);
    // …but its own words no longer route, because its content is gone.
    expect(routeUtterance('закрыть карточку', [erasedEscape])).toBeNull();
  });

  it('U10A-R-19 an escape candidate still matches its own rendered words when they are not a verb', () => {
    const escape = escapeCandidate({ utteranceTemplate: 'закрыть карточку' });
    expect(routeUtterance('закрыть карточку', [escape])).toBe(escape);
  });

  // ── AMB-09 / B10-10: the router reads no handoff member ────────────────────────────────────────

  it('U10A-R-20 a handoff column cannot make a candidate the escape (AMB-09)', () => {
    const withHandoff = {
      ...candidate({ priority: 0, effect: 'CONTROL' }),
      handoffSpace: 'CONTROL',
      handoffKey: 'control.widget.dismiss',
    };
    expect(routeUtterance('отмена', [withHandoff])).toBeNull();
  });

  // ── R3.12.4, at unit scale ─────────────────────────────────────────────────────────────────────

  it('U10A-R-21 a candidate’s own rendering routes back to it (R3.12.4, hand-built)', () => {
    // The DUTY (10.10) is `r3124-routing-duty.build.spec.ts` over production-recorded emissions; this
    // is the same property over hand-built rows, which is a regression aid and not that proof.
    const rows: RoutingCandidate[] = [
      candidate({ utteranceTemplate: 'мои записи' }),
      slotted({ s1: 'стрижку' }),
      escapeCandidate(),
    ];
    for (const row of rows) {
      const labels =
        row.utteranceTemplate?.includes('{{selection}}') === true
          ? ['стрижку']
          : [];
      const rendered = renderUtterance(row.utteranceTemplate, labels);
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) continue;
      expect(routeUtterance(rendered.utterance, rows)).toBe(row);
    }
  });

  it('U10A-R-22 the load assertion passes on the real registries', () => {
    expect(() => assertRoutingResolves()).not.toThrow();
  });
});
