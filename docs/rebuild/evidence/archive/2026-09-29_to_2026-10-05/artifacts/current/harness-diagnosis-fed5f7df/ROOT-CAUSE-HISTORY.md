<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: cb2115e2af31a7a834b8100480ac6d3b0f50676c2e5d272ca2e89f0d7c7fe12b -->

# HTTP baseline diagnosis

**Proven harness defect; no product defect established.** Base: `fed5f7dfa0a5611dba24b40a8143b354c22151e5`. Harness implementation: `dac4072dd17ec222fe36cc603863965919039708`; final lint/inventory-complete candidate: `86044d2b5ce4800c277314ff39e849ece3e63acb`.

Supertest implicitly opened an IPv6 wildcard listener with `listen(0)` for each request, then connected to IPv4 `127.0.0.1`. On this Darwin host an existing IPv4 listener can coexist with the wildcard listener on the same port. The request then reaches the IPv4 listener owned by another process.

Two failures were captured in the unchanged, stock mutation-runner baseline environment:

| Failure | Actual destination | Evidence |
| --- | --- | --- |
| Request stalls until the test timeout | `127.0.0.1:53800`, owned by Red Shield VPN PID 675; intended Node PID 31748 listened on `*:53800` | `corpus-5/STALL-EVIDENCE.json`, `stall-port-lsof.txt`, `stall-port-netstat.txt`, `stall-stack.txt` |
| `socket hang up` / `ECONNRESET` in 3 ms | `127.0.0.1:55729`, the dedicated proof PostgreSQL listener; intended HTTP listener used the same port on IPv6 | `corpus-3/trace/events-31778.jsonl`, its Jest report and process/socket samples |

The intended backend never accepted these TCP connections or received the HTTP requests. During the captured stall the event loop remained responsive, there was no waiting backend database session, and the client socket was new rather than reused. This rules out product latency/deadlock, socket reuse, or an insufficient timeout budget as the cause of these captured failures. Parallelism changes how quickly ephemeral port allocation reaches an occupied port; it is not needed for the deterministic reduced reproduction.

`collision-repro.json` reproduces the address-family collision with two synthetic local HTTP servers, without Maya, a database or the VPN: the wildcard case returns `OTHER_LOCAL_PROCESS`; an explicitly bound IPv4 listener returns `INTENDED_HARNESS`. No existing service was stopped or reconfigured.

The fix opens one ready `127.0.0.1` listener on an OS-assigned free port before Supertest receives the server. Every request and `listenLoopback()` uses that listener until normal harness teardown. Product routes, guards, authority, assertions and timeout values are unchanged.

The new `HAR-LOOPBACK` regression fails against the old bootstrap and passes with the fix. It checks listener readiness/address family, repeated requests reaching the intended server, stable port/URL and teardown. `H-LOOPBACK-1` adds the wildcard regression to the canonical mutation corpus, now 503 declarations.

All three requested tests passed independently before diagnosis and after the fix. Three fresh full native AR baseline executions after the fix each passed **406/406, zero failures/skips**, including SV2-HTTP, F88-1, F88-2 and the new regression. These are diagnostic controls, not a substitute for final certification.

The corpus comparison ran the original eight-worker mix: five full live controls and three unit controls, each with its own proof database. The unit controls were stopped after capturing both HTTP failure mechanisms; they are not admitted as completed certification. See `diagnostic-load-stop.json`. Test order/durations, startup/readiness, request timing, open handles/sockets, CPU/memory, process trees, PostgreSQL wait states, stdout/stderr and exit statuses are retained in each run directory.

`PROVENANCE-NOTES.json` discloses an initial diagnostic selector that ran no matching regression, the pre-commit harness changes, and an early observer-hash timing issue. Those diagnostics are not silently relabelled as certification. Subsequent observers are immutable per-run copies.

Complete certification restarted from scratch on `dac4072d`, in the separate `final-certification-dac4072d` output directory. No historical mutation results were copied. No production migration, deployment, entitlement grant, real OTP/YCLIENTS effect, iPhone reinstall or Chapter 10 work was performed.

Final lint-clean harness candidate: `41906e0c0f48392cc0fef2dc199688d74aa8662d`. The follow-up removes unnecessary type assertions and an async-without-await lint violation, with no behavioral change. Three more stock full AR baseline controls on this candidate passed 406/406 each; see `FINAL-BASELINE-CONTROLS.json`. The earlier dac4072d certification was terminated and is not admitted. Complete final certification restarted in `outputs/final-certification-41906e0c`.

The final inventory follow-up `86044d2b` updates the CI test from 502 to 503 and explicitly pins H-LOOPBACK-1. Before: 34/35 CI-integrity checks; after: 35/35. This is a harness count correction, not a relaxation. All final certification receipts now start fresh under `outputs/final-certification-86044d2b`; neither earlier partial attempt is admitted.

Scope of the causal evidence: the original three AR failures did not retain port-level traces. The unchanged runner reproduced both timeout and socket-reset failure classes in other live baseline tests, with the wrong receiving process directly captured. The requested three tests also passed independently before the fix, consistent with an intermittent port collision. We do not claim to have captured the original three historical sockets or to prove the absence of every possible product defect.

## Remaining unit harnesses — same verified transport flaw

The fresh 86044d2b programme exposed two 5-second R02 unit-test timeouts in one unmutated copy (5596 pass), while another unit copy passed 5598. A controlled local IPv4 shadow server demonstrated wrong-process delivery through the unchanged R02 fixture (21/21 requests), the Admin/bootstrap fixtures (9 HTTP cases), and the e2e fixture (one request). An exact original failing R02 test also reproduced its unchanged 5-second timeout when the shadow receiver held the response; after the repair it passed and no request reached the shadow. See `r02-followup/DIAGNOSIS.json`. This is controlled port selection, not a claim to have captured the original historical R02 peer.

Final candidate `dc3a26806b273631e8c6150acfa3e9cacdde91a1` applies the same owned IPv4 listener to these four remaining test fixtures, adds a named R02 regression and three unit mutation declarations, and pins the new total of 506. Product code, authority, presentation and timeouts remain unchanged. All prior partial certification is excluded; the complete programme restarts under `outputs/final-certification-dc3a2680`.
