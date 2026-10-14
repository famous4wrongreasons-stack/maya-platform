# First iPhone check — fresh packaging preflight

Candidate: `1df1079a1d210cc4d176894c75b67585fb138348`.
Branch: `codex/maya-local-crm-setup-20261010`.
Xcode 26.6 (17F113), Node 22.23.3. Local isolated clone, no app launch/install.

See [current plan and owner boundaries](../../MAYA-PHONE-FIRST-CHECK-20261014.md).

## Executed

- `PACKAGING.json`: exact candidate, clean original/clone, canonical React sync,
  18 packaging tests, unsigned Simulator build and actual App.app verification,
  unsigned iphoneos build and actual App.app verification. All steps PASS.
- `DEVELOPMENT-TARGET.json`: same code with the existing explicit Debug endpoint
  substitution. Default/wrong endpoint and non-Debug use refused; exact Debug
  verified, unsigned iphoneos app built and its packaged bytes verified.
  The reserved `.invalid` host was never contacted and is not a working server.
- `SIGNING-METADATA.json`: presence of a valid development identity and local
  exact-bundle provisioning profile; the connected phone and signing certificate
  match that profile. Device paired, Developer Mode enabled. Only public metadata
  and comparison booleans retained. No private-key export, signing, provisioning
  update or Keychain secret read performed.
- `MUTATION-PLAN.json`: current 545 declarations, 47 batteries, 68 jobs. Fresh
  declaration/anchor/killer dry-run PASS. No mutation baseline, kills or complete
  corpus execution is claimed.
- `packaging-runner.py`, `development-runner.py`, `logs/`: executed procedures and
  bounded raw log copies. `MANIFEST.json` pins original paths/hashes/sizes and
  copied-byte hashes. Copies normalize trailing whitespace; originals unchanged.
- `attempt1/`: first harness clean-check failure. Builds passed, but a dependency
  symlink appeared as untracked. Tracked source diff was empty. The retry adds
  only exact dependency links to the private clone's `.git/info/exclude`; it
  reruns packaging from a new clone and proves clean final state.
- `SCAN.json`: bounded new-document/evidence secret/PII pattern scan, reviewed
  synthetic fixture exceptions if any, and copied/source hash verification.

Large synthetic build logs, the raw declaration listing and unsigned reproducible
binaries remain outside Git with provenance in the manifest. Raw device metadata
is deliberately omitted because it contains hardware identifiers. No provisioning
profile, certificate/private key, user database, secret or real customer data was
copied into this packet.

## Interpretation

The existing Companion can be packaged for iPhone. Unsigned builds and available
signing metadata do not prove an installable signed app, phone network access,
native login, keyboard/microphone behavior or provider acceptance. Production
endpoint strings were inspected as package bytes only; that app was never launched.
The development target is a non-resolving fixture, not a prepared salon environment.

Current certificate remains **NOT_ISSUED**. No hosted CI, full current Platform CI,
complete mutation programme or applicable full FBE2E was executed here. Historical
certificates are not carried forward. HANDOFF and AR-1 policy remain unchanged.

Source branch changes after the tested SHA are documentation/evidence only.
Deployment, production migration/grant, real model/OTP/YCLIENTS effects, app install,
new keys, push/merge: **0**.
