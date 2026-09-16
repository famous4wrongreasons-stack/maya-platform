# WAVE 6 — PRE-CUTOVER DETERMINATION

```
CORRECTION FIRST — GATES:      6/15 conform to §3.9 on the live path — NOT the 15/15 reported at 6dc37bc8

G2 SUCCESSOR MAP:              INCOMPLETE   111 / 437 verified
THREE-BUNDLE PROBE:            FAIL
ROLLBACK READINESS:            PASS
K14 READINESS:                 FAIL
K15 READINESS:                 FAIL
K16 DELETION READINESS:        FAIL         0 / 437 retirable
NATIVE/PWA CUTOVER EVIDENCE:   NOT PROVEN

WAVE 6 K14 → K15 → K16:        NOT ENTERED  (pre-cutover readiness not met)
PRODUCTION DARK WINDOW:        NOT STARTED
LEGACY SURFACE DELETIONS:      0
PRODUCTION EFFECTS:            0            (read-only listing and HEAD/GET only)
CHAPTER 10 STARTED:            NO
```

The owner's instruction was to prove seven lines first, and enter Wave 6 only after pre-cutover
readiness. Readiness is not met, so Wave 6 was not entered. This document is the exact remaining
condition, row by row where rows are the unit.

---

## 0. CORRECTION FIRST — the gate figure the owner accepted was wrong

The owner opened this cycle with "GATE EXECUTABLE ENFORCEMENT: 15/15 принимаю". **That figure, which
I reported, does not hold.** Producing this determination exposed it in three steps, and each step is
now a check that fails loudly.

1. **Wave gates 2–5 failed lint on 6dc37bc8.** Its last edit left the `pending()` helper unused, and
   the lint run I reported predated that edit.
2. **Gate 9 was a function that returned `pass` and wrote nothing.** §3.9 defines Gate 9 as the first
   durable write — the tap's utterance appended as a USER turn. My wiring replaced a refusing stub with
   a silent pass and counted it. It is a refusing stub again. The refusal for a lowering that cannot
   render is undefined in the contract, so it is **DECISION-SHEET-03**, not an invented code.
3. **A clause-by-clause audit against §3.9** (`evidence/maya-chat-first-ux/gate-conformance-audit.json`)
   found:

```
COMPLETE on the live path   6   gates 1, 2, 3, 4, 5, 14
PARTIAL                     4   gate 6  — the principal's role is never read: no assertCanExecute for
                                          the 47 catalogue keys; AE clauses (a)–(e) absent
                                gate 7  — kind ceiling, key-space match, CONTROL registry, F72 re-read,
                                          §3.10.2, tier permission absent
                                gate 8  — cardinality, bounds, normalizers, c9SafeText, null schema absent
                                gate 8-R — keyed on carrier, not record.confirmation.requires_readback
NOT BUILT                   1   gate 9
NOT LIVE                    4   gate 10 — no utterance to compare; the audit is in memory
                                gate 11 — no fresh reader on the path, so it passes
                                gate 12 — no data subject on the path, so it passes; the projector is [TO BUILD]
                                gate 13 — returns a route label, dispatches nothing
```

The four PII proofs, the Gate 10 cross-class refusal and the Gate 5 floor proofs are true **as unit
tests of the functions**. Only Gate 5 is also true on the live path. The PII fences have never been
handed a real submission's data.

**Exposure: none today, and not because of the gates.** Production has no widget tables, and no plan
grants `widgets.runtime`. Gate 9 now refuses every submission that reaches it, and Gate 13 dispatches
nothing. No widget submission can produce a business effect, so the partial gates stand in front of
an effect path that does not exist yet. **They must be completed before one does.**

`gate-enforcement-inventory.mjs` now also checks for constant-pass functions, inline constant-pass
slots and reachability behind a stub. It prints the audit, and takes its headline from the audit.

**How to read G13 and G16 in the final gate.** G13 (intent unforgeability) and G16 (PII and preview
fences) still print PASS. Both are the closed K3/K4 exits: forged, expired, replayed and
foreign-principal tokens refuse at gates 1 and 3 on the live path, and the five fences fire
independently as functions. That is true. But G16's PASS does **not** mean the fences run on the widget
admission path — per the audit above, they do not yet (gate 12). K1–K13 were not reopened, and this
note is what keeps their exits from being read as more than they say.

