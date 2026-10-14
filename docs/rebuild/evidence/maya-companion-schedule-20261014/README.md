# Schedule shortcut — scoped acceptance, 2026-10-14

Tested clean product SHA: `a6e49b9b2420363e37b5ca8cb940b79c8c6f6b9f`.
Branch: `codex/maya-local-crm-setup-20261010`.
Predecessor: `2df5b4330d00768422125dd75df0207fd29d3e6a`.
This is local development acceptance, not AR-1 release certification.

See [checkpoint](../../MAYA-COMPANION-SCHEDULE-CHECKPOINT-20261014.md) for behaviour and remaining scope.

- `summary.json`, `runner.py`, `logs/`: all 13 fresh checks on the committed SHA;
  clean and unchanged at start/end. No historical receipt reused as a test result.
- `browsers/`: actual emitted React/runtime in isolated Chrome against intercepted
  synthetic loopback HTTP. 35 chat + 207 navigation + 56 voice + 35 shortcut =
  333 checks. Zero unexpected API, external requests, JavaScript and CSP errors.
- `screenshots/`: synthetic UI captures, no owner salon/account/customer data.
- `backend-source/`: independent fresh real AppModule/HTTP/PG source proof, two
  cases; journal detail and internal-calendar personal create/reschedule/cancel.
  The two cases passed on final02; the owned PG cluster is stopped.
- `MANIFEST.json`: hashes of original and archived artifacts, raw local files not
  copied, and owner references. Text archival normalizes trailing whitespace;
  both original and archived hashes are retained.
- `SCAN.json`: scoped secret/PII pattern review; not a historical repository audit.

## Proof boundary

The shortcut posts the visible natural-language question through existing chat.
The UI test uses the historical renderer corpus as a synthetic HTTP response;
that corpus is NOT presented as a current `operations.journal.read` emission.
The separate backend proof executes the current source and reaches the real
runtime/React drawer. It uses an empty journal day and no actual LLM. These are
complementary proofs, not one unbroken browser → real model → live salon claim.
The new entry's real-model routing and a populated salon journal remain unverified.

The current backend source proof returns sealed prose and canonical controls,
not the prototype's drawn free-window rows. The free-window shortcuts, direct
header-to-modal mechanism and schedule redesign are not claimed complete.

## Non-vacuity and development receipts

- `red01`: pre-change emitted candidate rejected the probe at the absent schedule
  shortcut after sign-in (2 checks passed). No product mutation was needed.
- `dev01`: new probe used a statement list where the CDP helper expects an
  expression; wrapped as an IIFE, no product fix or timeout increase.
- `dev02`: 28 checks passed before the test could not locate the drawer privacy
  row by exact name. Its decorative arrow is now excluded with an explicit
  accessible name; the privacy owner/route is unchanged.
- `dev03`: 35 checks passed; followed by product commit and fresh final01.
- source final01: both actual HTTP/PG cases passed, but final clean-copy check
  rejected a copied dependency symlink as untracked. final02 copies the resolved
  dependency directory; all setup, test cases and cleanup rerun from scratch.
  The failed manifest/runner is preserved, not relabelled PASS.

No real Keychain, retained DB, provider, paid model, production migration,
grant, deploy, push, merge, phone installation or Chapter 10 work occurred.
Fresh schema replay was limited to a new disposable synthetic PostgreSQL cluster.
