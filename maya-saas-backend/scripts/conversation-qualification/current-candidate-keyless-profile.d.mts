export function readBoundedProfileJson(
  file: string,
  maxBytes?: number,
): unknown;
export function createKeylessProfileBinding(input: {
  metadata: unknown;
  candidate: unknown;
  localObservation: unknown;
}): { keylessProfileSha256: string; [key: string]: unknown };
export function verifyKeylessProfileBinding(input: {
  binding: unknown;
  candidate: unknown;
  expectedSha256: string;
}): string;