---

## 1. G2 SUCCESSOR MAP — INCOMPLETE (111 / 437)

**Method.** Each of the 437 rows whose retirement condition begins with RETIRE got one successor
proposal, recorded in `successor-proposals.json` together with the dossier quote it rests on.
`successor-verify.mjs` then checked each proposal against the built code. That module is the only
place the rule lives: the successor-map builder, the K16 evaluator and the parity-proof job all
import it, and the evaluator re-runs it on every invocation. A proposal is judgement; the verifier
turns it into evidence or refuses it.

The successor type follows the owner's ruling and differs by row:

| type | verified when |
|---|---|
| ROUTE | the key is in the shell route registry **and** the surface is a presentation surface |
| C9 | the key is registered in the **executed** C9 registry **and** has a `WIDGET_CAPABILITY_POLICY` row |
| AE_BOOKING | the key is on the booking commit allowlist |
| MULTI | **every** function the surface served resolves; one ABSENT function leaves the row unresolved |
| FENCE | the file is in `maya-saas-backend/src`, the symbol appears verbatim, the code at that line refuses something, **and** a test names the symbol and reaches its module |

The verifier's own controls are `successor-verify.test.mjs` (11 tests). **12 of 12 mutants killed.**
Three survived the first battery because today's data never exercised those checks: every C9 key has
a policy row, and every good fence is tested. Injected implementations now make each check the only
thing between a proposal and a green row.

**Resolved, by retirement condition**

| condition | resolved | open |
|---|---:|---:|
| RETIRED AS UI — K15; the fence remains server-side | 47 | 73 |
| RETIRE AFTER PARITY — K16 | 51 | 156 |
| RETIRE IN K16, row by row | 8 | 55 |
| RETIRE FROM PRIMARY NAV — K16 | 5 | 25 |
| RETIRE IN K16 | 0 | 3 |
| RETIRE IN K16 after the probe is recorded | 0 | 14 |
| **total** | **111** | **326** |

**Resolved by type:** ROUTE 35, FENCE 48, C9 15, MULTI 12, AE_BOOKING 1.

A resolved successor is **named and registered**. It is not **served**: see §2 and §8. PARITY PASS is a
separate field, and it stands at 0.

### Adjudications — 12 AMBIGUOUS proposals, 0 left, no decision sheet needed

The owner's rule allows a STOP only for two materially different admissible readings that change what
is deleted. None of the twelve was that.

- **Split authority — S-177, S-181, S-465, S-474, S-475, S-483, S-488, S-509, S-583.** A canonical
  fence covers one contour; the other contour is enforced only in legacy Python or PHP. That is one
  reading, not two. The signed binding condition (G02/G03/G04/G06) says: do not retire until a
  canonical protected successor exists. **Unresolved.**
- **G01 consent — S-244, S-245, S-621.** G01's binding condition 4 fixes the WRITER: the certified
  `ClientChannelRuntimeService.submitConsent`, never a third owner. K12 (closed) fixes the REACH:
  consent is a class-s destination entered by HANDOFF, never written through a widget. So S-244 and
  S-245 take `fs.consent`, the same successor their sibling rows S-645/S-646/S-654 carry. S-621, the
  relay hop, takes the canonical writer it forwards to. The dossier keeps its own condition: the relay
  retires only after a working ingress exists in the bundles that call it.

### Corrections made during review, applied to every row alike

- **A route cannot succeed a component that was never a place.** 21 rows were given class-s routes by
  the dossier's *keyword-derived* successor (for example a community moderation controller → Account,
  `tg-config.php` → Connections). The verifier now refuses ROUTE for non-presentation kinds; such a
  component's successor would be a fence or a capability.
- **A generic symbol does not prove a fence.** `status`, `refresh` and `snapshot` occur in hundreds of
  tests. A test binds a fence only if it names the symbol **and** reaches the fence's own module.

### The 326 open rows, by exact reason

