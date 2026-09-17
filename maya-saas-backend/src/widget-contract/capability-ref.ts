// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     capability-ref
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import {
  ActionCapabilityRegistry,
  C9_CAPABILITIES,
  MAYA_AI_TOOL_CATALOG,
  actionCapabilityRegistry,
  c9Registry,
} from './ambient';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';
import type { AiToolDefinition } from '../ai-tools/ai-tool.types';
import type { C9Capability } from '../orchestration/c9.registry';

// --- section 0.6 (contract line 329) ---
export type CapabilitySpace = 'C9' | 'TOOL' | 'AE' | 'CONTROL';

export type CapabilityRef =
  | { space: 'C9'; key: string } // C9Capability.capabilityKey              — 56; 71 once §0.7 F36a registers
  | { space: 'TOOL'; key: string } // AiToolDefinition.name                   — 47
  | { space: 'AE'; key: string } // RegisteredActionCapabilityV1.capability — 226
  | { space: 'CONTROL'; key: ControlKey }; // §0.7, closed at 3

export type ControlKey =
  'control.run.cancel' | 'control.widget.dismiss' | 'control.delivery.resolve';

// --- section 0.6 (contract line 361) ---
export type CapabilityRefKey = `${CapabilityRef['space']}:${string}`; // e.g. 'C9:b35.preview'
export declare function capKey(ref: CapabilityRef): CapabilityRefKey; // `${ref.space}:${ref.key}`
// total over the four spaces, and injective because `space` is one of four fixed tokens
// and ':' is the only separator, so no two refs collide.

// --- section 0.6 (contract line 380) ---
// DECLARED BY THIS CONTRACT. Pure, total, non-throwing, derived once at module load from
// frozen released arrays. None adds a field, a row, or a registry entry.
export const C9_CAP_BY_KEY: ReadonlyMap<string, C9Capability> = new Map(
  C9_CAPABILITIES.map((c) => [c.capabilityKey, c]),
);
export const MAYA_AI_TOOL_CATALOG_BY_NAME: ReadonlyMap<
  string,
  AiToolDefinition
> = new Map(MAYA_AI_TOOL_CATALOG.map((d) => [d.name, d]));
export const AE_CAP_BY_KEY: ReadonlyMap<string, RegisteredActionCapabilityV1> =
  new Map(new ActionCapabilityRegistry().list().map((c) => [c.capability, c]));

c9Registry.tryGet = (key: string) => C9_CAP_BY_KEY.get(key);
actionCapabilityRegistry.tryGet = (key: string) => AE_CAP_BY_KEY.get(key);
