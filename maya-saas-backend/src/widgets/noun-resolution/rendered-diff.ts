import type { ResolvedNounDiff } from './noun-resolution';

/** B-23: deterministic safe diff; opaque handles never become conversational copy. */
export const renderedNounDiff = (
  frozen: ReadonlyMap<string, string>,
  fresh: ReadonlyMap<string, string>,
): readonly ResolvedNounDiff[] =>
  [...frozen.entries()]
    .filter(([noun, value]) => fresh.get(noun) !== value)
    .map(([noun, value]) => ({
      noun,
      frozen: value,
      fresh: fresh.get(noun) ?? '',
    }));