- **ABSENT — no capability, route or fence exists** (126): S-003, S-007, S-008, S-016, S-019, S-027, S-029, S-040, S-053, S-057, S-064, S-068, S-069, S-075, S-076, S-077, S-084, S-087, S-093, S-094, S-100, S-108, S-122, S-134, S-136, S-142, S-146, S-150, S-152, S-155, S-159, S-161, S-169, S-170, S-171, S-190, S-191, S-192, S-197, S-217, S-262, S-264, S-267, S-269, S-272, S-281, S-282, S-285, S-306, S-317, S-320, S-321, S-332, S-343, S-349, S-352, S-356, S-357, S-359, S-369, S-370, S-373, S-375, S-378, S-379, S-381, S-386, S-387, S-391, S-428, S-429, S-435, S-436, S-438, S-439, S-440, S-446, S-451, S-455, S-461, S-476, S-477, S-478, S-485, S-500, S-501, S-503, S-513, S-518, S-529, S-538, S-539, S-540, S-547, S-555, S-561, S-562, S-563, S-580, S-581, S-584, S-588, S-589, S-590, S-592, S-596, S-600, S-603, S-608, S-609, S-611, S-612, S-613, S-614, S-615, S-616, S-617, S-618, S-624, S-629, S-638, S-639, S-640, S-663, S-664, S-669
- **MULTI — at least one served function has no successor** (81): S-009, S-011, S-012, S-017, S-024, S-026, S-028, S-030, S-037, S-045, S-046, S-047, S-048, S-063, S-079, S-080, S-082, S-085, S-086, S-091, S-092, S-096, S-109, S-111, S-113, S-129, S-139, S-179, S-180, S-185, S-194, S-204, S-221, S-224, S-227, S-238, S-239, S-240, S-241, S-261, S-316, S-331, S-334, S-337, S-342, S-355, S-408, S-409, S-410, S-411, S-412, S-413, S-414, S-415, S-416, S-417, S-419, S-421, S-426, S-441, S-442, S-480, S-489, S-491, S-508, S-511, S-514, S-517, S-522, S-523, S-527, S-528, S-553, S-554, S-556, S-665, S-667, S-728, S-735, S-760, S-761
- **Signed "no successor", own proof not recorded** — unreachability probe, orphan proof, or the owning widget's parity (40): S-055, S-056, S-078, S-106, S-107, S-125, S-147, S-174, S-176, S-195, S-287, S-288, S-392, S-405, S-481, S-490, S-542, S-543, S-544, S-545, S-574, S-577, S-662, S-668, S-707, S-709, S-725, S-729, S-746, S-747, S-749, S-759, S-762, S-772, S-773, S-774, S-776, S-781, S-782, S-783
- **Fence located, no test binds it** (28): S-005, S-023, S-034, S-140, S-178, S-258, S-309, S-310, S-325, S-330, S-396, S-403, S-447, S-473, S-506, S-536, S-558, S-560, S-601, S-604, S-605, S-619, S-623, S-627, S-628, S-634, S-650, S-666
- **Route proposed for a non-presentation component** (21): S-460, S-703, S-706, S-708, S-710, S-711, S-712, S-714, S-715, S-733, S-734, S-736, S-737, S-739, S-742, S-743, S-745, S-753, S-754, S-756, S-763
- **Fence named, no refusal at that code** (14): S-035, S-089, S-097, S-099, S-127, S-154, S-234, S-252, S-348, S-404, S-449, S-497, S-531, S-557
- **Split authority** (9): S-177, S-181, S-465, S-474, S-475, S-483, S-488, S-509, S-583
- **Legacy-only fence** (7): S-117, S-393, S-399, S-479, S-515, S-591, S-649

The largest single cause is capability absence (126 + 81). Shop, tips, team messaging, onboarding,
login/auth, the deep-link vocabulary, push-permission prompts, the owner-panel job catalogue,
waitlist, reviews and media/voice have no registered capability. **That is product work, not
evidence work**, and no package in K1–K16 delivers it.

---

## 2. THREE-BUNDLE PROBE — FAIL

Evidence: `evidence/maya-chat-first-ux/three-bundle-probe.json`. It records root evidence (a read-only
SSH listing on Beget) together with route evidence (a HEAD request per copy). No 404, 403 or maintenance
response was taken as proof on its own.

**Production is not where the dossier left it.** Both app entries (`malesthetic.pro/app/`,
`mayaos.ru/app/`) have served a maintenance page since 2026-09-08. The page is byte-identical to the
committed `сайт и приложение/maintenance.html` (1ac62a51), placed there on the owner's instruction
recorded in `chapter7-wave3-fixture-recovery/maintenance-provenance.json`. `malesthetic.pro/app.html`
is a corroborated 404: no such file exists in the docroot.

