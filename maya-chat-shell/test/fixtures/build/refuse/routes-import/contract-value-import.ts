// @as: src/routes/registry.ts
// @expect: import-allowlist
import { IntentTarget } from '../contract.ts';

export const classOf = (t: IntentTarget): string => t.class;
