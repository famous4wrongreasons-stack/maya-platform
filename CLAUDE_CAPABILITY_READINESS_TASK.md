# Claude: consume the MAYA capability-readiness contract

Complete this frontend-only follow-up after the current trial/chat package. Do
not interrupt or discard uncommitted work on `codex/maya-os-trial-chat-fe`.

## Context

Codex has separated commercial entitlements from actual implementation
readiness and has made CRM selection fail closed. This prevents the UI from
offering a provider or feature merely because an enum/key exists.

Backend branch: `codex/capability-readiness-contract`.

Read:

- `docs/architecture/project-completion-audit-2026-07-13.md`
- `docs/product/plans-and-features.md`
- `docs/architecture/crm-integration.md`

## CRM provider selector

Fetch:

```http
GET /api/crm/providers
```

Use the server response as the source of truth:

- a provider may accept credentials only when `connectable=true`;
- show YClients and Altegio as real CRM choices;
- do not present `mock` as a real external CRM; it is local/test/trial preview
  data only;
- DIKIDI, Whitelines and Salon Online must not open a token form;
- they may be omitted or shown disabled with calm `Скоро`, but never as a
  successfully connectable choice;
- keep `Внутренний календарь MAYA` as the no-CRM production path.

Handle HTTP 400 with:

```json
{
  "error": {
    "code": "crm_provider_not_available"
  }
}
```

On this error, clear the token input from component memory, refresh the provider
catalog and return to provider selection. Never keep a CRM token in storage,
URL, logs or analytics.

## Feature surfaces

`GET /api/features/registry` now returns `schema_version=2`. Each feature has:

- `implementationStatus`: `platform_ready`, `current_runtime_only`, `partial`
  or `planned`;
- `availableIn`;
- optional `limitations`.

Rules:

- entitlement still controls commercial access;
- readiness controls whether a universal platform screen may claim the module
  works;
- do not render `planned` features as available;
- do not render `current_runtime_only` as completed universal MAYA OS modules;
- a `partial` feature may be shown only within its returned/documented limits;
- never unlock a feature from frontend readiness metadata.

## Files and verification

- Keep the existing MAYA/Aurora visual system.
- Mirror accepted PWA changes to iOS and run `npx cap sync ios`.
- Parse all inline scripts in both app bundles.
- Verify a planned CRM cannot be selected even from restored stale state.
- Verify a direct stale `dikidi` submission shows the recoverable unavailable
  state and stores no token.
- Verify YClients, Altegio and internal calendar remain reachable.
- Return `CLAUDE_CAPABILITY_READINESS_RESULTS.md` with changed files and tested
  paths.
