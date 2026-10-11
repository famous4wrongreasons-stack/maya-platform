# Telegram web return — committed local checkpoint

Product/tests: `6ca9a5ede154647e960ab2a704e15653f1205fe6`.
Branch: `codex/maya-local-crm-setup-20261010`. Date: 2026-10-11.

## Result and boundary

The initiating React document now retains the memory-only Telegram attempt while
a separate, disowned popup visits the provider. The parent reads only its exact
held window after return to the exact same-origin `/oauth-callback.html` with no
query. The callback erases its query first and rejects duplicate/malformed inputs.
The parent erases the fragment and closes the window before the existing runtime
single-use/state check and existing backend completion. No browser persistence,
message receiver, extra auth endpoint, Client writer or booking authority added.
Blocked windows, cancellation, expiry, sign-out, replacement auth and dispose
fail closed. Web ignores the native callback event; native ingress is unchanged.

React payload and callback artifact must be paired in a future separately
authorized deployment. A mixed old/new deployment is not qualified here.

Fresh results executed on the committed checkpoint, with a clean source tree:

| Surface | Result |
| --- | --- |
| Full headless runtime `npm test` | 723 PASS, 7 SKIP, 0 FAIL / 730 total |
| Full React carrier `npm test` | 157 PASS, 0 FAIL |
| Actual emitted React/runtime/callback in isolated Chrome | 29 checkpoints PASS; 5 starts, one completion; parent document retained |
| Targeted mutation programme | green net/popup baselines; 10/10 mutants killed by assertion failure |
| Canonical `tools/release.mjs verify` | PASS; PWA/Capacitor differ only at approved endpoint/HTML substitution |
| `npm run test:release` | 18 PASS, 0 FAIL |

Browser responses for backend and Telegram are synthetic. Provider navigation
is intercepted through CDP; the final return is a renderer-initiated HTTP 302.
Tests additionally cover injected native events/messages, wrong state, decline,
closed window, page reload and standalone callback. Network isolation is CDP
interception plus deny proxy/resolver, **not an OS-wide packet-capture claim**.
Both owned browser and HTTP listener were stopped. No user keys or owner DB used.

The ten mutations cover state binding, auth cancellation, close-before-complete,
exact origin, exact path, erasure before reading, disowned opener, erasure before
delivery, duplicate state, and malformed-query erasure. This is a targeted OAuth
programme, not a new execution of the full widget release mutation corpus.

## Provenance and unsuccessful attempts

The previous [source-execution diagnostic](../maya-telegram-navigation-20261011/)
remains evidence against `0c4ae3b8`; its exit 0 means a defect was reproduced.
Do not rerun it against a changed tree and label that historical result current.

The first full runtime run in this unit had one failing build self-test. Four
fixtures omitted two onboarding and four CRM paths that were already canonical
before the OAuth change. Hash comparison confirmed unchanged prior build/fixture
bytes. Fixture-only commit `bdafa1eb6378d90820055bf2e372b6b3a9f931ac` reconciles
those paths; the gate and expected refusal rule sets were not weakened.

Exploratory browser harness runs are retained locally. Early runs fixed finder
selection and popup attachment. A browser-initiated CDP navigation could sever
the held context after opener disown; using a renderer-initiated provider return,
then the final synthetic HTTP 302, exercised the actual intended browser path.
Origin/state checks were not relaxed. Exploratory mutation runs fixed missing
temporary fixtures/compiler dependencies and deferred-test cleanup on assertion
failure; syntax/import failures do not count as killed mutants.

## Reproduction

Use the committed source and already installed repository dependencies:

```sh
# from maya-chat-shell/
npm test
# from maya-carrier-react/
npm test
npm run test:telegram-browser -- /private/tmp/maya-telegram-browser-new-run
npm run test:telegram-mutations -- /private/tmp/maya-telegram-mutations-new-run
node tools/release.mjs verify
npm run test:release
```

The browser proof requires a previously built current web payload; it verifies
the emitted bytes before use. Use a new output directory for each run. Raw logs,
intermediate reports and screenshot are indexed by size/hash in `manifest.json`.
`summary.json`, `browser.json` and `mutations.json` are repository-safe receipts.

## Still unqualified

Current real Telegram registration, real provider headers/COOP behavior, Safari,
installed PWA and physical iOS are not proved by this run. A severed window
reference refuses safely but does not establish provider compatibility. Real
private CRM/history/model acceptance still needs its bounded launch profile,
actual current identity state and a new explicit run authorization. Earlier
public-read/model permissions have expired.

No new release certificate, deploy, bot change, production write, owner DB access,
real OTP/Telegram login, model call, YCLIENTS effect or iPhone installation.
`nativeVerified: false` is intentional: packaging equivalence is not native
installation or device acceptance. HANDOFF and existing authority rules unchanged.
