## Closing the census: 135 untriaged surfaces, classified

### What the remainder actually was

The 135 rows were never a random tail. Ten of the seventeen inventoried channels are **100% untriaged** — `scheduler` 32/32, `smm-bot` 26/26, `public-community` 19/19, `web-push` 16/16, `social-publishing` 7/7, `realtime-voice` 7/7, `public-web-auth` 6/6, `guest-chat` 3/3, `sms` 3/3, `email` 1/1 — while `pwa` is 464/465 triaged and `telegram-bot`, `web-public`, `telegram-miniapp` and `backend` are complete. The debt was not hiding screens. It was hiding **everything that is not a screen**: timers, transports, stores, guards, a second product, and one security channel.

That shape explains the result below, and it is the honest headline: **82 of 135 (61%) are out of scope**, and saying so is the finding, not an evasion.

[NON-NORMATIVE] The methodological lesson is that triage ran surface-first through the bundle people could see, and stopped at the edge of the rendering layer.

### Counts

| Class | n | Share |
|---|---:|---:|
| OUT OF SCOPE WITH EXACT REASON | 82 | 60.7% |
| SETTINGS / SECURITY ONLY | 30 | 22.2% |
| LEGACY / UNREACHABLE | 14 | 10.4% |
| KEEP AS CHAT SURFACE | 4 | 3.0% |
| RETIRE AFTER PARITY | 3 | 2.2% |
| CONVERT TO WIDGET | 1 | 0.7% |
| KEEP AS FULLSCREEN SECONDARY | 1 | 0.7% |
| **Total** | **135** | **100%** |

### Counts by channel

| Channel | n | Chat | Widget | Fullscreen | Settings/Sec | Retire | Legacy | Out |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| scheduler | 32 | | | | | | 7 | 25 |
| smm-bot | 26 | | | | | | | 26 |
| public-community | 19 | | | 1 | 10 | | 1 | 7 |
| web-push | 16 | | | | 7 | 2 | 3 | 4 |
| native-shell | 8 | 2 | 1 | | 1 | 1 | | 3 |
| social-publishing | 7 | | | | | | | 7 |
| realtime-voice | 7 | 1 | | | 3 | | 2 | 1 |
| edge-relay | 6 | | | | 1 | | | 5 |
| public-web-auth | 6 | | | | 5 | | 1 | |
| guest-chat | 3 | 1 | | | | | | 2 |
| sms | 3 | | | | 3 | | | |
| pwa | 1 | | | | | | | 1 |
| email | 1 | | | | | | | 1 |

### The classification rule I applied

Two criteria, applied consistently, so the boundary is auditable rather than felt:

- **SETTINGS / SECURITY ONLY** — the row's job is to **decide or record** authority, consent or identity, **or** it is a user-facing settings/security control. These never become chat controls; chat may explain their state and `HANDOFF`, never actuate them. Grounded in contract §6.8: the eight `NEVER_CHAT_ACTUATED` acts whose only legal intent is `HANDOFF`, each demanding `SESSION_VERIFIED` or `STEP_UP_VERIFIED`, terminating at `shell.account`, `shell.connections`, `shell.privacy` or `shell.notifications`.
- **OUT OF SCOPE** — the row's job is to **move, store, schedule or shape bytes**, or it belongs to another product. Grounded in platform/channels §0, which excludes `scheduler` (32), `backend` (7), `edge-relay` (21), `smm-bot` (26) and `social-publishing` (7) from `ChannelProfile` by design, because a transport that could declare presentation capability is the shape of a fourth authority path.

An allowlist inside a relay is **hardening, not the authority decision** — the decision is made at the canonical owner — so relays stay out of scope even when they filter.

### The grouped rationales

**Group G — schedulers as emitters (25 rows).** A timer renders no envelope and owns no navigation. Its only human-visible output is one or more of the **12 canonical proactive outbound moments**, already inventoried as notification surfaces and bound by gate **G7** (identical `dedupe_key`, `notify_pref_key`, `once_per` and quiet-hours across push ↔ chat ↔ Telegram). Triaging the timer as a surface would double-count those twelve. Cutover owner: `CHANNEL`. Two rows carry sharper fences worth naming: `BillingSchedulerService` charges YooKassa per debtor — *no widget type may by itself confer finance permission*, and only a canonical owner may cause the effect; `ExpenseReminderScheduler` makes an explicit system-principal assertion, which is the mechanism that stops a schedule from acting as a person.

**Group H — dead registrations (7 rows).** Live registration, empty body. Verified in the canonical checkout, not inferred: `bot.py:4774` `_god_watch_job` → `{'status':'retired_no_canonical_operational_occurrence'}`; `:4778` `_dual_role_guard_job`; `:4790` `_reviews_job`; `lead_alerts.py:145` `scan_and_alert` → `'retired_unverified_lead_occurrence'`; `webhook_server.py:8834` / `:8885` / `:8901` → `return` / `return None`. **These are not free deletions.** Each empty body is frozen by a named AST ratchet — `package5_wave_rc_guard_contracts.py` contracts `r06`/`r08`, `package5_review_source_guard.py:32`, `package5_operational_work_runtime_guard.py:61` — so removal is a ratchet change owned by `AUTHORITY`, not a UX cleanup. One comment/behaviour disagreement is recorded: `god_watch`'s registration still claims «MAYA сама проверяет систему и оплаты» while the body returns a retired marker. The behaviour is authoritative.

