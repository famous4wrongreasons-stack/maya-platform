# WAVE 6 — the cutover wave. K14, K15, K16.

```
K14 AT CUTOVER CONDITION    K15 AT CUTOVER CONDITION    K16 AT CUTOVER CONDITION
DELETIONS PERFORMED: 0      PRODUCTION EFFECTS FOR PROOF: 0
```

Wave 6 is the only wave permitted to delete anything. It deleted nothing, and this checkpoint is
the account of why — not as a shortfall discovered late, but as the condition the plan itself
names, reached and reported rather than worked around.

---

## The decisive clause, and it survived an adversarial pass

§7.1 closes a surface's dark window only when all three hold:

> 1. its successor's parity rows are green **on the same commit**, and
> 2. a rollback exists and **has been exercised** at least once, and
> 3. the legacy surface **has been observed unused** for the agreed window.
>
> **Only then may K16 delete it.**

Condition (3) is a statement about what real users did not do, over wall-clock time, against a
surface that was live and logging. **No artefact a repository can hold is that observation.** With
`PRODUCTION EFFECTS FOR PROOF: 0`, it was not sought and could not have been obtained.

Six adversarial verifiers were set on that conclusion with instructions to refute it. They refuted
a good deal of the scaffolding around it — see the corrections below — and the kernel stood:

> "Condition (3) genuinely cannot be satisfied by a repository artefact at 0 production effects, so
> no surface can reach the DELETED state. That kernel stands."

**The window is not unspecified.** D10's ledger state machine names the durations:

```
MAPPED → PARITY_PROVEN → ENTRY_POINT_DARK (14 days) → ROUTE_SEALED (30 days;
45 days for any capability touching period close) → DELETED
```

with a one-step rollback at every transition. The window is agreed; **it has not been entered.**
Entering `ENTRY_POINT_DARK` means removing a nav entry from a live bundle while the route still
resolves and logs — a production change. Leaving it means observing that nobody used it — a
production observation. Neither was performed.

---

## K14 — Telegram cutover

**45 commands, enumerated from the bot's own registration site**, not from a document. All 45 carry
a recorded disposition: 43 HANDOFF to the shell, 2 RETIRE (their bodies are fenced). `/cancel` is
already registered as the escape verb. The Telegram channel profile exists from K6 at its true tier
— `RICH_CONSTRAINED`, 6 intents, bounded by Telegram's own inline-keyboard limit rather than by a
preference.

**The premise K14 was written on does not hold in this tree.** The mapping states that
`canonical_staff_access._principal` is written only inside the aiohttp middleware while the bot runs
`start_polling`, so `is_admin()` returns False for every Telegram update and ~45 commands execute
into bodies that cannot be entered. In the working tree `canonical_staff_access` has **zero
occurrences across all 164 Python files**, and `is_admin` is a plain SQLite lookup keyed by Telegram
user id (`database.py:1555`) with no ContextVar and no middleware dependency. The signed K1 dossier
anticipated exactly this, recording that "the copy of `bot.py` on the branch this signature is being
prepared from does not match that checkout."

So `commands executing into an unreachable body = 0` — K14's exit clause — is **true, for a
different reason than the plan expected**. The ledger publishes the number it would be under the
dossier's premise (**30**, every admin-gated command) beside it, so the zero is not mistaken for a
vacuous one.

**Four of the six body-level fenced capabilities hold in this tree, not six:**

| capability | this tree | evidence |
|---|---|---|
| `run_loyalty_job` | FENCED | `loyalty.py:555` early return |
| `run_backfill_job` | FENCED | `loyalty.py:794` early return |
| `can_redeem_codes` | FENCED | `database.py:1564` returns False |
| `set_cashier_role` | FENCED | `database.py:1581` raises |
| `mute_master` | **LIVE** | `database.py:1788` performs its UPDATE |
| `scan_and_alert` | **LIVE** | `lead_alerts.py:144` runs a real query |

The dossier describes 6 of 6. The two checkouts disagree and the dossier says they do; this records
which is which in the tree Wave 6 would act on. **Nothing was restored and nothing was deleted.**

**K14 stops at:** the ~45 commands execute in `bot.py`, which is read-only and undeployable by
constraint. This is not K14 blocked by someone else's defect — the envelope is explicit that the
bot's reachability defect "is fixed on its own schedule … it is not a justification for this
architecture", and K14's job is that the *replacement* surface is reachable and proven. What
remains is precisely the part that must run in the bot: mapping the commands onto the one gateway,
and exercising Gate 10 across the command surface.

An adversarial pass corrected one thing worth recording here: `maya-saas-backend` is **not** free of
Telegram. It carries a command ingress with full initData and widget HMAC verification
(`crm/client-channel.controller.ts:145`, `crm/client-channel-authenticator.service.ts:116-191`) and
renderers in the delivery layer. So the carrier side of K14 is more tractable than "no Telegram in
the backend" would suggest; it is the command bodies, not the transport, that are out of reach.

