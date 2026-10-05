<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 51221ed05b1090ef3b912bd421eaaf0fc72cba2006784805afa42d95025da4af -->

## What changed

- Added a separate MAYA OS Product & Architecture Extension under
  docs/MAYA_OS_PRODUCT_ARCHITECTURE_EXTENSION.
- Split the extension into 16 standalone chapters covering product doctrine,
  system architecture, canonical model, YCLIENTS integration, Customer 360,
  consent, business intelligence, orchestration, Maya Watch, opportunities,
  widgets, owner/employee/client experiences, governance and delivery.
- Added a README/index, reconciliation notes and shared delivery rules for
  Claude, Codex and Cursor.
- Linked the extension from the main documentation index.

## Relationship to PR #21

This PR is intentionally stacked on
agent/maya-os-architecture-specification, the head branch of PR #21.

It EXTENDS and DOES NOT REPLACE the existing MAYA OS Architecture
Specification. The PR #21 specification file is unchanged. Reconciliation
notes classify every new direction as KEEP, EXTEND, CHANGE or ADD and preserve
the existing strangler migration, canonical contracts, deterministic metrics,
typed tools, approvals, security and multi-tenancy foundations.

After PR #21 merges, this PR can be retargeted to main.

## Why

PR #21 defines the engineering foundation. This extension makes the product
above that foundation explicit: what Maya watches, how signals become governed
opportunities and actions, how identity and consent work, and what owners,
employees and clients experience.

## Impact

Documentation only. No application code, schemas, runtime configuration,
provider credentials or production behavior changed.

## Validation

- markdownlint-cli2: 0 issues across 20 changed Markdown files.
- markdown-link-check: all local links resolved.
- git diff --check: clean.
- Verified the PR #21 base specification is absent from this diff.
- Verified all 16 chapter files plus index, reconciliation and delivery rules
  are present.

## Review focus

- Confirm the EXTEND-not-REPLACE relationship and precedence rules.
- Review open ADR/spike items, especially YCLIENTS customer/consent coverage.
- Review consent and attribution language before implementation.
- Confirm the phased delivery order and first end-to-end cancellation recovery
  slice.
