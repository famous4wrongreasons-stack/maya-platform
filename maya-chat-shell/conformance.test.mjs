// K5 / G23 — the conformance suite, entry point.
//
// Split in S0 into the route registry's tests and the renderer's tests so each has one owner
// (S1 and S2). This file stays the thin entry that K16's evaluator and the evidence cite.
//
//   node --test conformance.test.mjs

import './test/routes.conformance.test.mjs';
import './test/renderer.conformance.test.mjs';
