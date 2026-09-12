# Certified relay fixture

`api-proxy.sanitized.php` is static input for the existing B13/B14/B16/B17
architectural ratchets. It is **not a deployable PHP entrypoint**. Tests read its
text; they must not execute it or load adjacent configuration.

The owner approved recovery from the exact deployed salon relay. Provenance pins
the certified production SHA-256 and recovered fixture SHA-256. Only the quoted
values of `PARTNER_TOKEN` and `COMPANY_ID` are substituted. Every other byte,
including routes, targets, credential forwarding, method handling, validation,
headers, early refusals and compatibility branches, is unchanged. Public hosts
remain because they are part of the routing/security assertions. No `tg-config.php`,
environment file or included secret is copied.

The full original is deliberately outside Git. The evidence replay accepts a
private local copy, verifies its certified hash, performs exactly the two
substitutions and compares every resulting byte. The PHP parser/token proof does
not run the application. The backend release uploads only its existing compiled
release inputs, not this test fixture.

A future deployed relay change requires a new source hash and equivalence review;
editing assertions or this fixture to conceal a runtime difference is forbidden.
