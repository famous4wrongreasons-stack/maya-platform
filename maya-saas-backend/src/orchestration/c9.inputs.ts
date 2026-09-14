import { AiToolRegistryService } from '../ai-tools/ai-tool-registry.service';
import { MAYA_AI_TOOL_CATALOG } from '../ai-tools/ai-tool.catalog';
import { C9Capability } from './c9.registry';
import {
  C9Object,
  c9Deny,
  c9Enum,
  c9Id,
  c9Int,
  c9Nullable,
  c9Shape,
} from './c9.contract';
import { C9_POLICY_NAMESPACE, c9TenantContext } from './c9.policy';

const sourceRegistry = new AiToolRegistryService();
/** Normalize through the actual source contract before hashing. No arbitrary executable payload. */
export function c9OwnerDraft(
  cap: C9Capability,
  contract: string,
  value: unknown,
): C9Object | null {
  if (contract !== cap.inputContract) c9Deny('input_contract_version');
  if (cap.capabilityKey === 'c9.no_action') {
    if (value !== null) c9Deny('no_action_payload');
    return null;
  }
  if (MAYA_AI_TOOL_CATALOG.some((x) => x.name === cap.capabilityKey)) {
    sourceRegistry.get(cap.capabilityKey);
    return sourceRegistry.validateArguments(cap.capabilityKey, value);
  }
  if (
    [
      'c7.measurement.read',
      'c8.result.read',
      'b35.status',
      'owner_report.status',
      'owner_report.download',
    ].includes(cap.capabilityKey)
  )
    return c9Shape({ id: c9Id })(value) as C9Object;
  // The A22 handoff carries a typed draft of the confirmed tenant context. It is still the
  // existing owner that confirms it; this only fixes exactly what would be submitted.
  if (cap.capabilityKey === 'a22.configuration')
    return c9Shape({
      namespace: c9Enum(C9_POLICY_NAMESPACE),
      expectedRevision: c9Int(0, 1000000),
      previousRevisionId: c9Nullable(c9Id),
      content: c9TenantContext,
    })(value) as C9Object;
  // Source-specific write adapters are enabled by their package, never guessed from a name.
  return c9Deny('owner_draft_adapter_unavailable');
}
