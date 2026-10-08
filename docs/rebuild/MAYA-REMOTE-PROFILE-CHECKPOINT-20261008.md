# Local remote diagnostic profile — 2026-10-08

Runtime: **5b04b0c88a9f33589e9cde3d20936a9b7754c376**.
The local bootstrap and final render are complete. Nothing was deployed or started
on the server. This is not Linux/systemd enforcement, real-model acceptance,
YCLIENTS completion or C10 autonomy approval.

[Archive](evidence/maya-development-integration-20261006/remote-profile-20261008/manifest.json),
[exact commands](evidence/maya-development-integration-20261006/remote-profile-20261008/rendered/commands.json),
[properties and directories](evidence/maya-development-integration-20261006/remote-profile-20261008/rendered/preview.json).

## Actual execution and SSH outcome

The owner authorized one metadata-only attempt at 17:45 UTC. It **ran at
17:50:09 UTC**, through the same Beget ProxyCommand route, and ended with **exit
255 after 8.021 seconds**, during SSH banner exchange. Stdout was **0 bytes**.
No target metadata or collector execution was observed. No further connection was
attempted. No remote setup, credential-content collection, writes or paid call occurred.
[SSH receipt](evidence/maya-development-integration-20261006/metadata-inventory-second-20261008/manifest.json).

Local execution later disconnected during archive preparation. It has now resumed:
Git HEAD is unchanged, all five recorded local process groups are absent, runtime
files match committed Git blobs, and the final render was regenerated. The older
scratch `rendered/` with `RemoveIPC=yes` is **excluded** from the archive. The current
profile has `RemoveIPC=no` and `PrivateIPC=yes`.

Final render SHA: `ae43f3397b2893979e66edafd5c01e9efc8cbf9768db926fff2ac8fee35b1b0f`.
It binds the actual runtime commit, but its resource/GID/IP/credential values are
explicitly **ILLUSTRATIVE_NOT_OBSERVED**. Application refuses this plan. The first
post-resumption render refused a noncanonical `/tmp` input parent on macOS; using
the same file's canonical `/private/tmp` path succeeded without code changes.

## Implemented actions

Entry: `maya-saas-backend/scripts/conversation-qualification/core-remote-bootstrap.mjs`.
`--dry-run --config ABS --output NEW_ABS` writes only a canonical plan, exact service
properties and structured setup/start/cleanup command arrays. It does not contact
the server. `core-remote-example.json` is an inapplicable example, not an observed
configuration or execution grant.

Future `--stage` requires a fresh observed plan, explicit setup approval reference,
Linux/root, the exact complete root-owned Git checkout and already supplied Linux
dependencies. It validates current memory/disk, existing principals, canonical
binaries and source ownership before Git reads; fsmonitor and hooks are disabled
for those reads. It creates a new UUID run directory, private evidence, root-owned
homes/gitconfig and nonsecret control files. Existing credential contents are never
read during setup; no key is copied, extracted from an env file or created.

Runner-check and broker-check inspect original OS credential access using access/stat.
Checks capture exact cgroup limits, process identity and namespaces. Network-check
also captures attached BPF programs/maps and the private hosts binding. Unsupported
or incomplete observations fail closed; actual filter evidence requires human review.
Then the existing runner prepares the source-bound manifest, copied to shared
readonly control. Its generated conversation run UUID is distinct from the resource
plan UUID and explicitly bound in the setup receipt.

Future `--start` additionally requires the reviewed setup receipt SHA, isolation
review reference, an externally issued fresh permit SHA and paid approval reference.
The new broker's stable direction → program-tag → map graph must match the reviewed
setup snapshot before the existing runner starts. Runner creates a fresh private
PostgreSQL cluster/database and uses the existing authenticated HTTP/AiCore diagnostic.
Bootstrap issues no permit and does not enlarge **3 dialogs / 5 turns / 12 reserved
attempts / $2 / 10 minutes**. The existing ledger, revocation and unknown-delivery
refusal remain authoritative. Model quality is not inferred from setup or contracts.

Runner has a private network namespace. Broker has exact IPv4 address filtering
and a private hosts bind. Address filtering does **not** establish an OS port-443
restriction: endpoint, HTTPS and hostname remain bound by the existing broker code.
Existing service UIDs and the exact Unix socket are retained. No accounts, groups,
global firewall/DNS/sysctl changes, public HTTPS or production restarts are included.

