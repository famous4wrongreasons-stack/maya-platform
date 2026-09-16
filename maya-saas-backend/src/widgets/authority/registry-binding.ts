// K4 — binding the three live registries.
//
// The contract's floor functions take a `CapabilityRef` and ask the registries what it is. Until
// now those registries were `declare`d — present in the type system, absent at runtime. This file
// binds them to the real ones, and that is the whole of its job: it adds no capability, no key and
// no policy, because every one of those is owned elsewhere.
//
// Why the counts matter, and why they are RE-DERIVED rather than written down: these registries are
// built by template functions called several times, so grepping for literals gives a different
// answer from executing the module. Every number here comes from executing it.

import {
  C9_CAPABILITIES,
  C9_REGISTRY_HASH,
} from '../../orchestration/c9.registry';
import { MAYA_AI_TOOL_CATALOG } from '../../ai-tools/ai-tool.catalog';
import { ActionCapabilityRegistry } from '../../action-engine/action-engine.registry';

/** The four key spaces §0.6 F21 declares. A ref belongs to exactly one. */
export type Space = 'C9' | 'TOOL' | 'AE' | 'CONTROL';

export interface CapabilityRefLike {
  readonly space: Space;
  readonly key: string;
}

/** `${space}:${key}` — the contract's own spelling, so two spaces cannot collide by key alone. */
export const capKey = (ref: CapabilityRefLike): string =>
  `${ref.space}:${ref.key}`;

// `capabilityKey`, not `capability`. Worth naming: a first pass used the wrong field, every key
// became `undefined`, and the census reported ONE C9 capability instead of fifty-six. It typechecked
// only because the annotation was written to match the guess. This is exactly why the numbers here
// are executed rather than transcribed — a transcribed 56 would have looked right and been wrong.
const c9Keys = (): ReadonlySet<string> =>
  new Set(C9_CAPABILITIES.map((c) => c.capabilityKey));

const toolKeys = (): ReadonlySet<string> =>
  new Set(MAYA_AI_TOOL_CATALOG.map((t: { name: string }) => t.name));

const aeKeys = (): ReadonlySet<string> => {
  const reg = new ActionCapabilityRegistry();
  const anyReg = reg as unknown as Record<string, unknown>;
  // The registry exposes its domain under one of a few shapes across versions; each is tried and
  // the first that yields keys is used. An empty result is an error rather than an empty set,
  // because "no AE capabilities" would silently make every AE floor vacuous.
  for (const name of ['list', 'keys', 'all', 'definitions']) {
    const fn = anyReg[name];
    if (typeof fn === 'function') {
      const out = (fn as () => unknown).call(reg);
      if (Array.isArray(out) && out.length)
        return new Set(
          out.map((e) =>
            typeof e === 'string'
              ? e
              : String((e as { capability?: string }).capability ?? ''),
          ),
        );
    }
  }
  throw new Error(
    'AE registry bound but empty — refusing to treat an empty domain as a valid one',
  );
};

/** The CONTROL space is closed in the contract and small; it is not a registry lookup. */
export const CONTROL_KEYS: ReadonlySet<string> = new Set([
  'control.widget.dismiss',
  'control.run.cancel',
]);

export interface SpaceCensus {
  readonly C9: number;
  readonly TOOL: number;
  readonly AE: number;
  readonly CONTROL: number;
  readonly registryHash: string;
}

/** Executed, never transcribed. */
export const census = (): SpaceCensus => ({
  C9: c9Keys().size,
  TOOL: toolKeys().size,
  AE: aeKeys().size,
  CONTROL: CONTROL_KEYS.size,
  registryHash: C9_REGISTRY_HASH,
});

/**
 * Does this ref resolve in its own space? Fail-closed on an unknown space: a ref whose space is not
 * one of the four is not resolvable, rather than falling through to a default that would let it
 * inherit somebody else's floor.
 */
export const resolves = (ref: CapabilityRefLike): boolean => {
  switch (ref.space) {
    case 'C9':
      return c9Keys().has(ref.key);
    case 'TOOL':
      return toolKeys().has(ref.key);
    case 'AE':
      return aeKeys().has(ref.key);
    case 'CONTROL':
      return CONTROL_KEYS.has(ref.key);
    default:
      return false;
  }
};

/** Every key in every space, as refs — the domain totality is quantified over. */
export const allRefs = (): readonly CapabilityRefLike[] => [
  ...[...c9Keys()].map((key) => ({ space: 'C9' as const, key })),
  ...[...toolKeys()].map((key) => ({ space: 'TOOL' as const, key })),
  ...[...aeKeys()].map((key) => ({ space: 'AE' as const, key })),
  ...[...CONTROL_KEYS].map((key) => ({ space: 'CONTROL' as const, key })),
];

/**
 * F24's disjointness: the TOOL catalogue's names are all C9 keys by spelling, while AE and C9 share
 * none. That is why the SPACE is part of the identity and a bare key is never enough — and it is
 * asserted here rather than assumed, because the day it stops being true a floor lookup starts
 * answering for the wrong capability.
 */
export const spaceOverlap = (): {
  toolSubsetOfC9: boolean;
  aeIntersectC9: number;
} => {
  const c9 = c9Keys();
  const ae = aeKeys();
  return {
    toolSubsetOfC9: [...toolKeys()].every((k) => c9.has(k)),
    aeIntersectC9: [...ae].filter((k) => c9.has(k)).length,
  };
};
