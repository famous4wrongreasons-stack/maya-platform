export type InputNormalizer = (value: string) => string;
export type InputNormalizerRegistry = ReadonlyMap<string, InputNormalizer>;

/** AMB-21d leaves every concrete normalizer unregistered in this programme. */
export const EMPTY_INPUT_NORMALIZER_REGISTRY: InputNormalizerRegistry =
  Object.freeze(new Map<string, InputNormalizer>());
