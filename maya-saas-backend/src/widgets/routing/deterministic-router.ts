// Gate 10's deterministic router — ONE function, before any model.
//
// R3.12.4's guarantee is "three front doors, one function": a tap, a typed sentence and a spoken
// utterance resolve to the SAME capability. That is false by construction if there are two
// functions, so a slash command, a typed sentence and a voice alias all come through here.
//
// It returns a `CapabilityRef`, never a persona or a category — a router that returned a category
// would be re-introducing modes through the back door. It reads no model and takes no network.
//
// It deliberately does NOT reuse MayaBrainRouterService: wrong return type, and importing
// AiToolsModule into WidgetsModule would breach the module isolation widgets.module.ts states.

import type { CapabilityRef } from '../../widget-contract/capability-ref';
import { C9_CAPABILITIES, c9Registry } from '../authority/contract-bindings';

/**
 * The alias table: an exact phrase, in either language, to a capability key.
 *
 * Deliberately EXACT-MATCH and small. A fuzzy router that guessed would produce divergences that
 * are the router's fault and would then, under the owner's ruling, refuse a person's legitimate
 * action whenever the guess crossed an effect class. A router that resolves nothing is honest;
 * Gate 10 treats a null resolution as "nothing was said to compare", not as a divergence.
 */
export const SPEECH_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // slash commands, normalised without the leading slash
  cancel: 'c9.no_action',
  'мои записи': 'appointments.own.list',
  'my appointments': 'appointments.own.list',
  'покажи услуги': 'catalog.services.read',
  'show services': 'catalog.services.read',
  'свободное время': 'booking.availability.read',
  availability: 'booking.availability.read',
  'мои баллы': 'loyalty.own.read',
  'my points': 'loyalty.own.read',
});

/** Lowercase, collapse whitespace, drop a leading slash. Nothing language-specific. */
export const normalise = (utterance: string): string =>
  utterance.trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ');

/**
 * Resolve an utterance to a capability, or to null.
 *
 * Null means "this router does not know", and Gate 10 must treat that as no comparison rather than
 * as a divergence — refusing on the router's ignorance would refuse legitimate traffic on the
 * router's behalf.
 */
export const resolveCapability = (utterance: string): CapabilityRef | null => {
  const key = SPEECH_ALIASES[normalise(utterance)];
  if (!key) return null;
  return c9Registry.tryGet(key) ? { space: 'C9', key } : null;
};

/**
 * The effect class a capability would carry, from §3.2's existing eight — no new taxonomy.
 *
 * Derived from the capability's own `mode`, which is the orchestrator's published statement of what
 * it does: a READ is a REFINE-shaped read, and a PROPOSE_ONLY or OWNER_HANDOFF prepares rather than
 * commits. A key the registry does not hold returns null, and Gate 10 does not refuse on a null.
 */
export const effectClassOf = (ref: CapabilityRef): string | null => {
  const cap = c9Registry.tryGet(ref.key);
  if (!cap) return null;
  switch (cap.mode) {
    case 'READ':
      return 'REFINE';
    case 'PROPOSE_ONLY':
      return 'DRAFT';
    case 'OWNER_HANDOFF':
      return 'HANDOFF';
    default:
      return null;
  }
};

/** Every alias must resolve in the live registry, or the process does not start. */
export const assertAliasesResolve = (): void => {
  const keys = new Set(C9_CAPABILITIES.map((c) => c.capabilityKey));
  for (const [phrase, key] of Object.entries(SPEECH_ALIASES))
    if (!keys.has(key))
      throw new Error(
        `speech alias "${phrase}" names ${key}, which is not a C9 capability`,
      );
};
