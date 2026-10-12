# Owner storage step

Latest update 2026-10-12: the owner entered and saved the two real credentials in
the corrected native window. UI success and exact-item metadata/ACL are verified;
values were not read by the agent and provider validity remains untested. See
[paste-enrollment/summary.json](paste-enrollment/summary.json). The real records
must not be removed by the historical synthetic cleanup instructions below.
Storage is complete; no live/paid/provider run was authorized by this action.

Update 2026-10-12: the owner explicitly approved the bounded **synthetic-value**
OS storage test below. Installation, create/read-after-process-restart/delete
passed; both test records are now absent. See
[os-storage-proof/summary.json](os-storage-proof/summary.json). The original helper
remains installed. Real credential enrollment and external/paid runs are still
not performed or authorized by this storage-test approval. The proposal below
is preserved as the scope that was approved, not as a new pending question.

Purpose: stop asking for the same two keys at every separately admitted local
run. Storage consent does not extend a paid budget/window or authorize customer
reads, messages, booking, production, Telegram or platform operations.

## Proposed single bounded persistent test

Only after owner approval:

1. Install the already-built, exact verified native app under
   `~/Library/Application Support/Maya/LocalCredentials/MayaLocalCredentials.app`.
   Refuse an existing different installation; recheck binary hash/signature after
   copying. Never trust generic Node, Terminal, shell or all applications.
2. Check only the two exact proposed service/account pairs in the local **login**
   Keychain. No enumeration/search of unrelated records and no existing value
   read. If either already exists, stop without changing it.
3. Through the native secure UI, create those two records using **public synthetic
   test values only**, with helper-specific access. No real provider key or paid
   session is needed. Do not unlock/lock the whole Keychain or change global
   security settings automatically.
4. Verify the exact helper reads each value through its private pipe, refuses
   stdout export, and works again in a fresh helper process. Observe actual OS
   prompt/ACL behavior; do not assume it from the memory tests. If an OS approval
   is needed, the owner handles that prompt. Changed-helper/binary attempts must
   fail before credential access through the pinned launcher.
5. Delete precisely the two **test-created** records using the native exact-item
   action and verify they are absent. Stop on any ownership/cleanup ambiguity.
   Preserve an outcome/hash-only receipt; no key contents.

This is a maximum two-record test; it grants no persistent blanket access to the
owner's passwords. Helper installation and two-record Keychain access are new
side effects, so they are intentionally pending explicit permission.

## Once the storage behavior is proven

The owner can authorize enrollment of the two real credentials, then enter
the **YCLIENTS partner token** and **DeepSeek API key** once in the native secure
window. The agent never reads/types them. Values are not sent to chat or Git.
No Telegram secret, existing encrypted `user_token`, production key or customer
data belongs in this window.

Future runs may retrieve them under the existing current, bounded owner permit
without typing again. Keychain locking or a helper change can require system
confirmation. Missing/denied storage fails closed; there is no silent fallback
to file/clipboard/environment/Terminal input for a Keychain-source run.

Deletion prevents later loads; separately stop an already-running session to
remove its live credential references. Provider-side key revocation is a separate
owner action. No real enrollment or storage test has happened at this checkpoint.
