# Native client search correction — paused for UI acceptance

The native search failure was reproduced through the actual YCLIENTS adapter and dossier handler: a synthetic network error returned «Клиент не найден». The adapter now propagates source failures and rejects missing/malformed lists or invalid identities as a whole; an observed empty array is preserved. Existing handler translates failure into «Поиск клиентов в CRM сейчас недоступен» before history, loyalty or recency reads. No product owner, permission or provider call was added.

265 component tests / four suites pass with synthetic transport. The adjacent marketing negative test proves no empty audience is persisted after search failure. Initial fixture failure and actual RED are both retained separately. See [checkpoint](evidence/maya-native-client-search-20261009/checkpoint.json).

Work paused on the owner's instruction to prioritize acceptance of the existing React/backend. No new HTTP/browser process was started. Production types/lint and final independent review remain NOT RUN; this change is not a released or user-reachable qualification. Shared adapter behavior also affects Altegio; separate phone lookup/registry methods remain outside this change. No actual provider/model, UI/restart, deployment or full MAYA/C10 acceptance.
