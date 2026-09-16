# DECISION SHEET 01 — `WIDGET_CAPABILITY_POLICY` · 56 rows × 2 columns

**Blocks:** Gate 5, and through it Gates 6 and 7. **One decision.**

---

## First, the two facts that shrink the question

**1. `min_verification` HAS a source.** It is not in `C9Capability`, but the 47 C9 keys that are
also catalogue names carry `allowedRoles` — authored authorisation data that already exists and is
already enforced elsewhere. Executed over the live registries, the 56 partition cleanly:

```
client-only roles   {client, customer}                         4
client + staff      both present                              10
staff-only          no client/customer role                   33
no catalogue entry  the 9 C9-native keys                       9
                                                        ---------
                                                              56
```

**2. `consent_class` has NO source.** Searched the whole backend: outside the generated contract
module the string appears in exactly two files, both mine from K13, both about notification
preferences. `C9Capability` has 22 fields and none is a consent class. The AE contract has none.

> **OWNER-AUTHORED SECURITY POLICY REQUIRED — for `consent_class` only.**

**3. Two of the nine categories you asked about are not in this table at all.** F28 makes it total
over C9-CAP's 56 rows *"and over those only"*. **Booking COMMIT** and **consent mutation** are
AE-CAP keys, covered instead by `AE_WIDGET_COMMIT_ALLOWLIST ∪ AE_CAPABILITY_GAP_LEDGER` under F31.
Nothing you decide here touches them.

---

## OPTION A — derive `min_verification`, author `consent_class` by group  ← **RECOMMENDED**

| | |
|---|---|
| **SOURCE OF 56 ROWS** | `C9_CAPABILITIES` enumerated at build; totality asserted at `EP-REGISTRY-LOAD` |
| **HOW `min_verification` IS ASSIGNED** | Deterministic, from data that exists: `resourceClass === 'LOCAL'` → `ANONYMOUS`; `allowedRoles ⊆ {client, customer}` → `BOUND_CLIENT`; any staff/owner role present → `SESSION_VERIFIED`; no catalogue entry → by `mode`: `READ` → `CHANNEL_IDENTITY`, `PROPOSE_ONLY`/`OWNER_HANDOFF` → `SESSION_VERIFIED` |
| **HOW `consent_class` IS ASSIGNED** | **By you**, as ~8 group rulings, not 56 values. Proposed groups, each a `capabilityKey` prefix that already exists: `clients.*` and `customers.*` (6 keys) · `loyalty.*` (finance?) · `expenses.*` · `analytics.*` · `b35.*` (3) · `appointments.own.*` (4) · `a22.*` · everything else |
| **ANY VALUE INFERRED/GUESSED** | **`min_verification`: none** — every input is an authored field already used for authorisation. **`consent_class`: none** — you assign it; I assign nothing |
| **FAIL-CLOSED BEHAVIOUR** | A C9 key with no row fails the build (F28). An unclassified group defaults to nothing — the build refuses rather than picking |
| **READ BEHAVIOUR** | A client-facing read (`catalog.services.read`) floors at `BOUND_CLIENT`; a staff-only read (`analytics.business.profit`) at `SESSION_VERIFIED`. Both are then raised further by `risk`, `C9_MODE_FLOOR` and `consent_class` through `maxLevel` |
| **WRITE/HANDOFF/COMMIT** | Every `PROPOSE_ONLY` and `OWNER_HANDOFF` key already floors at `SESSION_VERIFIED` via `C9_MODE_FLOOR`, independently of this table. This column cannot lower that |
| **CONSENT CONSEQUENCES** | Exactly what you assign. `personal_data`/`communication`/`identity_binding`/`finance` each floor at `SESSION_VERIFIED` through `CONSENT_CLASS_FLOOR`; `none` adds nothing |
| **VERIFICATION CONSEQUENCES** | 4 keys reachable at `BOUND_CLIENT`; 33 + 13 at `SESSION_VERIFIED`; 1 (`c9.no_action`) at `ANONYMOUS`; the 8 remaining C9-native reads at `CHANNEL_IDENTITY` before other terms raise them |
| **CONTRACT VERSIONING** | The derivation rule is versioned once. A later `allowedRoles` change moves a floor automatically — which F28 calls a version bump, so the monotonicity test must catch a *lowering* and fail the build |
| **BUSINESS/USER LOSS** | None beyond today: no capability becomes unreachable that is reachable now |
| **SECURITY RISK** | The residual is the version-bump coupling: `allowedRoles` is owned by the AI-tools catalogue, so a loosening there would loosen a floor here. Mitigated by the monotonicity test, not by hope |
| **WHY** | It is the only option where **nothing is guessed and your attention is spent only where no data exists.** ~8 rulings instead of 112 values |

