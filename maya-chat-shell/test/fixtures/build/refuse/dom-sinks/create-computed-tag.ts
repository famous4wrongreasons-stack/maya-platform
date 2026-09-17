// @as: src/dom/host.ts
// @expect: dom-sink
import type { DomFactory } from '../shell/ports.ts';

declare const tag: 'div';
export const make = (factory: DomFactory) => factory.create(tag);
