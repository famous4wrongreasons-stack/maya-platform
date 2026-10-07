# First Client binding: exact remaining decision

This is a code/contract inventory, not a new identity admission or production acceptance. It corrects the overly narrow first-link boundary in the earlier [owner React checkpoint](MAYA-PERSONAL-OWNER-REACT-CHECKPOINT-20261007.md): SB-1 V2 is not the only A18 path.

| Current evidence | Existing approved owner and result |
|---|---|
| Active verified exact `maya_user` link | `PersonalClientContextService.select(..., 'personal_client')` rechecks account/session/membership and that link. SB-1 personal booking is available independently of prior appointments. No reverification is required. |
| No prior Maya subject link episode (including revoked), but another active verified exact Client channel | A18 V1 `ClientChannelRuntimeService.resolve` (`a18.active-verified-client-channel.v1`) can issue a server challenge from that source channel. `ClientLinkChallengeService.consume` authenticates the destination Maya account and creates its initial link atomically through the existing link writer. This is an existing initial-binding mechanism, not a V2 successor. |
| Exact latest revoked Maya episode and the approved canonical CRM verification channel | [SB-1 V2](widget-release-programme/sb1-v2/CONTRACT.md) issues and consumes the subject-bound successor challenge through strict SMS verification. It never reactivates the revoked row. This is only for a former binding. |
| Never-linked Maya subject, no other verified Client channel and no V2 predecessor | The runtime V1 issuer cannot resolve trusted Client authority. An unlinked Maya JWT cannot bootstrap itself through `/client-channel/challenges`. V2 cannot supply an initial predecessor. The trusted initial Client-resolution source remains a product/identity decision. |

Existing V1 code: [runtime resolver](../../maya-saas-backend/src/crm/client-channel-runtime.service.ts), [challenge owner](../../maya-saas-backend/src/crm/client-link-challenge.service.ts), [link writer](../../maya-saas-backend/src/crm/client-channel-link.service.ts). The original [A18 assessment](CYCLE-06-BLOCKING-PACKAGE-5-A18-CLIENT-LINK-CHALLENGE-ASSESSMENT.md) defines trusted exact resolution followed by a one-time server challenge. Its historical schema/TTL STOP is not a current assertion that this later implemented mechanism is absent.

The missing product decision is precisely: **if a person has no verified MAYA Client channel, which trusted source proves that a particular same-tenant Client card belongs to that person?** A User row, `Client.userId`, phone/name equality, or an operator selecting a CRM card does not provide that authority. After selecting and approving the trusted resolver, the first-time carrier flow needs its explicit initiation, verification, refusal and audit evidence through A18. No schema change or new resolver is authorized by this note.

Do not send first-time visitors through predecessor reverification. The confirmed-Client personal booking development slice can continue while this bootstrap decision is open. No real SMS, new user linkage, production query or identity mutation was performed here.
