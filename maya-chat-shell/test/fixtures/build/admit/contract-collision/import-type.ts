// @as: src/shell/view.ts
import type { WidgetEnvelope } from '../contract.ts';

export const kindOf = (e: WidgetEnvelope): string => e.kind;
