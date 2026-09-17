// @as: src/dom/host.ts
import type { DomFactory } from '../shell/ports.ts';

export const makeButton = (factory: DomFactory): HTMLButtonElement => factory.create('button');
