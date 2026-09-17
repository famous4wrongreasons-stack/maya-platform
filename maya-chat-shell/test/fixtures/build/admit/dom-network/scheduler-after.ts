// @as: src/dom/host.ts
import type { Cancel, Scheduler } from '../shell/ports.ts';

export const later = (scheduler: Scheduler, f: () => void): Cancel => scheduler.after(5000, f);
