# Telegram → personal Client/history: remaining live preparation

This records existing contracts and exact operational gaps. It grants no live
execution authority and introduces no alternative identity or release engine.

## One list of owner input/actions

1. Inspect **@mayaos_login_bot → Login Widget → Allowed URLs** in BotFather.
   Provide only the registered origins/redirect URLs, never tokens or Client
   Secret. Current registration is not in repository evidence. It must not be
   inferred from a historical login. No BotFather setting is changed by this unit.
2. After those URLs are known, select and authorize the test entry/return pair.
   The web runtime requires the app and `/oauth-callback.html` on the **same
   origin**. The current remote callback is older; its bytes cannot be paired
   with this React build. Local HTTP success does not prove that Telegram accepts
   a loopback URL. No production deployment, tunnel, DNS/certificate changes or
   machine trust changes are implicitly authorized here.
3. Once the finite launch mode below is proved and pinned, approve a **single
   combined bounded acceptance scope** and supply any required credentials only
   through its reviewed private input. The prior public-catalog/model allowance
   has expired. No request for repeated key entry should precede a qualified
   launch. Current server-stored secrets are not copied into Git/chat/output.
4. Perform the actual Telegram consent/login yourself. For this saved owner,
   use password sign-in → existing A23 Telegram account link → separate fresh
   Telegram login. An existing owner role is not Client authority. Phone sharing
   must be freshly verified by Telegram; stored phone/identity is insufficient.
5. Explicitly authorize the existing history setting/consent operation and local
   reconciliation if included in the agreed acceptance. Login does not toggle
   consent or import history. A refusal/unlinked/pending state is recorded
   honestly, never repaired with hand-written identity rows or invented data.

Telegram's [official registration instructions](https://core.telegram.org/bots/telegram-login#registering-your-allowed-urls)
require pre-registered origins and specific OIDC redirects. The public read-only
probe does not verify that registration. Credentials are not needed to read it.

## Exact remaining engineering work (agent-owned)

- Qualify the concrete app/callback address together after the provider-allowed
  URL is established. The local serving defect is now fixed. No generic return
  relay, cross-origin message bridge or frontend identity authority is proposed.
- Extend the **existing** local launcher with a finite, separately admitted mode
  for this tenant/account/source; do not enable it in `read_setup_v1` or the
  three-question catalog mode. That mode is **not implemented by this unit**.
  Reuse retained-database/source pins, scoped environment, current canonical
  identity owners, finite request budgets, strict transport and cleanup.
- Bind Telegram exchanges to the canonical start/complete owners and verified
  login context. Preserve failed-state, issuer/audience/signature/expiry checks,
  tenant checks, one-use completion and predecessor/revocation semantics.
- Keep business writes, SMS/OTP, notifications, schedulers and model calls closed
  unless expressly included in a new finite allowance. No new model call is
  necessary just to prove account linking and Client resolution.
- Qualify exact history-setting/consent and manual reconciliation owners using
  isolated synthetic data before any retained-owner-data launch. Do not treat
  the synthetic harness's fixture setup as an operator execution path.

## Scope that must be stated before live approval

The existing initial Telegram resolver reads `CrmService.getClientRegistry`
through the YCLIENTS adapter. This is a paginated **salon-wide client registry**
read so it can prove a unique current phone match. The current source requests
ID, name, phone, visit count, sold amount and last visit date. It is not a read
of only the owner's preselected card, and the client-search HTTP POST is a read
operation. Do not describe it as a catalog-only or single-card request. No raw
registry/customer data may enter logs, receipts or the external model.

The initial personal binding creates local canonical Client/CRM/channel identity
records if the current source resolves uniquely. History reconciliation may
write local appointment projections. These are **local application writes**, not
YCLIENTS business mutations, and must be disclosed in the future launch scope.
History questions use the exact personal Client context and current settings;
no caller-selected Client, phone-as-authority, role widening or revoked-link
reactivation is permitted.

Real booking, reschedule/cancel, successor SMS verification, production changes,
grants and iPhone installation remain outside this preparation.
