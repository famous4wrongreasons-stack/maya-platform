// ── GATE6_OWNERS — Gate 6's admission ports (GATES-PLAN-V11 U6-L1; R6-1, R6-2) ──────────────────
//
// «Gate 6 in full» names two owners and no more. C20 is one call:
// `AiToolPolicyService.assertCanExecute(principal, def)` over the 47 catalogue keys (C11:4761-4762).
// (e) is the other: "`EntitlementsService` grants every `requiredFeatures` entry" (C11:4755). Every
// other term of the block is a registry, a table or a generated predicate — a VALUE, imported
// directly, with no DI and no owner behind it. That is why `ActionEngineModule` is never imported
// here (R6-2): the Action Engine's rows arrive as values, and importing its module would put an
// executor in the widget layer's graph to read a table.
//
// The port is deliberately smaller than either owner's surface:
//   - `assertCanExecute` returns nothing and is allowed to THROW. The throw IS the refusal (G6-20,
//     C11:4779-4781), so the port never reports "false" — a boolean would have to be interpreted at
//     the gate, and interpreting it is deciding.
//   - `grantsRequiredFeatures` answers one boolean for the WHOLE list, because (e) is a conjunction
//     over the list and splitting it would let a partially-entitled tenant look admitted.
// Neither member takes a presentation input. FR-14 (C11:1798) is a property of this boundary as much
// as of the gate: "Gate 6 reads Membership / Staff / Client binding and never `presentation_mode`,
// `profile_id` or `a11y_env`", and `gate6.source.spec.ts` S-FR14 reads THIS file too.
//
// D-6 boundary: this file is under `owner-ports/`, the only place in the widget layer that may import
// an owner's service (k3 check 9; `widget-import-graph.architecture.spec.ts` D6-SERVICE, IR-G6-GRAPH).
// `gates/gate6.ts` imports the INTERFACE from here with `import type`, so the gateway's run-time
// import closure never reaches `AiToolPolicyService` or `EntitlementsService` through slot 6 — which
// is what keeps H6/B-22's SEAL-5 closure test true (`emission/seal-h6.architecture.spec.ts`).
//
// U6-L1 declares and binds this port; slot 6 does not CALL it yet. (d), (e) and C20 are a held lane
// (AMB-01a) until U6-L3 resolves the live principal, and they refuse until then. A bound port that
// nothing calls is not an enforced gate, and this file claims nothing else.

import { Injectable } from '@nestjs/common';

import { AiToolPolicyService } from '../../ai-tools/ai-tool-policy.service';
import type {
  AiToolDefinition,
  AiToolPrincipal,
} from '../../ai-tools/ai-tool.types';
import { EntitlementsService } from '../../entitlements/entitlements.service';

/**
 * The surface every widget-borne catalogue admission is tested under. A literal, not a parameter: a
 * widget submission arrives over the first-party web surface, and a surface the CALLER could choose
 * would be an authority input the caller supplies (FR-3). `gate6.source.spec.ts` S-SURFACE pins it.
 */
export const GATE6_SURFACE = 'web' as const;

/** What slot 6 may ask of an owner. Two members, and nothing to interpret. */
export interface Gate6Owners {
  /**
   * C20, the 47 (G6-14). Resolves nothing for a HANDOFF destination (G6-7): the gate decides that,
   * and this port is simply not called on that branch.
   */
  assertCanExecute(
    principal: AiToolPrincipal,
    definition: AiToolDefinition,
  ): Promise<void>;
  /** (e), G6-12: true only when EVERY entry of `requiredFeatures` is granted to `tenantId`. */
  grantsRequiredFeatures(
    tenantId: string,
    features: readonly string[],
  ): Promise<boolean>;
}

/**
 * The bound provider (R6-2): `GATE6_OWNERS` -> this adapter -> `AiToolPolicyService.assertCanExecute`
 * (`ai-tools/ai-tool-policy.service.ts:60`) and `EntitlementsService.hasFeature`
 * (`entitlements/entitlements.service.ts:183`).
 *
 * It holds no state and decides nothing. `assertCanExecute` is forwarded verbatim, including its
 * raise; `grantsRequiredFeatures` asks the owner once per entry and conjoins, because
 * `EntitlementsService` answers per feature and the gate needs the conjunction. The empty list is
 * `true` by the same reading the owner gives it: a capability that requires no feature is not
 * withheld for lack of one.
 */
@Injectable()
export class Gate6OwnersAdapter implements Gate6Owners {
  constructor(
    private readonly policy: AiToolPolicyService,
    private readonly entitlements: EntitlementsService,
  ) {}

  assertCanExecute(
    principal: AiToolPrincipal,
    definition: AiToolDefinition,
  ): Promise<void> {
    return this.policy.assertCanExecute(principal, definition);
  }

  async grantsRequiredFeatures(
    tenantId: string,
    features: readonly string[],
  ): Promise<boolean> {
    for (const feature of features)
      if (
        !(await this.entitlements.hasFeature(
          tenantId,
          feature as Parameters<EntitlementsService['hasFeature']>[1],
        ))
      )
        return false;
    return true;
  }
}
