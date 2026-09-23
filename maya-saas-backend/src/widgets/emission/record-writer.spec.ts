import type { WidgetComposerInput } from '../../widget-contract/envelope';
import type { WidgetIntent } from '../../widget-contract/intent';
import type { MintedIntentMaterial } from './record-writer';
import { intentRecordData } from './record-writer';

const input = (
  kind: WidgetComposerInput['kind_proposal'],
): WidgetComposerInput => ({
  kind_proposal: kind,
  capability: 'appointments.own.create',
  capability_version: 'fixture-version',
  source: { from: 'action_execution', execution_id: 'execution-1' },
  correlation_refs: { turn_id: 'turn-1' },
  origin: {
    trigger: 'system_reply',
    emitter: 'capability_read',
    moment_key: null,
    proactive_provenance: null,
  },
  facts: [],
  facts_origin: [],
  slots: {},
  limitation_codes: [],
  intent_proposals: [],
  locale: 'en',
});

const material = (key: string): MintedIntentMaterial => {
  const intent: WidgetIntent = {
    intent_ref: 'i1',
    intent_token: 'token-1',
    role: 'primary',
    label: 'Confirm',
    utterance_preview: 'Confirm',
    speech_aliases: ['confirm'],
    ordinal: 1,
    priority: 1,
    effect: 'COMMIT',
    capability: { space: 'AE', key },
    handoff_capability_ref: null,
    target: null,
    input_schema: null,
    verification_floor: 'SESSION_VERIFIED',
    confirmation: null,
    authority_hint: { emphasis: 'primary', disabled_because: null },
    enabled: {
      state: 'KNOWN',
      value: true,
      label: 'Confirm',
      reason_code: null,
      fact_ref: null,
      as_of: null,
      evidence_refs: [],
      next_intent_ref: null,
    },
    expires_at: '2026-09-23T01:00:00.000Z',
    single_use: true,
  };
  return {
    proposal: {
      intent_template_key: 'fixture@1',
      capability: intent.capability ?? undefined,
      role: 'primary',
    },
    intent,
    token: 'token-1',
    tokenHash: 'a'.repeat(64),
    selectionDomain: '{}',
    inputSchemaHash: null,
    utteranceTemplate: 'Confirm',
    selectionDomainLabels: null,
  };
};

const write = (key: string, confirmation_subject: unknown) =>
  intentRecordData({
    material: material(key),
    input: input('BOOKING_CONFIRMATION'),
    tenantId: 'tenant-1',
    widgetId: 'widget-1',
    principalProofHash: 'p'.repeat(64),
    bodyHash: 'b'.repeat(64),
    body: { confirmation_subject },
    issuedAt: new Date('2026-09-23T00:00:00.000Z'),
  });

describe('U7c mint-side BOOK.1 subject binding', () => {
  it.each([
    ['crm.appointment.create.v1', 'create'],
    ['crm.appointment.reschedule.v1', 'reschedule'],
    ['crm.appointment.cancel.v1', 'cancel'],
  ] as const)(
    'copies %s as the exact audit-retained %s subject',
    (key, subject) => {
      expect(write(key, subject).confirmationSubject).toBe(subject);
    },
  );

  it('refuses a body subject that does not select the COMMIT capability row', () => {
    expect(() => write('crm.appointment.create.v1', 'cancel')).toThrow(
      'booking_confirmation_subject_mismatch',
    );
  });

  it('refuses a missing or open subject instead of inventing one', () => {
    expect(() => write('crm.appointment.create.v1', null)).toThrow(
      'booking_confirmation_subject_invalid',
    );
    expect(() => write('crm.appointment.create.v1', 'update')).toThrow(
      'booking_confirmation_subject_invalid',
    );
  });
});
