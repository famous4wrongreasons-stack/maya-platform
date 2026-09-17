// @as: src/renderer/render.ts
// @probes
// @expect: layer-global, identifier-ban, type-assertion, k5-text
// The eight lines that passed the old needle audit (scratchpad p1-shell/work/bypass). Each must be refused.
export const probe1 = (u: string) => (globalThis as any)['fetch'](u); // probe
export const probe2 = (u: string) => new EventSource(u); // probe
export const probe3 = () => document.cookie; // probe
export const probe4 = (u: string) => { new Image().src = u; }; // probe
export const probe5 = () => caches.open('x'); // probe
export const probe6 = (u: string) => navigator.serviceWorker.register(u); // probe
export const probe7 = (u: string) => { location.href = u; }; // probe
export const probe8 = (u: string) => window.open(u); // probe
