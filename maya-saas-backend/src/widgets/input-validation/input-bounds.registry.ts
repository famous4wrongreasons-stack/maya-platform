import type { InputField } from '../../widget-contract/intent';

export type BoundedInputField = Extract<
  InputField,
  { kind: 'integer' | 'decimal' | 'date' | 'time' | 'datetime' }
>;

export interface InputBoundCheck {
  readonly tenantId: string;
  readonly field: BoundedInputField;
  readonly value: number | string;
}

/** A registered entry re-reads its canonical owner and decides the submitted value against that fact. */
export type InputBoundSource = (
  input: InputBoundCheck,
) => boolean | Promise<boolean>;

export type InputBoundsRegistry = ReadonlyMap<string, InputBoundSource>;

/** AMB-21d leaves every concrete source unregistered in this programme. */
export const EMPTY_INPUT_BOUNDS_REGISTRY: InputBoundsRegistry = Object.freeze(
  new Map<string, InputBoundSource>(),
);
