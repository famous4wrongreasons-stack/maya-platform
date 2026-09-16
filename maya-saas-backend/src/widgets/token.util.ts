// The token itself is never stored — only its hash. §5 fixes the column as Char(64), which is a
// sha-256 hex digest, and the comparison the gateway performs is against that digest.
//
// Kept in its own file with no NestJS dependency so the hash used at mint time and the hash used at
// ingress cannot diverge: there is one function, and both sides import it.
import { createHash, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * Constant-time comparison of two hex digests. §3 requires a mutated, expired, replayed and
 * foreign-principal token to be refused "at indistinguishable latency", and a short-circuiting
 * string compare is measurable — so digest comparison never uses `===`.
 */
export const digestEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
};