## Resources and cleanup

Parameters are bounded: runner heap 256–3072 MiB, broker heap 32–256 MiB; MemoryMax
must include margins and fit observed available RAM plus at least 256 MiB reserve.
Task/CPU ceilings and zero swap are explicit. The example's 768/64 MiB heaps and
1024/128 MiB MemoryMax are illustrative, not capacity measurements or a recommendation.
Historical headroom does not prove any selected configuration will finish the test.

Services have finite runtimes, no restart and KillMode=control-group. Private IPC
avoids cleaning other processes' IPC under the same existing UID. An independent
setup timer is 300 seconds; run cleanup is tied to absolute permit expiry plus
45 seconds. Root-owned closed-phase records and ExecCondition prevent launches after
cleanup or expiry. Cleanup continues other owned groups after one failure, refuses
foreign units and verifies empty cgroups, including detached PG descendants. Evidence
is retained. Production databases, old proof units/DBs/permits and the working site
are untouched. Delivery of the offline candidate/dependencies is a prerequisite;
the bootstrap contains no SSH/deploy or package installation action.

## Local verification

**80 distinct pure/synthetic checks passed**: resources 6, systemd properties 9,
observer 11, effective-state inspector 44, bootstrap 10. The archived test index
deduplicates the four serial runs by observed passing test names. Cases cover
resource/path refusal, exact modes under restrictive umask, expiry/closure, cleanup
failure continuation, foreign cgroups, PID drift, namespaces, bounded BPF reads and
stable filter associations. Runner syntax and scoped formatting passed. Every own
test process group was confirmed absent. No new HTTP/PG aggregate gate ran.

Independent static reviews found and resolved ancestor ownership, launches after
cleanup, partial cleanup, input newlines, Git read ordering and incomplete BPF graph
binding. The observer's author excluded that helper from their independent verdict.
No static reviewer claimed Linux/systemd/BPF execution or real-model acceptance.

After resumption, independent artifact review passed: all 20 archived files, all
14 source/Git-blob bindings, final plan/command pins and 80 unique passing names
were verified read-only. Archive manifest SHA:
`925e6fc665b04e0662b94da2d361555c4ed6b0fdd2ae988ca892e9bef1f8e1ac`.
The reviewer confirmed the stale render is excluded and the diagnostic proposal
is explicitly unexecuted and requires fresh authorization.

## Concrete remaining access/setup

1. **Connection diagnosis:** two one-attempt SSH grants are exhausted. Wi-Fi return
   restored local execution but did not authorize another connection. Existing stderr
   only proves a banner-phase timeout through the proxy route. The Beget welcome line
   does not by itself prove forwarding to the target succeeded. Proxy forwarding,
   route/firewall behavior and target sshd state are not distinguished by these logs.
2. **Next bounded step, prepared but not executed:** the
   [diagnostic proposal](evidence/maya-development-integration-20261006/remote-profile-20261008/connection-diagnostic-proposal.json)
   retains both existing identities, target, proxy route, strict host checking and
   the SHA-pinned readonly collector. Only `-vv` is added to both SSH clients. One
   attempt, eight-second connect timeout per hop, outer 580-second deadline plus six
   seconds for own-process cleanup. Persist only finite transport-phase markers and
   the existing allowlisted collector output, not raw debug or credentials. This would
   distinguish proxy authentication, forwarding confirmation, target banner/auth and
   collection, and produce metadata if that same connection succeeds. A fresh exact
   authorization is required; no generic retry or automatic route substitution occurs.
3. **No confirmed alternative:** the bounded local `~/.ssh/config` inspection found
   no relevant target/route block. Includes/keys were not opened and `ssh -G` was not
   executed. Historical source material establishes prior use of api.mayaos.ru, but
   not a successful direct-route receipt. AGENTS' 111.88.148.206 is a different historical
   target, not a proven fallback for api.mayaos.ru / 89.169.160.55.
4. **Before setup:** obtain actual resource headroom, GIDs/group composition, binary
   paths and the exact existing scalar credential reference/owner/reader; supply a
   Linux-compatible offline checkout/dependencies and approve the exact setup profile.
   An env-file reference alone does not satisfy the scalar-reader contract.
5. **Before the first paid batch:** verify actual OS isolation and review the setup
   receipt, then obtain separate paid admission with fresh pricing/permit. The core
   actual-model conversation remains unexecuted and is the next product evidence goal.
