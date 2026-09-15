// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     envelope-roots
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Phrase, VerificationLevel } from './envelope';
import { FullscreenReason } from './kinds';
import { A11yBlock, ChannelProfile, ProactiveProvenance } from './lifecycle';

// --- section 0.5 (contract line 239) ---
export interface Origin {
  // root member `origin`
  trigger: 'user_turn' | 'proactive' | 'system_reply'; // E
  emitter: 'orchestrator' | 'capability_read' | 'scheduler'; // D — the minter
  moment_key: string | null; // D — non-null iff trigger === 'proactive'
  proactive_provenance: ProactiveProvenance | null; // D — non-null iff trigger === 'proactive'
}

export interface AuthorityEnvelope {
  // root member `authority`
  verification_level: VerificationLevel; // D — server-derived
  pii_class: 'none' | 'business_aggregate' | 'client_identified'; // D
  data_scope: { masked_fields: string[] }; // D — JSON Pointers narrowed before emission
  // type-level bans, as on ChannelProfile
  declares_role: never;
  declares_permissions: never;
  declares_capability: never;
}

export interface Presentation {
  // root member `presentation`
  presentation_mode: 'client' | 'staff' | 'owner'; // D — from the authority snapshot; never emitter-supplied
  density: 'INLINE' | 'CARD' | 'SHEET'; // D — set at EP-FIT
  text_equivalent: TextEquivalent; // M
  speech: {
    lead: Phrase;
    readback_template: Phrase | null;
    overflow_say: Phrase | null;
  } | null; // M
  a11y: A11yBlock; // M
  fullscreen_detail: { route_key: string; reason: FullscreenReason } | null; // D
}

export interface TextEquivalent {
  headline: string;
  body: string; // M — renderTextEquivalent
  itemized: string[]; // M
  completeness_sentence: string | null; // M
  unknowns_sentence: string | null; // M
}
