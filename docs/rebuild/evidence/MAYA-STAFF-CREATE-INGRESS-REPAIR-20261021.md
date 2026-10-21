# YC-ST1 canonical ingress repair

Base: `4e12b4ba8f58db77d016f0212a7556be65622e4f`. This is a focused repair of the
staff quick-create slice, not certification or activation. No real provider,
production, phone, secret, grant, or release-profile changes were performed.

The fresh RED run reproduced seven failures across the six architecture suites.
CRM imported ActionEngineKernel directly; the generic AE input contract imported
CRM validation; the new finite owner bindings had not updated the exact boundary
census. These were real source/boundary defects, not waived gates.

CRM now calls the finite RuntimeService approval bridge. It requires the exact
staff capability/source/approval/actor, rereads owner authorization before ingress
and immediately before the existing REQUIRED approval transition. Kernel CAS,
active membership, policy binding and expiry checks are unchanged. The owner
retains its advisory lock, source revision, current grant, approval, principal and
persisted user-turn checks. UNKNOWN never gains a second dispatch.

AE independently validates its closed normalized input, following the existing
service-price contract pattern. CRM/provider ownership is no longer imported by
AE. Positive and adversarial normalization parity is tested.

Only exact staff importer paths and its exact DI token were added to the boundary
census and K3. Direct executor access and unbound importers are still refused.
The fact exception follows the exact typed presenter and lexical evidence binding,
never a whole-file waiver; changed type, evidence binding, gate slot or injected
AdmissionFacts access is refused.

Fresh verification on the repair source:

- 10 focused suites: 226 PASS, 0 FAIL.
- Final strengthened fact/DI boundaries: 55 PASS, 0 FAIL (overlaps the previous set;
  one added counterfactual, not 281 distinct tests).
- Fresh owned PostgreSQL16, canonical HTTP/chat/approval/AE/native synthetic
  provider: 16 PASS, 0 FAIL; the owned cluster was stopped. Lost-response UNKNOWN,
  six concurrent retries, six simultaneous decisions, wrong tenant, revocation,
  expiry, erased turn, source and approval substitution remain covered.
- Canonical product typecheck and changed-file ESLint PASS; K3 10/10 PASS.
- An initial raw all-test `tsc --noEmit` encountered pre-existing test-only type
  debt; it is not claimed green. The canonical `npm run typecheck` passed.

Full Platform CI/release certification remain the integration owner's next step.
The complete D2 still remains PARTIAL: service rename inherited-title semantics
and service/staff technological-card binding are not implemented by this repair.
The planner projection/registry/profile sources and the fixed phone admission
certificate are unchanged by this repair.

Receipts are held under the local completion-20261021 output directory. Hashes
preserve exact provenance without including raw diagnostic logs in the repo.

| Receipt | SHA256 |
| --- | --- |
| `d2-ingress-repair-red.log` | `581f712893619972f0bda0a41f4bde25b252926de83e29e1ce0719acf8768f6c` |
| `d2-ingress-green-final.json` | `5f2e746b878dba049335b978e3ef0fe7ef85e4c37f8e6f05ee9d732249ad956d` |
| `d2-ingress-boundary-final.json` | `1718e7b2de8b7ab0f2a7a6f2ad44e748bb160b9822f4e0d3abffaca3fc317df9` |
| `d2-ingress-typecheck.log` | `65e6162d314e77002547ea047c39dd701a0280ad8f0918e2583dd4aea942567d` |
| `d2-ingress-lint.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `d2-ingress-lint-final.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `d2-ingress-k3.log` | `1c7c77013e091146f31e53e315379541d6291df0accf35b1da76b5ed81461024` |
| `d2-ingress-http-proof/manifest.json` | `e80effdb89639c98650c0c3869f95930ff2b1c8a8ec9f98f0c35d28de842ea5e` |
| `d2-ingress-http-proof/staff-create-jest.json` | `9aac845aa9dc14fc2fea2dfd06234c90fcbd4b9735cfeb8b799c77ec1841341e` |
