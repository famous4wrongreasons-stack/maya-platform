# Preservation and security record

Scope: archival publication only, 2026-10-05. No product runtime, production, schema, entitlement, OTP, YCLIENTS or iPhone operation.

Before edits, all local/remote branches, remote URLs, HEADs, worktrees and dirty states were captured privately. The canonical Git common directory is `/Users/stanislavmosin/Desktop/Projects/maya-platform/.git`. A verified local-only bundle preserves the original history, dangling commits and internal refs:

- `work/maya-development-archive-20261005/maya-platform-before-archive.bundle`
- SHA256 `df942bc351c8538b40a8cdceea33fada65054b2cb90c17ef7ec31302bf3448ba`
- 165594032 bytes; `git bundle verify` passed.

Uncommitted source files and staged/unstaged patches were copied privately before archival commits. No stash/drop/reset/clean was performed. Original user worktrees and indexes were not modified. The archival checkout is separate and based on the verified integration candidate. No force push, branch deletion, main merge or release tag.

## Secret and PII review

Gitleaks 8.30.1 default rules, without repository inline ignores, scanned all canonical Git history including local safety refs. Its 1099 findings were reviewed as hashes, public VAPID keys, explicit isolated test literals or syntax false positives. A second scan inspected 11162 unique blobs (956776124 bytes) for PII, credential URLs and private-key material; 141 unique matching values were reviewed. Scanner absence alone was not treated as proof.

Manual review found a password and a fixed OTP in `.tmp-pilot-unlock.sh` / `.tmp-pilot-fix.sh`, retained by an internal Codex turn-diff snapshot and current untracked files. The blobs are NOT reachable from origin. These scripts and the internal snapshot ref are NOT publication targets. Their originals stay in the private safety bundle; repository copies are REDACTED and explicitly non-executable archival documentation. No credential validity check was attempted. This was initially suspected to be a stash; exact ref inspection identified an internal Codex snapshot instead. Actual unreachable stash commits are separately preserved only after scanning.

**SECURITY INCIDENT — historical privacy exposure:** existing origin history contains a real owner's email in old Claude login/checkpoint reports, including `CLAUDE_EMAIL_OWNER_SHELL_AND_CALENDAR_FOLLOWUP_RESULTS.md`. Five historical blobs match this identity; no new matching blob was found among unpublished history. The value is deliberately not reproduced. No origin history was rewritten. Owner review/remediation of this already-public material is a separate task. This prevents claiming that all historical origin content is free of personal data. No raw customer export, production private key or production credential was identified in the proposed pushed material.

New documentation is sanitized independently; original hashes and paths remain in the manifest. Redaction also conservatively removes some synthetic examples. Redacted copies are archival references, not executable release-admission evidence. Public business contact information in historical product source is distinguished from customer PII. Temporary screenshots and raw captures are manifest-only; the named tracked Claude UI evidence image was visually inspected and contains service/schedule UI, not customer data.

All publication-target workflow versions were inspected for automatic production operations. Only CI/test workflows were found; no production SSH/deploy secret references. New snapshot/document commits use `[skip ci]` because this task does not recertify or alter product behavior.

No private backup refs or bundle files are to be pushed. Git author/committer provenance is retained; public developer metadata is not customer data.
