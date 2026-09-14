import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalUtcTransaction } from '../prisma/canonical-utc-transaction';
import { GovernedSettingsReadService } from '../package5-wave1/governed-settings.read';
import { C9Authority } from './c9.authority';
import { C9Sources } from './c9.sources';
import { C9_POLICY_NAMESPACE, C9PolicyDraft, c9PolicyDraft } from './c9.policy';
import { C9Object, c9Deny, c9Object } from './c9.contract';

const OWNER_ROLES = ['tenant_owner', 'business_owner'];

/**
 * P03 conversational intake. It reads the current confirmed configuration, turns an
 * extracted proposal into a typed draft and shows the exact material difference — and
 * then stops. Confirmation happens on the existing A22 `tenant_business_configuration`
 * ingress, performed by the actually authorized owner; a conversation is never an
 * approval, and this service writes nothing anywhere.
 */
@Injectable()
export class C9PolicyService {
  constructor(
    private readonly db: PrismaService,
    private readonly authority: C9Authority,
    private readonly governed: GovernedSettingsReadService,
    private readonly sources: C9Sources,
  ) {}
  /** Currently confirmed configuration as its owner reports it, or an explicit absence. */
  current(channelProof?: string) {
    return canonicalUtcTransaction(this.db, async (tx) => {
      const p = await this.authority.current(tx, channelProof);
      if (!p.userId) c9Deny('policy_requires_supported_reader');
      const confirmed = await this.governed.configuration(
        tx,
        p.tenantId,
        C9_POLICY_NAMESPACE,
      );
      return {
        contract: 'maya.c9-tenant-context-view/1',
        namespace: C9_POLICY_NAMESPACE,
        revision: confirmed.revision,
        revisionId: confirmed.previousRevisionId,
        // Absence is reported as absence; no default is presented as owner-confirmed.
        configured: confirmed.content !== null,
        content: confirmed.content,
      };
    });
  }
  /**
   * Validate an extracted proposal against the current revision and the live source refs
   * it names. Returns the typed draft an owner would confirm, plus what would change and
   * what this contract does not support.
   */
  draft(proposal: unknown, channelProof?: string): Promise<C9PolicyDraft> {
    return canonicalUtcTransaction(this.db, async (tx) => {
      const p = await this.authority.current(tx, channelProof);
      const [member] = await tx.$queryRaw<{ role: string }[]>`
        SELECT role FROM "Membership"
        WHERE "tenantId"=${p.tenantId} AND id=${p.membershipId} AND status='active' FOR SHARE`;
      // Only an owner may be shown a draft of owner configuration; the A22 ingress checks
      // this again at confirmation, so this is a courtesy denial, not the authority.
      if (!member || !OWNER_ROLES.includes(member.role))
        c9Deny('policy_owner_required');
      const confirmed = await this.governed.configuration(
        tx,
        p.tenantId,
        C9_POLICY_NAMESPACE,
      );
      const draft = c9PolicyDraft(
        {
          revision: confirmed.revision,
          id: confirmed.previousRevisionId,
          content: confirmed.content,
        },
        proposal,
      );
      // Every reference the draft names must qualify live, right now, for this principal.
      const refs = (c9Object(draft.content).strategyConstraints as C9Object)
        .valuationPolicyRef;
      if (typeof refs === 'string') {
        const row = await tx.tenantBusinessConfigurationRevision.findFirst({
          where: {
            id: refs,
            tenantId: p.tenantId,
            namespace: 'c8_valuation',
          },
        });
        if (!row) c9Deny('valuation_policy_reference');
      }
      return draft;
    });
  }
  /** Exposed so a caller can requalify a named source reference without a write. */
  qualify(refs: readonly unknown[], channelProof?: string) {
    return canonicalUtcTransaction(this.db, async (tx) => {
      const p = await this.authority.current(tx, channelProof);
      const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT now() now`;
      await this.sources.all(tx, p, refs, clock.now);
      return {
        contract: 'maya.c9-source-qualification/1',
        qualified: refs.length,
      };
    });
  }
}
