# Registration form checkpoint

The current React signup now explains the business login name, suggests an editable
Latin slug from the business name, preserves a manual slug, offers city/UTC labels
backed by IANA zones, and requires an explicit timezone selection. Consent is a
native checkbox with a visible explanation of the disabled submit button. Invalid
fields receive linked inline errors and focus. Public fields survive correction;
the password stays only in the DOM until dispatch and is cleared on dispatch or exit.

`browser-pass.json` records 63 checks of the current component with a **synthetic
OnboardingPort**. It is not a backend signup, PG transaction, real business, or CRM
acceptance. It covers keyboard typeahead/Space/Enter, 320/390/1280 px layout,
correction, one pending submission, safe pre-activation retry, uncertain outcome,
unexpected promise rejection, and cancellation. 9 carrier tests, 25 headless
onboarding tests, 117 ratchet fixtures, carrier types and web build also pass.

Earlier browser attempts are retained: sandbox loopback listen was denied before
execution; the next runs exposed an unsuitable macOS native-popup keyboard driver.
Native label typeahead passed without injecting a select value or change event.
The first build rejected form/select/checkbox. Form navigation remains forbidden;
only the existing signup file admits its timezone select/options and one literal
confirmation checkbox, with negative guard fixtures. Chromium kept its built-in
sandbox; OS-wide Chrome network closure is **not qualified**.

The separate preview server is visibly marked as non-registering and serves only
three static assets on loopback. It refuses signup routes and expires in 30 minutes.
It is not the normal onboarding profile.

The existing backend has no safe public slug-collision code: Prisma P2002 becomes
generic HTTP 500. Session creation occurs after the bootstrap commit, so generic
500 cannot be mapped to “name occupied, retry.” This checkpoint retains
`uncertain` and prevents repeat creation. A narrow rollback-scoped server error
projection remains a separate unresolved integration gap.

The prior owner handoff reached ready and ended cleanly with zero provider reads,
without completed registration. `owner-handoff-final-safe.json` contains only
closed status fields. The live consent state was not observed. Existing owner
database/key files and the earlier UNKNOWN failure were preserved.

The subsequent actual proof at `03875b23523a578fad13ec0e8f7035dcd4e5a66b` passed
9 current React/HTTP/PG checkpoints: two synthetic businesses, five password logins,
lost successful response recovered without a duplicate, and slug collision rollback
with only one additional pending activation. `actual-parent.json` and
`actual-browser.json` preserve evidence; `actual-session-final.json` records source
bindings and clean owned shutdown. Seventeen domain-effect tables stayed empty.
The first actual driver preflight failure (inet address representation) is retained.
No website, production, provider, model, phone, or background-autonomy acceptance is
claimed. See the runnable [owner registration profile](../../MAYA-LOCAL-REGISTRATION-HANDOFF-20261010.md).
