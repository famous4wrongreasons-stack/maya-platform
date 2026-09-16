// ── Gate 8 — input validation ────────────────────────────────────────────────────────────────────
//
// LEGACY. Moved here unchanged from the former `gate-logic.ts`. The Gate 8 specification records
// that this function fails open (it passes non-string values, and every value on an empty domain);
// slot 8 becomes a refusing `pending()` stub and this file is deleted in the next U0 step.
//
// Every submitted value must come from the server-declared closed domain. §3.8's shape already
// makes an endpoint or a capability name unrepresentable; this is the remaining half — that the
// VALUES are ones the server offered.

import type { GateContext, GateVerdict } from '../gate.types';
import { pass, refuse } from './verdict';

const MAX_SUBMISSION_BYTES = 16 * 1024;

export const gate8 = (ctx: GateContext): GateVerdict => {
  const r = ctx.record;
  if (!r) return refuse('bound_violation', 'no record');

  const raw = JSON.stringify(ctx.submission.inputs ?? {});
  if (Buffer.byteLength(raw, 'utf8') > MAX_SUBMISSION_BYTES)
    return refuse(
      'oversize_submission',
      `${Buffer.byteLength(raw, 'utf8')} bytes`,
    );

  const domain = new Set(
    r.selectionDomain
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (!domain.size) return pass; // nothing was offered, so nothing may be selected — and none was

  for (const [, value] of Object.entries(ctx.submission.inputs ?? {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values)
      if (typeof v === 'string' && !domain.has(v))
        return refuse(
          'selection_out_of_domain',
          'a value the server did not offer',
        );
  }
  return pass;
};