**Group C — smm_bot is a separate product (26 + 3 shared rows).** The decision requested explicitly: **no, smm_bot is not in scope for the MAYA chat-first UX**, and the reason is structural rather than editorial. It has its own bot token (`smm_bot/config.py BOT_TOKEN`), its own deploy root (`/opt/smm_bot`), its own SQLite store (`/opt/smm_bot/scheduled.db`), and its own authority model — `is_admin(uid) := uid in config.ADMIN_IDS` (`bot.py:49-50`) — with **no tenant, no Membership, no Client/User record and no key in the C9 capability registry**. No salon client and no staff member can reach any of it. Bringing it in would not be a migration but a build: it would need a C9 registry key, a tenant-scoped authority path and a marketing-permission gate, and the rule *no widget type may by itself confer marketing permission* forbids founding that on an `ADMIN_IDS` list. Its Publer analytics are third-party reads, so they could not back a chart either — *charts render canonical C7/C8 data*.

**Group B — the native bridge (8 rows).** The hard constraint settles most of this: native is an out-of-repo Capacitor shell and an Android TWA over the **same** web bundle, one shared interaction contract, and no separate native widget architecture may be designed. Five plugin rows are therefore **declared capability ids** in `maya.native.bridge/1` §4, not destinations. But three are genuinely different, and I followed the prior round-2 adjudications rather than re-deciding them: `MayaVoiceRecorder` and `TeamVoicePlayer` are **already chat-native** (the composer's own input modality; an inline voice bubble), `MayaNfcWriter.writeUrl` is the batch's **one true conversion**, and `getPreviewAccess` is **authority**, pinned by N7 as `presentation only` because a device plugin that set entitlement would make a repackaged shell build an authority path.

**Group A — the public marketing site (3 rows) and Group E — edge transports (6 rows)** are covered by conflicts C3 and C5 respectively.

### The four rows that survive into the chat-first product

Of 135, only seven are product work, and they are worth naming individually:

1. **`realtime_bridge.run_session` → KEEP AS CHAT SURFACE.** Voice is the same conversation on a different tier, not a second product. Under R1 the `TEXT_ONLY` rendering is the conformance reference, so a spoken turn is a projection of the identical envelope — which is also why intent resolution on voice must be a deterministic match on `speech_aliases` or `ordinal` **before any LLM** (§6.9), never an LLM deciding what the user chose. FENCED today; reviving it is a build against `VoiceSurface@1`.
2. **Anonymous guest chat with MAYA → KEEP AS CHAT SURFACE.** Already chat-first; nothing to convert. What the contract adds is discipline: because the principal is an unauthenticated stranger, the envelope must carry **zero COMMIT intents** — the fundamental rule forbids a widget conferring consent, booking authority, marketing permission, finance permission, tenant authority or approval, and the VerificationLevel floor (Gate 4) refuses them on channel identity regardless.
3. **`MayaVoiceRecorder`, `TeamVoicePlayer` → KEEP AS CHAT SURFACE**, with their platform asymmetries carried forward verbatim (iOS multipart arrives empty; WKWebView stalls on streamed playback; the tenant bundle can hear MAYA but cannot record).
4. **`MayaNfcWriter.writeUrl` → CONVERT TO WIDGET.** A single-action staff card whose three tiers make *different promises* — the plugin writes, Web NFC writes through another dialog, the clipboard fallback does not write at all — and the bundle already varies the label. A card with one fixed label would tell staff a tag was written when only a link was copied. Tier, result and fallback must be distinct states.
5. **PWA moderation queue → KEEP AS FULLSCREEN SECONDARY.** A list-plus-decision stack does not fit a bubble, and each decision is an approval act no widget may confer. Summary card in chat, `HANDOFF` to the route, approve/reject only on the fullscreen surface, authorised by the `@Roles` gate on the moderation controller. **Defect to fix during migration:** today it opens only by hand-typing `?community_moderation` — a query-param door, not a route.

### Primary navigation: all 15 checked, none silently excluded

| Channel | n | Class | Why it is not silent |
|---|---:|---|---|
| smm-bot | 11 | OUT OF SCOPE | Primary nav **of smm_bot**, not of MAYA. Consequence stated and quantified in conflict C7: MAYA's own census is 101, not 112, and no retirement row depends on the exclusion. |
| public-web-auth | 3 | SETTINGS / SECURITY ONLY | **Survive** as shell destinations (`shell.account`, `shell.connections`), not as tabs. Sign-in is an identity act; chat may explain the state, never mint the session. |
| public-community | 1 | KEEP AS FULLSCREEN SECONDARY | **Survives** as a fullscreen route, with a discoverability defect named. |

### What I did not do

I did not overturn the nine prior adjudications hiding behind renamed rows; I translated them. I did not resolve the VKontakte policy conflict, the smm_bot authority hole, the realtime PII divergence or the duplicate front proxy — each is raised with its evidence and left to the owner. I did not convert any `UNKNOWN` or `FENCED` status into `RETIRED`: where the repository cannot see production, the row says *unresolved in this checkout*, because **UNKNOWN is never rendered as failure**, and that rule binds a triage record as firmly as it binds a widget.