// K2 - the surface the contract NAMES and declares no shape for: its refusal, lookup and
// render helpers, and the three registries it reads. Each is a K3 or K5 deliverable, declared
// here so that a rule citing one is a rule against a typed thing rather than a free name.
import type { VerificationLevel } from './envelope';
import type { IntentTarget } from './intent';
import type { C9Capability } from '../orchestration/c9.registry';
import type { AiToolDefinition } from '../ai-tools/ai-tool.types';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';

export declare function refuseMint(code: string): never;
export declare function maxLevel(
  ...levels: VerificationLevel[]
): VerificationLevel;
export declare function targetFloor(t: IntentTarget | null): VerificationLevel;
export declare function stableActionJson(v: unknown): string;

// The three registries the widget layer READS and changes none of.
export declare const C9_CAPABILITIES: readonly C9Capability[];
export declare const MAYA_AI_TOOL_CATALOG: readonly AiToolDefinition[];
export declare const C9_REGISTRY_HASH: string;
export declare const c9Registry: {
  tryGet(key: string): C9Capability | undefined;
};
export declare const actionCapabilityRegistry: {
  get(key: string): RegisteredActionCapabilityV1;
  tryGet(key: string): RegisteredActionCapabilityV1 | undefined;
};
export declare class ActionCapabilityRegistry {
  list(): RegisteredActionCapabilityV1[];
}

// The orchestrator's own published union - imported, never redeclared (section 3.7 R3.7.1).
export type C9Domain =
  'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' | 'BUSINESS_INTELLIGENCE';
