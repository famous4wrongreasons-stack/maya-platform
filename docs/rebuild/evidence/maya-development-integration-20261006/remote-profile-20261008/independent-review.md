# Static review record

Candidate: `5b04b0c88a9f33589e9cde3d20936a9b7754c376`.
Recorded from the reviewers' task messages; not a claim of target execution.

`/root/checkpoint_review` independently inspected bootstrap/plan lifecycle and
identified missing ancestor ownership, potential launch after timer cleanup,
cleanup aborting on one role failure and a trailing-newline IP input. All were
resolved: canonical root-owned ancestors, closed-phase/expiry ExecCondition,
continued exact-owned cleanup with aggregate refusal and strict octet validation.
The reviewer authored the original systemd generator, so that generator was
reviewed as integration, not represented as independently authored-and-reviewed.

`/root/receipt_read_shell` independently reviewed bootstrap/phase/plan/effective
integration. It identified root Git reads before full checkout ownership validation
and a fingerprint that did not bind the direction/program/map graph. Both were
resolved: tree validation precedes Git, fsmonitor/hooks are disabled for those reads,
and paid start compares a stable fingerprint including direction, program tag and
associated map fingerprints. The final verdict found no remaining blocking static
findings. Setup/start separation, phase fences, readiness and cleanup continuation
were also reviewed. This reviewer authored the observer and explicitly excluded
that helper from its independent verdict.

The effective-state inspector's author supplied synthetic tests for the corrected
filter binding. Root ran the serial local checks; the final affected suites passed
54/54. The complete deduplicated local test set is 80 cases in test-index.json.

No reviewer executed Linux/systemd/BPF, remote setup, model calls or real provider
actions. Actual effective isolation, resources, cross-UID access and model quality
remain unqualified. After the execution disconnect, stale scratch render was not
accepted; this archive contains a new render from the committed runtime.
