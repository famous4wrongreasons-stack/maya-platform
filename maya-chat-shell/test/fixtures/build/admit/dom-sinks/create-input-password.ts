// @as: src/dom/signin.ts
import type { DomFactory } from '../shell/ports.ts';

export const passwordField = (factory: DomFactory): HTMLInputElement => factory.createInput('password');
