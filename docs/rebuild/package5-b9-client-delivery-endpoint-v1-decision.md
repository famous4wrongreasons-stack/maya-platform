# Package 5 B9 — durable Client delivery endpoint decision

Status: **OWNER DECISION REQUIRED**. This is a B9 Final Remediation blocker,
not Wave 7. The approved `ClientWantedSlotInterest` schema and production
migration remain valid and require no change.

## Proven gap

The approved Client-only availability notification cannot be resumed safely for
a Telegram-only Client after the authenticated request has ended:

- `ClientChannelLink` stores only `providerSubjectHash`, an irreversible HMAC;
- `ClientWantedSlotInterest` intentionally stores no chat id or phone;
- `AuthIdentity` and `DevicePushToken` require Maya User, while Client without
  Maya User is an approved requirement;
- Communication Delivery needs a real `telegramChatId` or a Maya User target;
  its durable recipient identity is hashed after the address is supplied;
- legacy SQLite `clients.telegram_chat_id` is not canonical authority and cannot
  be used as a fallback.

Identity verification and delivery addressing are different capabilities. A
verified hash proves that the current channel matches a link; it cannot recover
where to send a later message.

## Options

### A — encrypted address on the verified link (recommended)

Add a nullable encrypted provider address to `ClientChannelLink`, populated only
while Maya is verifying/consuming the channel-link challenge. Telegram stores the
verified provider subject encrypted; Maya User delivery continues through the
already bound User. At delivery time Maya decrypts the address, recomputes the
existing subject HMAC, requires an exact match, checks that the link is active,
then re-evaluates current consent/preferences before Communication Delivery.

No raw address enters wanted-slot, audit, target references, logs, or result
payloads. Existing links receive no inferred/backfilled value. A Telegram-only
link without this field is not routable and must complete an explicit verified
link refresh before future delivery.

Schema scope: nullable `ClientChannelLink.deliveryAddressEncrypted String?`;
no new model; backfill `0`. The existing encryption envelope carries its own
format; any future key-version migration remains a separate security operation.

### B — User-backed channels only

Do not add schema. Deliver only when the canonical Client has a verified Maya
User binding and an existing eligible inbox/push destination. Telegram-only and
guest Clients may create interests, but Maya cannot later contact them and must
show that limitation before accepting the request. This is safe but removes the
core Telegram wanted-slot outcome for Clients without Maya User.

### C — separate ClientCommunicationEndpoint model

Create a new versioned endpoint model with encrypted address, verification
evidence, revocation and rotation lifecycle. This cleanly separates identity
links from delivery endpoints and scales to more providers, but adds another
model and a larger contract than B9 needs.

## Required owner decisions

```text
APPROVED OPTION: A / B / C
TELEGRAM-ONLY CLIENT DELIVERY REQUIRED IN B9: YES/NO
ENCRYPTED VERIFIED DELIVERY ADDRESS MAY BE PERSISTED: YES/NO
EXISTING LINKS BACKFILLED OR INFERRED: NO
LEGACY SQLITE chat_id FALLBACK: NO
DELIVERY ADDRESS MUST MATCH ACTIVE ClientChannelLink HMAC: YES
CONSENT/PREFERENCES RECHECKED AT DELIVERY TIME: YES
```

Recommendation: **A**. It is the smallest additive change that preserves the
approved Client-without-User contract and Telegram product behavior without
turning phone, legacy Client, or SQLite chat id into authority. It also keeps
provider addressing out of the Client-owned wanted-slot fact.
