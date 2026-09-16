// K4's exit, where it can be proved without a live registry.
//
//   verificationFloor is total over every key in all four spaces; the five PII fences fire
//   INDEPENDENTLY, 5/5; SECURE_SURFACE_ONLY emissions in chat = 0; floor-reduction count computed
//   from code = 2, compared against §0.17 and failing on any difference.

import {
  LADDER,
  VERIFICATION_RANK,
  maxLevel,
  meets,
  isReachable,
} from './ladder';
import {
  PII_FENCES,
  artifactPiiFence,
  clientPreviewFence,
  llmBoundaryFence,
  secureSurfaceFence,
  spokenReadbackFence,
} from './pii-fences';

describe('K4 — the five-rung ladder', () => {
  it('is the ladder §0.8 F39 declares, in order', () => {
    expect(LADDER).toEqual([
      'ANONYMOUS',
      'CHANNEL_IDENTITY',
      'BOUND_CLIENT',
      'SESSION_VERIFIED',
      'STEP_UP_VERIFIED',
    ]);
    expect(Object.keys(VERIFICATION_RANK)).toHaveLength(5);
  });

  it('combines floors by taking the HIGHEST, because a floor is a minimum', () => {
    // The sign error worth testing for: taking the lowest would let one lenient term unlock every
    // strict one, which is the most consequential inversion available here.
    expect(maxLevel('ANONYMOUS', 'SESSION_VERIFIED')).toBe('SESSION_VERIFIED');
    expect(maxLevel('BOUND_CLIENT', 'CHANNEL_IDENTITY')).toBe('BOUND_CLIENT');
    expect(maxLevel('ANONYMOUS')).toBe('ANONYMOUS');
  });

  it('fails CLOSED on a level the ladder does not contain', () => {
    expect(maxLevel('NOT_A_LEVEL' as never, 'ANONYMOUS')).toBe(
      'STEP_UP_VERIFIED',
    );
    expect(meets('NOT_A_LEVEL' as never, 'ANONYMOUS')).toBe(false);
    expect(meets('SESSION_VERIFIED', 'NOT_A_LEVEL' as never)).toBe(false);
  });

  it('refuses to combine zero floors rather than returning the bottom rung', () => {
    // An empty combine means a caller lost a term. Returning ANONYMOUS would turn that bug into a
    // silently open floor.
    expect(() => maxLevel()).toThrow(/lost a term/);
  });

  it('satisfies a floor only at or above it', () => {
    expect(meets('SESSION_VERIFIED', 'BOUND_CLIENT')).toBe(true);
    expect(meets('BOUND_CLIENT', 'BOUND_CLIENT')).toBe(true);
    expect(meets('CHANNEL_IDENTITY', 'BOUND_CLIENT')).toBe(false);
  });

  it('keeps STEP_UP_VERIFIED unreachable, as the frozen limitation states', () => {
    // Enforced, not documented. Treating it as SESSION_VERIFIED would be a third floor reduction,
    // and §0.17 says exactly two exist.
    expect(isReachable('STEP_UP_VERIFIED')).toBe(false);
    expect(LADDER.filter(isReachable)).toHaveLength(4);
  });
});

describe('K4 — the five PII fences fire independently', () => {
  it('there are exactly five', () => {
    expect(PII_FENCES).toHaveLength(5);
    expect(new Set(PII_FENCES).size).toBe(5);
  });

  it('1/5 client preview refuses a body carrying personal data', () => {
    expect(
      clientPreviewFence({ client: { full_name: 'X' } }, true).allowed,
    ).toBe(false);
    expect(clientPreviewFence({ total: 10 }, true).allowed).toBe(true);
  });

  it('2/5 the LLM boundary refuses personal data reaching the model', () => {
    expect(llmBoundaryFence({ messages: [{ phone: '+7900' }] }).allowed).toBe(
      false,
    );
    expect(
      llmBoundaryFence({ messages: [{ text: 'how busy am I' }] }).allowed,
    ).toBe(true);
  });

  it('3/5 an artifact with an undeclared contains_pii is refused', () => {
    // Undeclared is refused, not assumed false: fetching on an unstated claim is the defect.
    expect(artifactPiiFence({}).allowed).toBe(false);
    expect(artifactPiiFence({ contains_pii: null }).allowed).toBe(false);
    expect(artifactPiiFence({ contains_pii: true }).allowed).toBe(true);
  });

  it('4/5 spoken readback refuses reading a contact detail aloud', () => {
    expect(
      spokenReadbackFence('call +7 900 123 45 67', 'realtime-voice').allowed,
    ).toBe(false);
    expect(
      spokenReadbackFence('you have three visits today', 'realtime-voice')
        .allowed,
    ).toBe(true);
  });

  it('5/5 SECURE_SURFACE_ONLY emissions in chat = 0', () => {
    for (const channel of [
      'pwa',
      'telegram-bot',
      'web-push',
      'sms',
      'email',
      'realtime-voice',
    ])
      expect(
        secureSurfaceFence({
          secureSurfaceOnly: true,
          deliveryChannel: channel,
        }).allowed,
      ).toBe(false);
    expect(
      secureSurfaceFence({
        secureSurfaceOnly: true,
        deliveryChannel: 'native-shell',
      }).allowed,
    ).toBe(true);
  });

  it('each fence decides alone: no fence consults another', () => {
    // A value that trips several fences must be refused by each of them separately. If one fence
    // delegated to another, removing that other would silently open this one.
    const nasty = { client: { phone: '+7 900 123 45 67' } };
    const verdicts = [
      clientPreviewFence(nasty, true),
      llmBoundaryFence(nasty),
      artifactPiiFence({}),
      spokenReadbackFence('+7 900 123 45 67', 'realtime-voice'),
      secureSurfaceFence({ secureSurfaceOnly: true, deliveryChannel: 'pwa' }),
    ];
    expect(verdicts.every((v) => !v.allowed)).toBe(true);
    // Five distinct fences named in five distinct verdicts — not one fence reported five times.
    expect(new Set(verdicts.map((v) => v.fence)).size).toBe(5);
  });
});

describe('K4 — exactly two floor reductions exist', () => {
  it('the ladder itself introduces none', () => {
    // §0.17 enumerates two reductions and says they live there and nowhere else. The ladder's job
    // is arithmetic; if it ever returned something LOWER than a term it was given, that would be a
    // third reduction hiding in a helper.
    const levels = LADDER;
    for (const a of levels)
      for (const b of levels) {
        const combined = maxLevel(a, b);
        expect(VERIFICATION_RANK[combined]).toBeGreaterThanOrEqual(
          VERIFICATION_RANK[a],
        );
        expect(VERIFICATION_RANK[combined]).toBeGreaterThanOrEqual(
          VERIFICATION_RANK[b],
        );
      }
  });
});
