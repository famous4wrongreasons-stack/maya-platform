// U8b-c — `input_schema_hash`, the one binding between a stored schema and the record that names it.
//
// §3.7 declares `IntentRecord.input_schema_hash: string | null` (C11:4510). B-10 (C11:7202) and AMB-18
// (C11:7202) say what it is FOR: the schema is held by the server, and Gate 8 accepts a projected schema
// only when its hash equals the record's. An erased or absent schema answers `superseded/handle_stale`;
// a hash that does not match is an INTEGRITY FAULT, not a refusal (D-10, AREA-A §2.3 U8b). Neither
// decision is made here — this file only produces the number both sides compare.
//
// H6 (C11:2627) allows the widget layer exactly one unkeyed scheme: `stableActionJson` + SHA-256. So:
//   - the canonicaliser is the platform's `stableActionJson` (`action-engine/action-engine.identity.ts`),
//     imported, never re-typed. It sorts object keys at every depth, which is what makes the hash stable
//     under key order — the property U8b-c's exit test names;
//   - the digest is `sha256Hex` from `../token.util`, the widget layer's one SHA-256 helper.
// No `createHash` and no `JSON.stringify` appears in this directory (ISC-4 in
// `input-schema.architecture.spec.ts`), so P-SEAL's SEAL-4 ratchet does not grow an entry for it.
//
// WHAT IS HASHED is the value `parseInputSchema` returned, on BOTH sides. The minter hashes the schema
// it parsed before sealing it; Gate 8 hashes the schema it parsed out of the render receipt. Hashing an
// unparsed document instead would let an undeclared member, or a member spelled `undefined`, change the
// digest on one side only — and that difference would be reported as tampering.

import { stableActionJson } from '../../action-engine/action-engine.identity';
import { sha256Hex } from '../token.util';
import type { InputSchema } from '../../widget-contract/intent';

/**
 * The hex SHA-256 of the canonical serialisation of a PARSED `InputSchema`.
 *
 * Total: every member of a parsed schema is a string, a finite number, a boolean or null, so the
 * canonicaliser cannot raise. `Char(64)` in the store (`prisma/schema.prisma` `inputSchemaHash`) is the
 * same 64 hex characters this returns.
 */
export const inputSchemaHash = (schema: InputSchema): string =>
  sha256Hex(stableActionJson(schema));
