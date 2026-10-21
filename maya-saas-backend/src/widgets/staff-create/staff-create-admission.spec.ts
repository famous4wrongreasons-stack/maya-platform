import { staffCreateCapability } from '../../action-engine/staff-create.contract';
import {
  STAFF_CREATE_CAPABILITY,
  STAFF_CREATE_TOOL,
} from '../../crm/yclients-staff-create.contract';
import { isStaffQuickCreate } from './staff-create-widget.contract';
import { AE_WIDGET_COMMIT_ALLOWLIST } from '../authority/ae-commit-allowlist.runtime';
import { pairingForAe } from '../authority/propose-pairing';
import { allowedKinds } from '../../widget-contract/owner-classes';
import { AiToolRegistryService } from '../../ai-tools/ai-tool-registry.service';
import {
  resolveStaffCreateTemplate,
  STAFF_CREATE_APPROVE_TEMPLATE,
} from './staff-create-intent-template.registry';

describe('YC-ST1 exact typed admission', () => {
  it('has one exact owner pairing, REQUIRED AE approval and APPROVAL source, without extending legacy price origin', () => {
    expect(isStaffQuickCreate(staffCreateCapability)).toBe(true);
    expect(pairingForAe(STAFF_CREATE_CAPABILITY)?.propose).toEqual({
      space: 'C9',
      key: STAFF_CREATE_TOOL,
    });
    expect(AE_WIDGET_COMMIT_ALLOWLIST[STAFF_CREATE_CAPABILITY]).toEqual({
      confirmation_kind: 'APPROVAL',
      family: 'settings',
      requires_ae_approval: true,
      min_verification: 'SESSION_VERIFIED',
      propose: { space: 'C9', key: STAFF_CREATE_TOOL },
    });
    expect(
      allowedKinds({ space: 'C9', key: STAFF_CREATE_TOOL }).has('APPROVAL'),
    ).toBe(true);
  });
  it.each([
    { capability: 'crm.staff.anything' },
    { actionClass: 'create_account' },
    { targetKind: 'tenant_user' },
    { approvalRequirement: 'NONE' },
    { approvalTtlMs: 86400000 },
    { allowedSourceTypes: ['authenticated_request', 'background_job'] },
    { normalizedInputContract: 'anything' },
    { executorKey: 'generic.http' },
    { normalizeInput: (v: unknown) => v },
    { retry: { ...staffCreateCapability.retry, maxExecutionAttempts: 2 } },
    {
      reconciliation: {
        ...staffCreateCapability.reconciliation,
        retryAfterProvenNonExecution: true,
      },
    },
    { riskFacets: [...staffCreateCapability.riskFacets, 'tenant_wide'] },
  ])('refuses widened descriptor %p', (patch) =>
    expect(
      isStaffQuickCreate({
        ...staffCreateCapability,
        ...patch,
      } as typeof staffCreateCapability),
    ).toBe(false),
  );
  it.each([
    'phone_number',
    'user_id',
    'position_id',
    'method',
    'url',
    'employee_id',
  ])('rejects caller %s before normalization', (key) => {
    const registry = new AiToolRegistryService();
    expect(() =>
      registry.validateArguments(STAFF_CREATE_TOOL, {
        name: 'Synthetic',
        specialization: 'Test',
        [key]: 'forged',
      }),
    ).toThrow();
  });
  it('refuses price/goods capability and arbitrary handles at the staff template boundary', () => {
    const base = {
      proposal: {
        intent_template_key: STAFF_CREATE_APPROVE_TEMPLATE,
        role: 'primary' as const,
        capability: { space: 'AE' as const, key: STAFF_CREATE_CAPABILITY },
        argument_handles: { approval: 'sealed-handle' },
      },
      widgetKind: 'APPROVAL' as const,
      deliveryChannel: 'pwa',
    };
    expect(resolveStaffCreateTemplate(base).subject?.key).toBe(
      STAFF_CREATE_CAPABILITY,
    );
    expect(() =>
      resolveStaffCreateTemplate({
        ...base,
        proposal: {
          ...base.proposal,
          capability: { space: 'AE', key: 'crm.service.fixed-price.update.v1' },
        },
      }),
    ).toThrow();
    expect(() =>
      resolveStaffCreateTemplate({
        ...base,
        proposal: {
          ...base.proposal,
          argument_handles: { approval: 'sealed', phone: 'forged' },
        },
      }),
    ).toThrow();
  });
});
