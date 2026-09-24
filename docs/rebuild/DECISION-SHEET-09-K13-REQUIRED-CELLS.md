# DECISION SHEET 09 — K13 proactive suppression input

**Checkpoint:** Wave 4 implementation after `U13b`, before `P-MT3` and `CKPT-W4`  
**Classification:** existing Contract V1.1 contradiction exposed by the first live P-MT3 producer  
**Decision:** Option A approved at checkpoint `e20220df`
**Decision scope:** the source against which K13 `required_cells` are validated and resolved  
**Chapter / product scope:** unchanged; no production deployment or business effect

## Why a decision is required

Contract V1.1 fixes all of the following simultaneously:

1. a moment row names the final `WidgetKind` it composes;
2. each `MomentTemplate.required_cells` entry is a JSON Pointer into that final widget body;
3. every pointer is admitted by that kind's leaf schema at `EP-REGISTRY-LOAD`;
4. every resolved leaf is a `Cell`, and a non-`KNOWN` leaf suppresses the emission.

The executable K13 registry does not satisfy that contract. Its load assertion checks only that a
pointer begins with `/`; it never checks the selected kind's leaf schema. All twelve templates name
root members that do not exist in their selected body type:

| Moment | Final kind | Current `required_cells` | Contract result |
|---|---|---|---|
| `appointment_reminder` | `LIMITATION` | `/when`, `/service` | both absent; `LimitationBody` has no `Cell` leaf that represents either fact |
| `birthday_alert` | `CHOICE` | `/client_label` | absent |
| `daily_report` | `REPORT` | `/period`, `/revenue` | both absent |
| `growth_plan` | `REPORT` | `/period`, `/headline` | both absent |
| `hanging_lead` | `CLIENT_LIST` | `/client_label`, `/waiting_since` | both absent |
| `morning_brief` | `REPORT` | `/period`, `/appointments` | both absent |
| `native_feedback_invitation` | `CHOICE` | `/visit_at` | absent |
| `owner_alert` | `METRIC` | `/headline` | absent |
| `review_alert` | `METRIC` | `/rating` | absent |
| `shift_reminder` | `SCHEDULE` | `/starts_at` | absent |
| `wanted_slot_available` | `TIME_SLOT_SELECTOR` | `/when`, `/service` | both absent |
| `weekly_expense_reminder` | `METRIC` | `/period` | absent (`period_label` is a `Phrase`, not a `Cell`) |

This is not a P-MT3 implementation choice. The normative clauses are explicit in
`MAYA-WIDGET-CONTRACT-V1.md` §4.9.3 lines 6508–6540 and PR5b lines 6565–6567. The conflicting
registry and incomplete load assertion are in
`maya-saas-backend/src/widgets/proactive/moments.ts`.

P-MT3 cannot truthfully mint even one K13 moment while also claiming that `EP-REGISTRY-LOAD`
validated the complete closed registry. Selecting a convenient row does not repair the other eleven,
because the assertion is total over all twelve and the process must fail when any row is invalid.

## Option A — server-owned typed composition input (recommended)

Preserve the twelve moment keys, their final widget kinds, notification owners, and current required
fact names. Amend the narrow PR5b representation so the pointers resolve against a closed,
server-owned **moment composition input** schema rather than pretending those source facts are
members of the final widget body.

Rules:

- one typed composition-input schema is registered for each closed moment template version;
- every required pointer must resolve to a `Cell` or `Measure` admitted by that input schema;
- the input is built only by the canonical source/owner projector from re-read source facts;
- client, LLM, shell and delivery adapter cannot supply or reinterpret it;
- suppression runs before body projection and sealing;
- the final body must still pass its existing exact `WidgetKind` schema;
- an unknown required input produces the existing content-free `SuppressedEmission` audit row;
- no composition input is persisted as a new business fact and it grants no authority;
- registry load validates all 12 moment/template/input-schema chains, not pointer syntax alone.

Impact:

```yaml
NEW DB MODELS: 0
NEW PHYSICAL FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATIONS: 0
MOMENT KEYS CHANGED: 0
MOMENT → WIDGET KIND MAPPINGS CHANGED: 0
NOTIFICATION / CONSENT OWNERS CHANGED: 0
```

Business gain: existing moment vocabulary and presentation stay intact, while silence is decided
from the exact source facts the moment needs.  
Business loss: none beyond rejecting any moment whose canonical source cannot supply a complete
typed input.

## Option B — redefine final widget kinds/bodies

Keep the literal “pointer into final body” rule. Change each template pointer and, where necessary,
the moment's final widget kind or the body schema so every moment exposes suitable `Cell` leaves.

This is not recommended. `appointment_reminder → LIMITATION` has no matching business-fact cell,
so the option changes approved presentation semantics or expands shared widget schemas merely to
carry hidden suppression inputs. It also forces product review of all twelve moment/kind mappings.

## Option C — retain the current syntax-only check

Treat any `/...` string as valid and allow the missing lookup to suppress the moment.

This is rejected. It contradicts the startup rule, makes every current K13 moment silently
unemittable, and converts registry typos into apparently legitimate “chosen silence”.

## Recommended approval

```text
K13 REQUIRED-CELLS: APPROVE OPTION A
```

After approval, `P-MT3` can implement the typed input registry, the complete startup ratchet, one
owner-side moment trigger and the required restricted-tier/live proofs without adding schema or a
second widget/business owner.

## Wave 4 preservation state

The following approved units are committed and remain uncertified pending P-MT3 and `CKPT-W4`:

```yaml
journal-date contract ruling: IMPLEMENTED
P-RESOLVE: IMPLEMENTED
P-JOURNAL-PROJECTION: IMPLEMENTED
P-MT2a: IMPLEMENTED
P-B4-SHELL-WIRE: IMPLEMENTED
P-TYPED: IMPLEMENTED
P-MT1: IMPLEMENTED
U11b: IMPLEMENTED
U13b: IMPLEMENTED
P-MT3: IN IMPLEMENTATION
WAVE 4 CERTIFIED: NO
PRODUCTION DEPLOYMENT: NO
REAL BUSINESS EFFECTS: 0
```
