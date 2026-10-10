# Owner registration and slug-fix checkpoint

`summary.json` separates three evidence classes:

- Actual manual owner signup and sign-in on runtime `03875b23523a578fad13ec0e8f7035dcd4e5a66b`, followed by clean stop and preservation of the database and service keys. CRM integrations remain zero. Only the supplied safe status projection was read.
- The slug fix published as `9aab0db141e3b624be0f81c745b8fa68caf06b01` over `e40d512de402f38211672dada26fcecf81217820`, bound by reviewed source-file SHA256 and exact published Git blobs: 45 passing backend unit tests and 91 passing current-React checks using a synthetic port. Independent review is `QUALIFIED_SOURCE_PASS`.
- Actual HTTP/PostgreSQL acceptance of the new `409`, and actual resume of the owner's preserved database, remain unqualified. No new owner token window is opened.

The four redacted summaries omit owner PII, canonical owner identifiers, private state paths, credentials, private-key hashes, screenshots and raw responses. The raw Jest output is not copied. Artifact digests identify only the supplied safe reports and these summaries; source digests identify code/build metadata, never private key material.

The original report locations, retained outside this archive, are:

- `/tmp/maya-owner-onboarding-handoff-20261010/status-final.json`
- `/tmp/maya-slugfix-independent-review-20261010.json`
- `/tmp/maya-onboarding-ui-slugfix-20261010-01/report.json`
- `/tmp/maya-signup-slug-backend-20261010-final.json`

The archiving step checked report counts, evidence digests and all 14 reviewed file hashes. It did not run tests, services, browser, network or database queries. Historical generic-500 HTTP/PG evidence is retained in the adjacent `maya-registration-form-20261010` archive and is not relabelled as new-409 acceptance.

The parent reports remote SHA verification for the published fix. Archiving verified the local Git blobs and did not contact the remote. Publication is not actual HTTP/PostgreSQL or same-database resume acceptance.