---

## K15 — legacy authority retirement and bundle disposition

The census, executed:

```
SHELL   88 authority tokens   2656 KiB  app.html (the shipped PWA)
SHELL   60 authority tokens   2448 KiB  maya-os-site/index.html
SHELL   44 authority tokens   1071 KiB  app-tenant.html
         0 authority tokens    850 KiB  index.html (the site)

bundles carrying a shell (legacy):  3   target 1
client-side authority values:     192   target 0
successor bundles / sources:      1 / 1  target 1 / 1
client-side authority values in the SUCCESSOR: 0   — already met
successor reads client storage:   never
maya-os-site unreachability probe: NOT RECORDED
```

The point worth making is the asymmetry: **the successor does not need the value removed, because
it never had one.** `maya-chat-shell` holds no `me_is_staff`, no `__meRole`, no `__panelInfo`, and
reads no `localStorage`, `sessionStorage` or `document.cookie` anywhere. Its only `role` is F88.1's
declared presentation enum and the renderer's ARIA roles.

**K15 stops at:** driving 192 to 0 means hand-editing `app.html` — a 2.7 MB source-less single-file
artefact that IS the live PWA. A probe of unreachability is a recorded request that did not reach
the surface; it cannot be synthesised, and recording one is a production request.

---

## K16 — retirement under parity

**K16 consumes evidence and produces none.** A first version of this package built its own
eighty-row ledger with its own six checks — and that was a second implementation of something K1
already owns. `k1/k1-parity-harness.json` carries all **795** rows with exactly the six fields the
owner named, under its own rule:

> "emitted RED by default. A row turns green only when its evidence exists — a passing test, a
> recorded probe, a signed dossier — and the harness reads the evidence, never a checkbox.
> **No package may mark its own row green.**"

So K16 ships an **evaluator** that reads it and writes nothing back:

```
rows in the harness:              795
  rows whose condition is RETIRE: 437   (K16 317, K15 120)

successorExists   evaluated GREEN   0 / 795      harness stored GREEN   0
parity            evaluated GREEN   0 / 795      harness stored GREEN   0
authority         evaluated GREEN   0 / 795      harness stored GREEN   0
accessibility     evaluated GREEN   0 / 795      harness stored GREEN   0
darkWindow        evaluated GREEN   0 / 795      harness stored GREEN   0
deepLinkHandoff   evaluated GREEN   0 / 795      harness stored GREEN   0

ROWS RETIRABLE TODAY: 0     DELETIONS PERFORMED: 0
```

The evaluator agrees with the harness exactly, and it is **not vacuous**: given the seven structured
records for one row it turns all six fields green and reports that row retirable; set
`requestsObserved: 7` and the dark window reopens.

**Programme-level facts are reported separately and never counted as per-row evidence.** The
successor shell holding no client-side authority value is one true statement about the shell;
folding it into the `authority` column would have manufactured 795 unearned greens.

---

## The primary-navigation arithmetic, re-derived and reproducing exactly

