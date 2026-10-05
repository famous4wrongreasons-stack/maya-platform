import { createHash } from 'node:crypto';
import { MAYA_AI_TOOL_CATALOG } from '../../ai-tools/ai-tool.catalog';
import {
  C9_CAPABILITIES,
  C9_REGISTRY_HASH,
} from '../../orchestration/c9.registry';
import { c9Hash } from '../../orchestration/c9.contract';
import { PROFILE_REGISTRY } from '../../entitlements/widget-release-profile.registry';
import {
  C9_DENIAL_PROJECTION,
  LIMITATION_REASON_TABLE,
  REFUSAL_PHRASES,
} from '../../widget-contract/reason-table';
import { projectC9Denial } from '../rendering/denial-projection';
import { WIDGET_CAPABILITY_POLICY } from './capability-policy';
import { c9Floor } from './verification-floor.runtime';

const admitted = 'business.rules.read';
const reasons = [
  'conversation_intent_hash',
  'conversation_read_only',
  'conversation_read_run_required',
  'conversation_turn_unavailable',
  'read_work_in_progress_or_unknown',
  'source_read_receipt',
  'source_read_replay_changed',
  'source_read_unconfirmed',
  'source_replay_owner_required',
];

describe('F36b/P10 — owner decision 2026-10-05; no expanded authority or public outcome', () => {
  it('admits only the existing C9 row and preserves every previous registry object', () => {
    expect(C9_REGISTRY_HASH).toBe(
      'd88986622d4226015298ba8b2255994ec7684bcbb5bde79883fdd2dd13732918',
    );
    expect(
      c9Hash(
        'registry/1',
        C9_CAPABILITIES.filter((row) => row.capabilityKey !== admitted),
      ),
    ).toBe('4a6aaf7e7507af6f1ae9ed128cd6820fec2827596baa0cd2aabc66486a05ab63');
    expect(
      C9_CAPABILITIES.find((row) => row.capabilityKey === admitted),
    ).toMatchObject({
      domains: ['ADMIN'],
      mode: 'READ',
      resourceClass: 'SOURCE_READ',
      principalKinds: ['USER'],
      ownerKey: 'existing.ai-tool:business.rules.read',
    });
    expect(
      PROFILE_REGISTRY.successorCapabilities.filter((key) => key === admitted),
    ).toEqual([admitted]);
  });

  it('keeps exactly the current staff roles, empty read input and SESSION_VERIFIED floor', () => {
    const tool = MAYA_AI_TOOL_CATALOG.find((row) => row.name === admitted)!;
    expect([...tool.allowedRoles].sort()).toEqual([
      'accountant',
      'administrator',
      'branch_manager',
      'business_owner',
      'employee',
      'manager',
      'provider',
      'staff',
      'tenant_admin',
      'tenant_owner',
    ]);
    expect(tool.riskTier).toBe('read');
    expect(tool.inputSchema).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {},
    });
    expect(WIDGET_CAPABILITY_POLICY[`C9:${admitted}`]).toMatchObject({
      min_verification: 'SESSION_VERIFIED',
      consent_class: 'none',
      dispatch_is_synchronous: true,
    });
    expect(c9Floor({ space: 'C9', key: admitted })).toBe('SESSION_VERIFIED');
  });

  it.each(reasons)(
    'registers %s without changing its public state, reason, severity or phrase',
    (code) => {
      expect(
        Object.prototype.hasOwnProperty.call(C9_DENIAL_PROJECTION, code),
      ).toBe(true);
      const projection = projectC9Denial(code);
      expect(projection).toEqual({
        cell_state: 'UNAVAILABLE',
        reason_code: 'PROVIDER_SILENT',
        limitation_severity: 'limitation',
      });
      expect(
        REFUSAL_PHRASES[
          LIMITATION_REASON_TABLE[projection.reason_code].text_key
        ],
      ).toBe('Источник пока не отвечает.');
    },
  );

  it('preserves all 118 previously registered projections exactly', () => {
    const previous = Object.keys(C9_DENIAL_PROJECTION)
      .filter((key) => !reasons.includes(key))
      .sort();
    expect(previous).toHaveLength(118);
    expect(
      createHash('sha256')
        .update(
          JSON.stringify(
            previous.map((key) => [key, C9_DENIAL_PROJECTION[key]]),
          ),
        )
        .digest('hex'),
    ).toBe('24881eb9cc16dea2b8d30d658c097e47ab92e80cc523186d314055d612b8154a');
  });
});
