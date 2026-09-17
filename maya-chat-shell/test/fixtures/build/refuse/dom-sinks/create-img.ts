// @as: src/dom/host.ts
// @expect: dom-sink
import type { DomFactory } from '../shell/ports.ts';

export const make = (factory: DomFactory) => factory.create('img');
