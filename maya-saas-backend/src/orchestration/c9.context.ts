import { Injectable } from '@nestjs/common';
import { C9Store } from './c9.store';
import { C9Sources } from './c9.sources';
import { C9_REGISTRY_HASH, c9Capability } from './c9.registry';
import {
  C9Domain,
  C9Object,
  c9Array,
  c9Bytes,
  c9Deny,
  c9Evidence,
  c9Hash,
  c9Id,
  c9Refs,
  c9SafeText,
} from './c9.contract';

/** Exists only inside one trusted invocation. Raw source identifiers never enter model context. */
export class C9Handles {
  private readonly sources = new Map<string, C9Object>();
  constructor(private readonly runId: string) {}
  add(value: unknown): string {
    const ref = c9Evidence(value) as C9Object;
    const key = 'h_' + c9Hash('context-handle/1', [this.runId, ref]);
    this.sources.set(key, ref);
    return key;
  }
  resolve(key: string): C9Object {
    const value = this.sources.get(key);
    if (!value) c9Deny('context_handle_unqualified');
    return structuredClone(value);
  }
  keys(): ReadonlySet<string> {
    return new Set(this.sources.keys());
  }
}

/** Qualified source adapters supply facts; conversation and notes are always untrusted. */
@Injectable()
export class C9ContextService {
  constructor(
    private readonly store: C9Store,
    private readonly sources: C9Sources,
  ) {}
  build(
    runId: string,
    domain: C9Domain,
    refs: unknown[],
    question: string,
    notes: string[] = [],
    channelProof?: string,
  ) {
    const normalized = c9Refs(refs) as C9Object[];
    const untrusted = {
      question: c9SafeText(question),
      explicitNotes: c9Array((v) => c9SafeText(v, 400), 20)(notes),
      authority: 'NONE' as const,
    };
    return this.store.transaction(channelProof, async (tx, principal, now) => {
      const root = await this.store.lock(tx, principal, runId, true, now);
      const handles = new C9Handles(root.id);
      const facts: C9Object[] = [];
      for (const ref of normalized) {
        const capability =
          ref.sourceType === 'MeasurementRevision'
            ? 'c7.measurement.read'
            : ref.sourceType === 'C8ResultRevision'
              ? 'c8.result.read'
              : null;
        if (!capability) c9Deny('context_fact_source_unavailable');
        c9Capability(capability, domain);
        // This reader repeats current source entitlements, including finance and exact staff scope.
        const projection = await this.sources.contextProjection(
          tx,
          principal,
          ref,
          now,
        );
        facts.push({
          capability,
          evidenceHandle: handles.add(ref),
          ...projection,
        });
      }
      const trusted = {
        principalKind: principal.kind,
        scopeHash: c9Hash('context-scope/1', [principal]),
        registryHash: C9_REGISTRY_HASH,
        domain,
        validUntil: root.validUntil.toISOString(),
        budgetManifestHash: c9Hash('context-budget/1', [
          root.budgetManifestJson,
        ]),
        // Actual source policy remains with its owner. Text never populates these fields.
        policyEvidenceHandles: [] as string[],
        sourceAuthority: 'CURRENT_SOURCE_READERS' as const,
      };
      const context = {
        contract: 'C9Context@1',
        trusted,
        facts,
        untrusted,
        output: {
          contract: 'AgentResult@1',
          maxBytes: 32768,
          maxFindings: 20,
          maxEvidence: 100,
          maxProposedActions: domain === 'BUSINESS_INTELLIGENCE' ? 0 : 12,
          hiddenReasoning: false,
          sourceMutationAuthority: false,
          memoryIsPolicy: false,
        },
      };
      c9Bytes(context, 32768); // Oversize fails explicitly; no hidden slicing of facts.
      return { context, handles };
    });
  }
}

/** Only schema-owned codes/values are used by source adapters; arbitrary labels are not copied. */
export function c9MetricCode(value: unknown): string {
  const code = c9Id(value) as string;
  if (!/^[a-zA-Z0-9_.:/-]+$/.test(code)) c9Deny('context_metric_code');
  return code;
}