| stated in the mapping | derived here |
|---|---|
| 112 primary-nav members | **112** |
| 101 Maya-owned (smm-bot's 11 are a separate production system) | **101** |
| 63 `RETIRE FROM PRIMARY NAVIGATION` rows | **63** |
| 19 distinct names / 20 ledger rows provably retirable | **19 / 20** — the duplicate is *Staff home (AStaffHome)*, in `index.html` and `app-tenant.html` |
| 112 − 20 = 92 remaining | **92** |
| 34 further rows need re-dispositioning to reach 5 | **34** = 18 `KEEP AS CAPABILITY` + 16 `KEEP AS FULLSCREEN DETAIL`; and 34 + 35 + 8 + 4 = 81 Maya-owned remaining |

**`PRIMARY NAV: 5` is true of the successor and false of the legacy bundle.** `BASE_ROUTES` has
exactly five members — `maya`, `account`, `connections`, `privacy-and-data`, `notifications` —
matching the signed D2 OPTION A. The legacy shell still has 112, and reducing it requires deletions
that require the dark window.

---

## What Wave 6 found wrong in Waves 2–5

Five corrections, all about this programme's own work, all found by mutating or adversarially
attacking it rather than by reading it:

1. **The wave-2 checkpoint said "the remaining ten run and refuse". There are eleven** — gates 5, 6,
   7, 8, 8-R, 9, 10, 11, 12, 13, 14 — against **four** live. Corrected in place. The substance is
   unchanged and fail-closed: a submission reaching gate 5 is refused. What the miscount obscured is
   worth stating plainly: the rules those eleven gates name are implemented and tested **in their
   own modules** and are **not wired into the pipeline**. "The gate pipeline enforces X" is true of
   gates 1–4; for the rest the enforcement point is the module and the pipeline is a refusal.

2. **K12's erasure replay was a tautology.** `after` was `JSON.parse(JSON.stringify(before))` — it
   compared an object with a clone of itself and could not have failed. Replaced with a replay that
   applies the erasure to a world holding both the widget stores and the canonical rows, asserts
   that nothing a person wrote survives in the erasable stores, and recomputes the canonical reads
   from that world — plus a negative control proving the comparison catches an erasure that reached
   a canonical row.

3. **K16's first ledger duplicated K1's harness.** Replaced with an evaluator.

4. **Three over-generous detectors in that ledger.** The dark-window check grepped for the words
   "dark window" and found three documents that *describe* the requirement, then reported it met. The
   deep-link check matched the route `maya` inside "maya-site.html — MayaOS marketing storefront".
   The successor check matched `fs.booking` inside any surface name containing "booking". All three
   now require a structured per-row record.

5. **The final gate inverted G24's polarity** — folding the nav ratchet into a row that measures
   *bad deletions* — and ran the full regression twice concurrently, which is why the wave-2 gate
   reported FAIL inside it while passing standalone. Both fixed; the regression now runs once, by
   whoever is outermost.

6. **And then the gate said «a test failed» when no test had failed.** After five wave gates had
   each run a compiler, a linter, a build and their own suites, a jest worker was OS-killed in the
   final regression and the gate reported it as a failing test. Run alone, the same regression is
   **471 suites, 4060 tests, 0 failures**. Bounded to two workers, and the three outcomes are now
   distinguished: *a test failed*, *a suite could not run*, and *jest produced no summary at all*.
   Reporting a killed worker as a failing test is the same class of error as reporting a killed
   suite as a passing one — it describes the wrong event. The gate also keeps the captured jest
   tail now, because when it claimed a test had failed the summary it had actually captured read
   *471 passed* — and the tail is what settles which of the two is true. Bounded to two workers the
   in-gate regression is **PASS: 471 suites, 4060 tests**.

---

## Chat-First Final Acceptance Gate

All five wave gates re-run on this commit: **PASS**. Mandatory regression, run once: **471 suites,
4060 tests, 0 failures**.

**18 of 24 conditions green. Six not proven, each for a named reason:**

| row | why not |
|---|---|
| **G2** Successor closure | no `chat-first:parity-proof` job exists |
| **G3** Capabilities reachable | needs the same parity job |
| **G10** Bundle disposition | 3 legacy shell bundles against a target of 1; unreachability probe not recorded |
| **G11** Primary-nav target | legacy nav 112 against 5; the successor shell is already at 5 |
| **G22** No C10 autonomy | `authority_basis` = 1 and 12/12 moments proved, but the **14-day production observation is NOT RUN** |
| **G23** Accessibility | no renderer conformance suite; §8 marks WCAG 2.2 AA `[UNENFORCEABLE-TODAY]` |

**`MAYA CHAT-FIRST FINAL ACCEPTANCE: NOT PASS` · `MAYA CHAT-FIRST COMPLETE: NO` ·
`CHAPTER 10 STARTED: NO`.**

There is no partial completion and no "complete with caveats" — §9 says so and the gate is written
to honour it literally.

---

## Approved out-of-scope limitations — listed, not masked

```
FUNDAMENTAL RULES FAIL-CLOSED ONLY:   13/21
STEP_UP_VERIFIED:                     UNREACHABLE
GATE 10:                              MEASURED, NOT ENFORCED
APPROVAL:                             ROLE-GATED, NOT SEPARATION-OF-DUTIES
GAP-ATTENDANCE-CONFIRM:               OPEN
K13 14-DAY PRODUCTION OBSERVATION:    NOT PROVEN UNTIL ACTUALLY OBSERVED
                                      (a simulated 504-attempt window is NOT one)
```

To which Wave 6 adds one that is not a limitation of the design but of what was measured:

```
GATE PIPELINE:                        4 of 15 gates live; the other 11 refuse with
                                      mechanism_absent, and their rules are enforced in
                                      their own modules rather than in the pipeline
```

---

## Correction recorded 2026-09-16 — production was not where this checkpoint assumed

This checkpoint calls `app.html` "the shipped PWA" and reads the K15 census as the production
exposure. A root-and-route probe later found otherwise. Both app entries have served a maintenance
page since 2026-09-08. Meanwhile 44 legacy bundle copies, carrying 2,568 client-side authority
values, stay reachable at other URLs, and no successor bundle is served. The census above counts
repository files only. The pre-cutover determination replaces the "STOPS AT" readings here with
measured ones: see [WAVE-6-PRE-CUTOVER-DETERMINATION.md](WAVE-6-PRE-CUTOVER-DETERMINATION.md).
