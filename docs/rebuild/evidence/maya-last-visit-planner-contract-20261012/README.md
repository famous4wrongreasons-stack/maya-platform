# Last-visit planner/tool contract — offline regression

Implementation and fresh tested candidate:
`f91b95a9830d1f28b7eb42fcc09c26a9b72e567d` on
`codex/maya-local-crm-setup-20261010`.
Baseline: `16a7db260f8177cc76b3b3d99d48685b2fe30b7b`.
This report is a local regression receipt, not live model acceptance or release certification.

## Recorded defect and provenance

The live second question, «Когда я был у вас последний раз?», on
`8c6aff11c2bdcc7f205c61f75214f00bc41d5eb9` resolved to `booking.list_own`
with semantic `period=last_visit`, but the model also supplied
`appointments.own.list` tool arguments `{"period":"last_visit"}`.
The canonical empty-input registry correctly refused them with
`ai_tool_arguments_invalid`. No appointment tool ran for that question.
The first history question succeeded; neither that success nor the current
offline tests establish live success for the second question.

Original diagnosis remains unchanged in `../maya-history-live-20261012-06/`.
The preserved provider-response file hashes to
`a604750080c84cd4bfa29e4c133000e99c0f4b98e84456a6634fad0e6ba08549`.
Only its second row's reviewed `content` string was copied byte-for-byte into
`maya-saas-backend/src/ai-tools/__fixtures__/recorded-last-visit-invalid-tool-arguments.json`.
Content hash: `75daca7820bf0e01f9b333849590cafd708088bd7bd337cfdf772192d3373379`.
It contains the generic question and semantic/tool plan; no credentials,
transport metadata, customer identifiers, contact data or visit rows.

## Narrow repair

Three existing planner descriptions/instructions now distinguish semantic task
selectors from tool inputs. `period=past/last_visit` stays in `entities_json`;
`appointments.own.list` still takes only `{}`. Both provider serializers receive
the clarification and the same closed empty input schema.

No registry sanitizer, argument widening, role change, identity lookup change,
source change, reply-composer change or additional model retry was introduced.
The original invalid model output still fails closed. A test-only diagnostic
copy changing just `arguments_json` to `{}` preserves semantic `last_visit`
and passes the existing registry; it is never substituted in a live flow.

## Executed checks on the committed candidate

- Nine scoped Jest suites: **584 PASS / 0 FAIL**. Includes model/core/registry,
  conversation intelligence, emitted planner wire, authenticated personal
  source trace, source projection and history presentation.
- New regression suite: **11 PASS**. Actual recorded-output refusal; explicit
  DeepSeek/OpenAI emitted request contract; caller-selected Client/tenant/User
  and unsupported selectors refused; parser → registry → handler → private
  presentation with synthetic source rows.
- Existing actual serialized-request size limits remain unchanged and pass.
  Private source rows never enter the test model request. An absent attendance
  confirmation cannot produce an invented last-visit date.
- Counterfactuals run only in an isolated copy with the same unchanged fixture
  and spec: exact prior product gives **2 intended failures**; silently accepting
  unsupported arguments gives **6**; weakened empty-input schema gives **2**.
  All **3/3 detected**; baseline/restored are **11/11 PASS**.
- Backend build typecheck and scoped ESLint: **PASS**.
- Scripts typecheck: **not green**. Same four pre-existing TS2339 diagnostics in
  `reschedule-preference-carry.spec.ts` at lines 142/144/146/148; no new diagnostics.
  Prior baseline comparison is documented in `../maya-local-keychain-integration-20261012/`.

Reproduce the focused regression with the normal Jest runner against
`src/ai-tools/personal-history-planner-contract.spec.ts`. Reproduce counterfactuals
from the backend using `node scripts/personal-history-planner-mutations.mjs`
with a fresh absolute output directory. The runner uses committed sources,
synthetic configuration and mocked fetch; it never edits the checkout.
`summary.json`, `counterfactual-proof.json` and `receipt-manifest.json` retain
counts, candidate and exact local raw-receipt hashes.

## Limits and preserved pending work

- No new live DeepSeek/OpenAI/CRM request, real credentials, database access,
  paid session, production effect or real-history replay occurred. A fresh live
  last-visit answer has **not** been established by this prompt clarification.
- The generated conversation dataset export already differs from the runtime
  taxonomy at baseline (including missing later intents). It was not regenerated
  or presented as current. No dataset-validation or full-certification pass is claimed.
- Keychain OS storage approval remains pending. The prepared native component
  was neither installed, launched, rebuilt nor re-signed. No real Keychain API
  was called. Its binary SHA-256 remains
  `7bbe67dc6aed3cad83973eb00bb7e9849c7c93c8df8a21a27c94d121d0385a46`,
  CDHash `d41947ed7ac912609334207875996ffa9d9e0680`.
  The proposed install path is still absent. Earlier native-helper metadata and
  the owner-storage procedure remain byte-identical; this planner change does
  not update or authorize the pending storage step.
- No presentation, runtime, booking, Client Identity, credential helper or
  launcher implementation files changed in this unit. No push or deploy was run.
