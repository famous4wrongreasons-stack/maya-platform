// @as: src/routes/registry.ts
import type { IntentTarget } from '../contract.ts';

export const classOf = (t: IntentTarget): string => t.class;
