# Two local credentials: concrete preparation scope

2026-10-12. PREPARATION ONLY. No actual Keychain lookup/read/write/delete,
no ACL change, no signing-key generation, no native UI launch, no real secret
enrollment. The existing retained owner launch is unchanged and still accepts
explicit manual stdin only. This is an extension proposal for that launch,
not a parallel release or authorization engine.

## Exact proposed storage and consumers

Both are `generic password` items in this owner's explicitly selected local
**login** Keychain, not iCloud/System/a search across arbitrary keychains.
Account `local-owner-501` is bound to the current OS UID; a different UID refuses.

| Credential | Service | Label | Sole intended consumer |
|---|---|---|---|
| DeepSeek API key | `ru.mayaos.dev.local-model.deepseek.v1` | MAYA — локальные проверки DeepSeek | existing bounded local model broker |
| YCLIENTS partner token | `ru.mayaos.dev.local-read.yclients-partner.v1` | MAYA — локальное чтение YCLIENTS | existing owner catalogue-read runtime |

Saved encrypted YCLIENTS user_token stays under its existing database owner.
Telegram, platform, production and signing credentials are outside this proposal.
Duplicate item creation must refuse, never silently replace an existing item.

## Helper identity and transfer

Reserved native bundle identity: `ru.mayaos.local.credentials`, executable
`MayaLocalCredentials`, proposed installation:
`~/Library/Application Support/Maya/LocalCredentials/MayaLocalCredentials.app/Contents/MacOS/MayaLocalCredentials`.
These are proposed names, not an installed or verified identity. A name/path alone
does not establish code trust: the final binary hash, signing requirement and ACL
behavior must be pinned and tested before real enrollment.

The two items trust only that native executable. Do not grant access to all apps,
Terminal, generic Node, shell or `/usr/bin/security`. No generic search/export or
print-secret operation. The helper launches only the source-pinned local consumer
from the validated existing allowance and delivers the exact credential through
an inherited private pipe, not argv, environment, stdout, logs or files. The
consumer retains it only in memory for the already-authorized operation.

The present partner-token runner injects a runtime environment value internally;
the proposed pipe-only adapter therefore needs a real change in local launcher
handoff. It cannot be declared complete by merely adding a Keychain reader.

Same-UID caveat: ACL authenticates the helper, not an arbitrary helper caller.
Private pipes and mode 0700 do not isolate code from other processes of the same
Mac user. Preserve the existing explicit owner-managed local trust model. A claim
of OS-enforced broker-only access would additionally require a fixed signed native
broker/XPC caller identity; this preparation does not provide or imply that claim.

## Owner experience and revocation

One native window with two secure fields, clear labels, and an explicit save
action. The owner enters the values directly; the agent never reads or types them.
Saving keys neither starts a provider request nor grants a future spending window.
In the compile-only UI here Save is deliberately disabled: storage is unconnected.

Subsequent admitted runs may load the two exact items once without retyping, if
Keychain is unlocked and the helper remains trusted. First enrollment, locked
Keychain, changed binary or ACL can cause system prompts. Do not promise zero
prompts. Noninteractive access requiring a prompt fails closed without retry or
silent stdin/file fallback.

The owner can delete precisely the two labelled items in Keychain Access or later
through the helper's explicit delete action. No broad deletion. Deletion prevents
future loads; cancel the current run to stop credentials already in memory.
Provider-side rotation/revocation is a separate operation.

## Compatibility and results

Current `core-conversation-admission.mjs` admits `terminal-stdin` for this local
path, not Keychain. Add a distinct source only through that existing admission
contract: exact item/helper/consumer, candidate/manifest, owner UID, current
allowance, expiry/revocation/budget first, then credential retrieval. Never disguise
Keychain as stdin. Caller JSON cannot set `admissionValidated` or authenticate code.
The injectable booleans in this isolated test model are test inputs ONLY.

- 25 in-memory tests PASS: exact two-item routing, wrong user/helper/consumer,
  production, changed candidate, missing approval, expiry/revocation before and
  during retrieval, missing/locked/denied storage, prompt-required refusal,
  cancellation, pipe failure and clearing owned secret buffers.
- Both Swift sources pass SDK typecheck. Neither was executed. The SDK reports
  deprecation warnings for file-based ACL/support APIs. API availability is not
  proof of real ACL, storage, deletion, signing, or absence of OS prompts.
- No actual Keychain behavior, enrollment or runner integration is claimed.

## Exact remaining engineering boundary

1. Implement native exact-item storage and owner enrollment/delete controls;
   connect the proposed helper's fixed consumer transfer to existing admission.
2. Pin the actual helper binary/signing identity; prove substituted helper/child
   refusal. No production secret or signing-key generation is needed for the design.
3. Implement partner and broker pipe adapters; ensure no secret reaches command,
   environment, receipt or log; test aborted/concurrent/expired operations.
4. After those artifacts are reviewable, request the owner's concrete permission
   for the two exact records and helper access. Real Keychain tests/ACL installation
   remain outside current authorization, including tests using an actual keychain.

Supported mechanism was checked against installed Security.framework SDK and
[Apple TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains).
Apple recommends SecItem; file-based Keychain uses ACL and explicit search lists,
while data-protection access groups need suitable signed/provisioned packaging.
The latter is not silently substituted here. See the earlier
[proposal](../../MAYA-LOCAL-KEYCHAIN-PROPOSAL-20261009.md).