But the docroots still hold **92 full legacy app bundles**, and **44 of them answer 200 as text/html**:

| host | copies on disk | served (200) | denied (403) |
|---|---:|---:|---:|
| mayaos.ru | 35 | 35 | 0 |
| malesthetic.pro | 55 | 7 | 48 |
| mocine3388.beget.tech (plain HTTP) | 2 | 2 | 0 |

| check | verdict | evidence |
|---|---|---|
| unsafe legacy route not reachable through another bundle | **FAIL** | 44 reachable copies; two are byte-identical to committed app.html (2e7de86d, 33396c16) |
| role-mode UI cannot resurrect through an old build | **FAIL** | 603 role-mode tokens, 2,568 client-side authority tokens served |
| no direct provider/business write path in a retired bundle | **FAIL** | 1,237 relay/provider references; the live relay and older executable relay copies are present. Not exercised. |
| primary Maya bundle uses the certified widget path | **FAIL** | no Maya bundle is served; `maya-chat-shell` has no HTML entry, DOM mount or network client; 0 of 44 copies reference `/widgets/` |

Proxy-source backups were probed with HEAD only. **Every one returned 403**, so they are not exposed on
the evidence gathered.

**The repository is public.** File names, URLs, naming patterns and the serving mechanism are therefore
withheld from the committed evidence. They were reported to the owner directly.

---

## 3. ROLLBACK READINESS — PASS

Evidence: `evidence/maya-chat-first-ux/rollback-readiness.json`.

```
PRE-CUTOVER COMMIT PINNED                     PASS  backend 7c9da983 (release 20260914-c9-wave4) is on origin;
                                                    frontend entry = maintenance.html @ 1ac62a51, byte-identical
PRE-CUTOVER ARTIFACT RECOVERABLE              PASS  three release dirs on the VPS, previous-release present,
                                                    deploy.sh auto-rollback; frontend recoverable from git
DATABASE ROLLBACK/ROLL-FORWARD PLAN DEFINED   PASS  roll forward = deploy.sh; step 1 = previous-release (tables
                                                    stay, unread); step 2 = DROP 13 Widget* tables in FK order,
                                                    verified against all 16 foreign keys, then migrate resolve
WIDGET MIGRATIONS ADDITIVE                    PASS  13 CREATE TABLE, 50 ALTER on Widget* only, 0 DROP/UPDATE/DELETE,
                                                    FKs into business tables: 10 x Widget* -> Tenant RESTRICT
BUSINESS DATA DELETION REQUIRED FOR ROLLBACK  NO
```

Still open under the lifecycle: §7.1 condition (2), **a rollback exercised**. Nothing has been cut over,
so there is nothing to roll back yet. The Beget-side legacy copies are both rollback artefacts and
exposed bundles. Closing the exposure must **move** them with digests kept, never delete them.

---

## 4. K14 READINESS — FAIL

- 45 commands, each dispositioned: 43 HANDOFF to the shell, 2 RETIRE into fenced bodies. 0 execute into
  an unreachable body; the figure would be 30 under the dossier's premise.
- **Every HANDOFF lands on a surface that is not served** (§2, §8). O06's binding condition — the
  capability index must be reachable before the Telegram keyboards retire — is not met.
- Mapping the commands onto the one gateway, and exercising Gate 10 across the command surface, must run
  inside `bot.py`. That file is read-only and not deployable under the envelope.
- `mute_master` and `scan_and_alert` are LIVE and were not retired. Telegram remains delivery and handoff
  (G11); nothing about the channel was changed.

## 5. K15 READINESS — FAIL

- K15 exit: bundles carrying the shell = 1. **Served successor bundles: 0.** Legacy shells: 3 in the
  repository, 44 copies served in production.
- Client-side values that route before a server call: **192 in the repository, 2,568 in served copies**
  (target 0). The successor holds 0 and reads no client storage.
- `maya-os-site/index.html` unreachable: **NOT PROVEN.** No copy of its last 40 committed versions is
  served, but 30 look-alike copies (2.44–2.51 MB, 60 tokens) are reachable. Resemblance is not identity,
  in either direction.
- K15 fence successors: 47 of 120 verified (§1).

