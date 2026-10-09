# Final C8 calendar legacy-compatibility review — 2026-10-09

**QUALIFIED_PASS_FOR_FINAL_SOURCE_AND_COMPONENT_EVIDENCE**; no remaining blocker within this checkpoint.

Final committed source `b2a752949cc43636a01d492b06f6d54050fc4dfd`. All11 production/script/spec bindings match exact Git bytes. Four files differ from intermediate `dda9ccfa`: calendar helper, deterministic owner and two specs. Prior source/evidence review artifacts remain unchanged; this followup supersedes their intermediate verdict.

P2 is closed: a unique corrected instant alone did not prove that a legacy published value used that same deadline. The guard now compares corrected deadline to the old v1 conversion (unchanged shared converter plus original UTCseconds/milliseconds), conservatively refusing low-year coercion. Published results are withheld without recomputing their boolean or altering history. New calendar dormancy computations also refuse incompatible inputs before publication, using the existing typed-error/same-lease unavailable path.

Final R2 evidence: **332 passed /20 suites /0 failed /0 skipped/pending/todo**. Calendar24+producer13+store34 are71 tests included in332. Four new controls cover both historical counterexamples at producer and store/reader boundaries. Earlier328 and other runs overlap and are not summed. Focused types, production types and lint were explicitly reported exit0 by parent; hashed logs are preserved, with the limitation that empty logs do not encode exit status.

The nine before-after pure resolver observations remain bound to the earlier recorded source; the `c8ShiftWindow` function is byte-identical in final source. They do not mean final v1 producers/readers accept Paris1880/year0099: compatibility explicitly withholds those inputs. Without an implementation stamp, separately versioned qualification is required to make affected inputs usable; no silent migration is claimed.

Scope remains actual methods with synthetic SQL/ACL/governed/source ports. No actual SQL fences/rollback, encryption, HTTP/PG, new restart, DI boot or deployment proof. Support is bounded Gregorian AD1..9999/integral-second offsets±24h, without a chosen DST preference or universal historical guarantee. Maximum-cohort/transaction/lease performance remains unqualified. Original81 and previous failed artifacts remain unchanged; no full MAYA/C10 or real-model/provider qualification.

Reviewer performed local read/hash/Git/arithmetic checks only, no tests/services/network/source edits. Exact files, hashes and prior-artifact identities are recorded in the adjacent JSON.
