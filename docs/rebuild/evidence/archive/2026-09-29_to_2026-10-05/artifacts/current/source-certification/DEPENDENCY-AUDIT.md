<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 814546eba6d002dec15ff33b7268e239e09e70d5e25b01c915084fb3ee5ef278 -->

# Required dependency audit

The unchanged Platform CI command `npm audit --omit=dev --audit-level=high` refused Nodemailer 9.1.1. The fix is isolated in commit `d3f720b8`: only the Nodemailer dependency and lock entry change to 10.0.13.

Nodemailer 10 requires Node >=20. This repository uses Node 22 in Platform CI and Node 24 in its Dockerfile, so the declared runtime already meets that requirement. The adapter still uses `createTransport`, `sendMail` and `close`. Its unit suite and a real stream-transport buffer-only probe pass; no SMTP delivery, email or OTP was sent.

Upstream sources: [10.0.0 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.0), [10.0.13 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.13). The final candidate's audit receipt records the observed vulnerability counts; no threshold or audit policy is weakened.