## OPTION B — author all 56 × 2

| | |
|---|---|
| **SOURCE OF 56 ROWS** | Same enumeration; both columns from you |
| **`min_verification`** | You assign all 56 |
| **`consent_class`** | You assign all 56 |
| **INFERRED/GUESSED** | None |
| **FAIL-CLOSED** | Same build failure on a missing row |
| **READ / WRITE / HANDOFF** | Exactly what you write |
| **CONSENT / VERIFICATION** | Exactly what you write |
| **VERSIONING** | Every row is independently version-bumpable — the most faithful reading of F28 |
| **BUSINESS/USER LOSS** | None, if authored correctly |
| **SECURITY RISK** | Transcription error across 112 hand-entered values; no coupling risk |
| **WHY NOT** | It spends 112 decisions to reproduce, for `min_verification`, what `allowedRoles` already says |

## OPTION C — uniform fail-closed

| | |
|---|---|
| **SOURCE OF 56 ROWS** | Enumeration; both columns constant |
| **`min_verification`** | `SESSION_VERIFIED` for all 56 |
| **`consent_class`** | `none` for all 56 |
| **INFERRED/GUESSED** | None — but `consent_class: none` is a *decision to remove the consent term*, not an absence of one |
| **FAIL-CLOSED** | Maximal on verification; **minimal on consent** |
| **READ BEHAVIOUR** | Every C9 read requires a verified first-party session. Nothing is reachable from Telegram channel identity or an anonymous web session |
| **WRITE/HANDOFF** | Unchanged — already `SESSION_VERIFIED` |
| **CONSENT CONSEQUENCES** | **The consent term contributes nothing to any floor.** §0.14 F80's `consent_class` fence becomes vacuous |
| **VERIFICATION CONSEQUENCES** | Strictest possible; capability loss at G3 |
| **VERSIONING** | One constant; any later differentiation is a bump |
| **BUSINESS/USER LOSS** | **Real.** A client browsing services in Telegram can no longer reach `catalog.services.read` |
| **SECURITY RISK** | Looks safest and is not: it is strict on the axis that is already strict and **silent on the axis with no data** |
| **WHY NOT** | It answers the question I could answer and erases the one I could not |

---

## Representative rows — Option A, with real values

| category | key | mode / resourceClass | roles | **`min_verification`** | **`consent_class`** |
|---|---|---|---|---|---|
| public / read-only | `catalog.services.read` | READ / SOURCE_READ | client+staff | `BOUND_CLIENT` → *derived* | **you** |
| authenticated client read | `appointments.own.list` | READ / SOURCE_READ | client+staff | `BOUND_CLIENT` | **you** |
| finance read | `analytics.business.profit` | READ / SOURCE_READ | staff-only | `SESSION_VERIFIED` | **you** (`finance`?) |
| client PII | `clients.dossier.read` | READ / SOURCE_READ | staff-only | `SESSION_VERIFIED` | **you** (`personal_data`?) |
| booking preparation | `appointments.own.create` | PROPOSE_ONLY / SOURCE_HANDOFF | client-only | `SESSION_VERIFIED` (via mode) | **you** |
| **booking COMMIT** | — | — | — | **not in this table** — AE key | — |
| communication / marketing | `b35.preview`, `b35.confirm` | PROPOSE_ONLY, OWNER_HANDOFF | no catalogue | `SESSION_VERIFIED` | **you** (`communication`?) |
| **consent mutation** | — | — | — | **not in this table** — AE key | — |
| configuration / A22 handoff | `a22.configuration` | OWNER_HANDOFF / SOURCE_HANDOFF | no catalogue | `SESSION_VERIFIED` | **you** |

The `?` values are the shape of a plausible answer, **not a proposal I have implemented**. Every
one is blank until you fill it.

---

```
NO GUESSED SECURITY FLOOR      NO GUESSED CONSENT CLASS
OBSERVED SAMPLE != POLICY DOMAIN               LLM != POLICY AUTHOR
```

Gate 5 stays a refusing stub until this is answered.
