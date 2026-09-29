# SB-1 fresh OTP verifier — owner decision and implementation boundary

The owner approved re-verification Option B: fresh server-issued OTP/challenge delivered to the canonical channel of the exact Client, resolved server-side from existing canonical identity lineage and Client/CRM data.

This does not grant Client authority to TENANT_OWNER. Phone equality, Telegram login and revoked evidence remain insufficient. The successful new proof must bind authenticated User, tenant, exact Client, verification channel and expected latest revoked predecessor. A new successor episode is atomic, single-use and current; the revoked predecessor stays immutable.

A versioned ClientLinkChallenge successor-consumption extension is approved in principle, preserving the initial-link contract and reusing ClientChannelLink lineage. The owner explicitly requires a further STOP before migration if additional persistent correlation fields are needed. Four immutable JSON members are proposed in SCHEMA-DECISION.md; their decision is pending at this checkpoint. No new model or SQL column is proposed.

The owner's completed caveat: if no safe OTP provider/path exists for this Client channel, stop only that sub-unit as VERIFIER TRANSPORT MISSING; do not build new SMS infrastructure inside SB-1.

Source inspection found the existing PhoneAuthDeliveryService SMS.ru implementation and existing CRM registry owner. The independent foundation reuses these; it neither creates a second provider nor treats debug/test delivery as evidence. Production credentials/configuration and actual delivery were not inspected or exercised.

Approved code/test work completed here: canonical candidate/channel resolution and strict delivery adapter. No candidate is labelled verified, no new public route is registered, no OTP challenge coordinator or successor consumer is wired. The initial-link methods/SQL and all historical episodes remain unchanged.

No real OTP, production data mutation, widgets.runtime activation, YCLIENTS effect, carrier edit, Claude merge or Chapter 10 work is authorized or performed.
