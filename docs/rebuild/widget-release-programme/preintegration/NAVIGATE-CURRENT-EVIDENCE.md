# NAVIGATE — current authoritative implementation evidence

This is an additive erratum at backend code `000ed08f3769f8ec78f634c7c10f4643e2d3fe11`. The historical audit, its recorded evidence and decision sheets are unchanged. `current-audit.json` is the current overlay; a `built` annotation never promotes a clause.

| Clause | Current implementation owner | Executed proof | Current result |
|---|---|---|---|
| G12-R1b | `WidgetProjectorService.composeNavigate`: principal and tenant/authority fences, exact sealed source capability, registered canonical-read row; `detail` projection | `gate12-projector.live-spec.ts`: `G12-L20 NAVIGATE detail reprojects only from its sealed source capability`; full widgets-live 348/348 | `built: true`; document drift closed; whole-clause HTTP/BIN evidence remains missing |
| G12-I11 | `WidgetProjectorService` plus canonical read owner; no widget-owned PII masking. Stored `w` envelopes are resolved by `WidgetThreadPageService` after current authority | `projector-fences.architecture.spec.ts`: `composeNavigate requires detail plus exact sealed source evidence`, principal/authority refusal cases; full backend 5348/5348 | `built: true`; document drift closed; all registered target classes are not admitted by a production-triggered pair |
| G13-R2 | `WidgetEffectRouterService`: `detail` reprojects and mints successor; `w` resolves the stored sealed envelope; no business dispatch | `effect-router.service.spec.ts`: `G13-P02` and `G13-P02-W`; full backend 5348/5348 | `built: true`; document drift closed; whole-clause production-triggered pair remains absent |

The G12-L20 setup is injected-record/RI evidence. It proves the current implementation, not L conformance. Old source comments still describe the DEV-1 skeleton; executable method bodies and the tests above supersede that description. No Claude source, renderer, carrier or ratchet was edited to make this erratum.

Source pins:

- `maya-saas-backend/src/widgets/projection/widget-projector.service.ts` — SHA256 `88c1b235bbceabd134640795871fe241e4a4fa5914a7dfeb23febf4d7139457d`
- `maya-saas-backend/src/widgets/routing/effect-router.service.ts` — SHA256 `3a0c3291cce64dd0f3fb515af71cf9e7840faa69f78ce37a754e85bedfc6b636`
- `maya-saas-backend/src/widgets/resolve/thread-page.service.ts` — SHA256 `c65bea7d7509355bf26a4e86e6f0b078070ab682c7e057690e2d628cdd80701b`
- `maya-saas-backend/test/widgets-live/gate12-projector.live-spec.ts` — SHA256 `b37b6571613488382cdfc172205fe7a70a3b740a9e027f80ce0be9b1bfa68eb4`
- `maya-saas-backend/src/widgets/projection/projector-fences.architecture.spec.ts` — SHA256 `c5c38cb486b1578cf4c0f85ef11469021de5e883f26c8ff7c09d3edcc0de4c96`
- `maya-saas-backend/src/widgets/routing/effect-router.service.spec.ts` — SHA256 `292cff512d142315c31670678632c2e10e61023321a62b86c3c489b0561513ec`