## 6. K16 DELETION READINESS — FAIL — 0 / 437

Per §7.1, deletion needs all three conditions per row. For every row they stand at: (1) parity green on
the same commit, **0 per-row fixtures**; (2) a rollback exercised, **0**; (3) observed unused for the
agreed window, **no production observation**. Separately, G2 is 111/437 and no successor is served.
**LEGACY SURFACE DELETIONS: 0.**

## 7. NATIVE/PWA CUTOVER EVIDENCE — NOT PROVEN

Evidence: `evidence/maya-chat-first-ux/native-pwa-cutover-evidence.json`. There is no native source in
the repository: 0 tracked *.swift, *.kt, *.java, *.pbxproj, AndroidManifest or capacitor.config files.
`assetlinks.json` delegates to `pro.malesthetic.twa`. The committed app.html calls
`Capacitor.Plugins` 31 times, including the custom MayaRuntime and MayaNfcWriter plugins, which are not
in the repository. All four §6.5 parity proofs are unproven for native.

Not turned into FAIL: nothing contradicts a future native cutover, and the web rows do not depend on it
by contract. **18 native-shell rows are blocked by an out-of-repository native change** and are not
retired: S-455, S-460, S-461, S-465, S-473, S-474, S-475, S-476, S-477, S-478, S-479, S-480, S-481,
S-489, S-490, S-602, S-603, S-637. Two of them, S-602 and S-637, already have a verified canonical fence
and still need the native evidence.

---

## 8. THE EXACT REMAINING CONDITIONS

In order of what unblocks the most:

0. **The admission gates conform on 6 of 15** (§0). Gate 9 needs one ruling (DECISION-SHEET-03). The
   rest is implementation against rows the contract already fixes: gate 6's principal authority and
   AE clauses, the open clauses of 7, 8 and 8-R, gate 10's durable audit, gate 11's fresh read, gate
   12's projector, gate 13's dispatch. No successor may go live on this runtime before this is done.
1. **No successor surface is served, and no package delivers one.** K5's exit was source and build.
   `maya-chat-shell` has no entry, mount, transport or session, and both app entries show maintenance.
   K15 ("one shell bundle"), K14 (43 HANDOFFs), K16 (every presentation row) and the dark window
   ("successor live") all assume a served successor. **Owner direction needed:** what the cutover
   successor surface is — a served web shell (which the TWA would wrap, §6.1), the native Maya app
   (the 2026-09-08 intent on record), or both — and who delivers it. That is new delivery scope, and it
   was not started.
2. **44 legacy bundles are publicly reachable at non-canonical URLs** (§2). **Owner go-ahead needed** to
   move them out of the served docroots with digests kept. That is a production change but not a
   deletion, and it is independent of the cutover.
3. **G2: 326 rows** (§1). 207 are capability gaps (product work). 42 are fences that need a binding test
   or a real refusal. 37 need a canonical fence: 21 route-on-component, 9 split, 7 legacy-only. 40 need
   their own per-row proof.
4. **K14:** the command-to-gateway mapping must run in `bot.py`, which is out of the envelope.
5. **K15:** 192 + 2,568 authority values; `maya-os-site` unreachability not proven.
6. **K16:** per-row parity fixtures, an exercised rollback and a production observation, for every row.
7. **Native:** 18 rows need the out-of-repository native change and its evidence.

Production database: **nothing was deployed.** The deployed release reads health 200, database ready
(2026-09-16T16:48:33Z). Deploying HEAD would apply exactly two widget migrations. PENDING MIGRATIONS,
DRIFT and HEALTH for a new release are measured on the server at that deploy, never inferred from a
local run.

---

## 8a. THE FINAL ACCEPTANCE GATE ON THIS TREE — run in full, NOT PASS

