# Bounded Telegram attempt 04: invalid_client

Date: 2026-10-12 (Europe/Moscow).
Executed candidate: 3847f5150bba54ca73e2a092c3e5571e43149e0c.
Its executable bytes match the checked fc34d9c5522c85ef73753fa5e62008eaf55f7a65 checkpoint; the intervening commit is documentation only.

## Observed result

The owner explicitly approved one new local session, entered credentials manually,
signed into the retained Maya account and confirmed Telegram in clean Chrome.
The canonical callback reached link completion. Exactly one token exchange
returned HTTP 200 with the newly retained closed category oauth_invalid_client.
The category derives only from an exact top-level OAuth error string invalid_client
in the already-read response; no raw body or credential was retained.
Maya returned HTTP 400 / social_exchange_failed and did not create a link.

This establishes Telegram application-client authentication refusal. It does
not establish whether a wrong/stale Client Secret, mismatched Client ID, input
copying or another provider authentication issue caused it. No unverified
credential inspection or assertion of owner error is made. The configured public
Client ID matches the earlier owner screenshot; the current Login Widget pair
still needs to be reconciled without revealing the secret.

Readonly local evidence: zero selected-owner Telegram identities, one new
consumed auth flow and zero selected-owner audit actions. No JWKS fetch or
YCLIENTS dispatch occurred. Personal Client resolution was never reached.

The exact owned launcher was stopped with SIGINT. Receipt confirms cancelled,
clusterStopped, runtimeGroupAbsent, sourceUnchanged and samePrivateState. The
retained database is stopped and the launcher claim released. No retry occurred.

## Boundary

No product code changed during or after this attempt. No production change,
CRM write, SMS, model request, history import, grant or iPhone action occurred.
No new live permit is issued by this evidence update. The consumed plan/code
must not be reused. Do not repeat the same credential input blindly.

OAuth meaning: https://www.rfc-editor.org/rfc/rfc6749#section-5.2
Telegram credential/Basic exchange contract: https://core.telegram.org/bots/telegram-login

Safe machine projection: [attempt-04.json](attempt-04.json). Original private
receipt hashes are appended to [receipt-manifest.json](receipt-manifest.json).
Earlier unknown-error findings are preserved as history, not rewritten.
