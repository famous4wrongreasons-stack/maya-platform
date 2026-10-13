# Dependency security preflight — 2026-10-13

Basis: clean `e7aac44bcd6ffaf1b6d7425f45915559975a8fb4`.
Branch: `codex/maya-local-crm-setup-20261010`.
This is local development evidence, not a release certificate or deployment.

The fresh isolated CI attempt installed the exact lock successfully, then the
blocking `npm audit --omit=dev --audit-level=high` exited 1: one critical,
one high and three moderate package findings. No PostgreSQL cluster, migration,
application, packaging or later CI step had started in that attempt.
The original audit and failed runner manifest are retained, not relabelled green.

## Minimal repair

| Dependency | Locked before | Locked after |
| --- | --- | --- |
| proxy-addr | 2.0.7 | 2.0.8 |
| sharp | 0.35.4 | 0.35.5 |
| ip-address | 10.4.0 | 10.7.4 |
| js-yaml under @nestjs/swagger | 5.2.3 | 5.4.3 |

Sharp's platform packages and libvips move together to their matching patch.
Only these dependency families and the package-root metadata changed in the
lock. The existing Swagger-specific override is raised within major 5; Swagger
and NestJS do not undergo a major upgrade. Minimum safe versions are retained in
the manifest. No application source, schema, authority, UI or runtime source is
changed. Dependency bytes do change, so earlier certificates are not inherited.

Primary upstream references:

- [proxy-addr maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h): repaired in 2.0.8.
- [Sharp 0.35.5 release](https://github.com/lovell/sharp/releases/tag/v0.35.5) and
  [maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w).
- [js-yaml maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-r3ph-w7gj-g6xm): repaired in 5.4.1.
- [ip-address maintainer advisory](https://github.com/beaugunderson/ip-address/security/advisories/GHSA-j6r3-76f7-8jcv): repaired in 10.7.1.

## Executed proof and its limits

The new auth dependency regression invokes the actual Express request IP
resolver and Maya's existing metadata reader, without opening a listener.
With the old dependency, both IPv6 trust-subnet counterfactuals accept a spoofed
IPv4 forwarding header: **2 FAIL / 2 PASS**. With the repaired dependency, all
four pass, including legitimate, correctly bounded forwarding.
This proves the library defect under those test configurations; it does not
claim that an uninspected production configuration used them.

Targeted repair checks: **44 PASS**, five suites: proxy resolution, auth
metadata, runtime configuration, actual image parsing and tenant PWA images.
Fresh production-dependency audit: **0 findings, exit 0**, with the same threshold.
The Sharp memory-corruption advisory is not reproduced using an exploit.
Actual image decoding is regression-tested on this Mac; no Linux exploit or
production acceptance is claimed.

These targeted receipts ran before commit in an explicitly labelled diagnostic
overlay. They are not final-candidate full CI or complete mutation evidence.
The interrupted clean CI attempt will restart on the committed repair.

## Isolation and provenance

The original backend dependency directory is a symlink to another worktree.
An explicit pre-install guard refused writing there. Dependency resolution,
installation and tests ran in the new disposable clone; only the reviewed lock
was copied back. No shared dependency directory was changed. The original source
worktree therefore still has the previous installed dependencies until a separate
private installation is prepared; current validation must use the new clone.

`proof-summary.json` lists actual counts and raw paths/hashes.
`dependency-audit-before.json`, `dependency-audit-after.json` and
`lock-diff.json` retain the measured comparison.
The failed isolated clone subsequently received only the labelled prospective
repair overlay; it is not a clean final-HEAD receipt.

Real owner data/keys, production, grants, OTP/SMS, YCLIENTS/model calls, device
installation and C10: untouched. Full qualification and real booking remain open.

## Committed-candidate follow-up

The [fresh follow-up packet](../maya-release-ci-followup-20261013/README.md) records
successful local CI and packaging on committed `a6d9c12d`, including 9,819 backend
tests, zero production-dependency findings, widget/runtime/staging checks and
synthetic browser lifecycle. It preserves the initial failed audit and a separate
failed runner setup rather than treating either as a mutation kill.

After the clean clone validation, the original dependency symlink was preserved
outside the checkout and a private dependency directory was installed from this
exact lock. The former target in the other worktree was not modified. The new
packet records the preserved path and lock hash in `PRIVATE-DEPENDENCIES.json`.
This supersedes only the local installation status above, not historical evidence
or certificate state.