```
WAVE GATES 1–5 re-run:                    PASS PASS PASS PASS PASS
MANDATORY REGRESSION:                     PASS  472 suites, 4106 tests, 0 failed
CONDITIONS GREEN:                         19 / 24
NOT PROVEN:                               G2 successor closure (111/437) · G3 reachable from chat (nothing served)
                                          G10 bundle disposition (44 served legacy copies) · G11 primary nav 112
                                          G22 14-day PRODUCTION observation not run
K1–K16:                                   13/16          WAVES: 5/6
SURFACE DISPOSITION / PARITY:             795/795 dispositioned; parity 0/437
PRIMARY NAV:                              112 (successor shell: 5)
OWNER/STAFF/CLIENT PRESENTATION MODES:    0
GATES EXECUTABLE:                         6/15 conform to §3.9 on the live path
WIDGET CONTRACT:                          PASS (31/31)
BUTTON → ENDPOINT / UI → PROVIDER / VOICE AUTHORITY PATHS:   0 / 0 / 0
CLIENT BOOKING · ANALYTICS · C9 · PRIVACY/CONSENT:           PASS (closed K7/K10/K11/K12 exits)
NATIVE/PWA:                               NOT PROVEN
ACCESSIBILITY / REDUCED MOTION:           PASS (renderer conformance 17/17)
BUSINESS OWNER CHANGES / BUSINESS → WIDGET FK:              0 / 0
PRODUCTION PENDING MIGRATIONS / DRIFT / HEALTH:             NOT VERIFIED AT A DEPLOY — nothing was deployed
MAYA CHAT-FIRST FINAL ACCEPTANCE: NOT PASS
MAYA CHAT-FIRST COMPLETE: NO
CHAPTER 10 STARTED: NO
```

One run on the way to this one reported a single failed test:
`auth/legacy-staff-principal.http.spec.ts`, "Parse Error: Expected HTTP/". It is an HTTP socket parse
error, in a suite this work does not touch. It passed 21/21 three times in isolation, and the full
run above passed. It is recorded here, not waved away.

## 9. CORRECTIONS TO EARLIER REPORTS — found while producing this determination

- **Lint was not PASS at 6dc37bc8.** The last edit of that commit replaced the Gate 14 stub with an
  honest terminate. That left the `pending()` helper unused, which is a lint **error**. My last lint
  run predated that edit, so the "lint PASS" reported with the checkpoint did not describe the commit
  as pushed. Every wave gate from 2 to 5 therefore failed its lint line on that commit. The helper is
  now removed and lint exits 0.
- **The parity job over-counted GREEN: 154, not 56.** Two evaluators turned whole requirement groups
  green from one programme-level fact each: all 120 K15 rows from "the PII fences fire
  independently", and all 30 class-s rows from "the handoff rule exists". Each now also needs the
  row's own verified successor: 47 of 120 and 5 of 30. That is the same rule the K16 evaluator already
  stated — one true fact about the system is not evidence about a row.
- **The final gate printed figures it had not measured.** G2 and G3 said "no parity-proof job exists"
  while the job existed. G23 said "no renderer conformance suite" while `conformance.test.mjs`
  (17 tests) existed, because the check looked in the wrong directory. The parity-row count came from
  a K16 ledger file that had been replaced, and the failed call was swallowed as 0. The Gate 10
  limitation still read "measured, not enforced" after the owner's refusal ruling was wired. Each
  figure is now derived from a real run, and an unmeasured one prints as unmeasured.
- **The K3 and K4 exit gates had failed prettier since e5bf1b85.** The generator for the executable
  floor copy wrote one header import longer than the line limit, so wave 2's re-run reported
  `K3 COMPLETE: NO` and `K4 COMPLETE: NO`, and I did not read those lines. The header is fixed at the
  generator. The certified body is untouched, and `--check` still matches the derivation.
- **The Wave 6 checkpoint called app.html "the shipped PWA".** Production has served a maintenance
  page there since 2026-09-08 (§2). A correction is appended to that checkpoint.

## 10. KNOWN APPROVED LIMITATIONS — stated, not masked

```
FUNDAMENTAL RULES FAIL-CLOSED ONLY:  13/21
STEP_UP_VERIFIED:                    UNREACHABLE
GATE 10:                             REFUSAL ON EFFECT-CLASS DIVERGENCE (owner ruling). The deterministic
                                     router is exact-match; an utterance it cannot resolve is not compared.
APPROVAL:                            ROLE-GATED, NOT SEPARATION-OF-DUTIES
GAP-ATTENDANCE-CONFIRM:              OPEN — no surface may say «клиент подтвердил»
K13 14-DAY WINDOW:                   SIMULATED ONLY — not a production observation
F-CRM-JOURNAL-READ:                  OPEN (K4/K10); operations.journal.read → consent none does not
                                     weaken tenant/actor/read authority
```
