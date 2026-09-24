import { Inject, Injectable } from '@nestjs/common';
import type { C9WidgetTriggerPort } from '../../orchestration/c9-widget-trigger.port';
import { C9_REGISTRY_HASH } from '../../orchestration/c9.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { GATE6_OWNERS, PRINCIPAL_RESOLVER } from '../di-tokens';
import type { PrincipalResolver } from '../authority/principal-view';
import type { Gate6Owners } from '../owner-ports/gate6.owners.provider';
import { WidgetEmitterService } from '../emission/emitter.service';
import { WidgetStoresService } from '../stores/widget-stores.service';
import { progress } from '../orchestration/c9-widgets';

@Injectable()
export class C9ComposeTriggerService implements C9WidgetTriggerPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: WidgetEmitterService,
    private readonly stores: WidgetStoresService,
    @Inject(GATE6_OWNERS) private readonly gate6: Gate6Owners,
    @Inject(PRINCIPAL_RESOLVER) private readonly principals: PrincipalResolver,
  ) {}

  async afterRun(input: Parameters<C9WidgetTriggerPort['afterRun']>[0]) {
    const principal = await this.prisma.$transaction((tx) =>
      this.principals.resolve(tx),
    );
    if (principal === null) return null;
    const tenantId = principal.authority.tenantId;
    if (
      !(await this.gate6.grantsRequiredFeatures(tenantId, ['widgets.runtime']))
    )
      return null;
    const turn = await this.stores.ensureAssistantTurn({
      tenantId,
      conversationId: input.runId,
      turnIndex: 0,
      principalProofHash: principal.proofHash,
      channel: 'pwa',
      textContent: null,
      spokenTranscript: null,
    });
    return this.emitter.emit({
      tenantId,
      conversationId: input.runId,
      turnId: turn.id,
      kind: 'PROGRESS',
      principalProofHash: principal.proofHash,
      deliveryChannel: 'pwa',
      body: progress(input.runId, input.state) as unknown as Record<
        string,
        unknown
      >,
      ttlSeconds: 600,
      freshnessClass: 'live',
      principal,
      runWitness: { revisionId: input.revisionId, c9Domain: input.domain },
      composerInput: {
        kind_proposal: 'PROGRESS',
        capability: 'c9.run.status',
        capability_version: C9_REGISTRY_HASH,
        source: {
          from: 'orchestrator_state',
          run_id: input.runId,
          field: 'runStatus',
        },
        correlation_refs: { run_id: input.runId },
        origin: {
          trigger: 'system_reply',
          emitter: 'orchestrator',
          moment_key: null,
          proactive_provenance: null,
        },
        facts: [],
        facts_origin: [],
        slots: {},
        limitation_codes: [],
        intent_proposals: [
          {
            intent_template_key: 'control.run.cancel@1',
            capability: { space: 'CONTROL', key: 'control.run.cancel' },
            role: 'control',
          },
        ],
        locale: 'ru-RU',
      },
    });
  }
}
