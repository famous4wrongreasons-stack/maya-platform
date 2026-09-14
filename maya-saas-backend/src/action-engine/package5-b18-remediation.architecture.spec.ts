import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const pwa = resolve(root, 'ai администратор');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function pythonFunction(source: string, name: string) {
  const match = new RegExp(`(?:^|\\n)([ \\t]*)(?:async )?def ${name}\\(`).exec(
    source,
  );
  if (!match || match.index === undefined)
    throw new Error(`Missing production function ${name}`);
  const start = match.index + (match[0].startsWith('\n') ? 1 : 0);
  const indent = match[1];
  const tail = source.slice(start + 1);
  const nextFunction = tail.search(new RegExp(`\\n${indent}(?:async )?def `));
  const classEnd = indent ? tail.search(/\n(?=\S)/) : -1;
  const ends = [nextFunction, classEnd].filter((value) => value >= 0);
  return source.slice(
    start,
    ends.length ? start + 1 + Math.min(...ends) : undefined,
  );
}

describe('Package 5 B18 appointment provider-owner remediation', () => {
  it('keeps AI as a verified Client initiator without phone or direct provider authority', () => {
    const source = read('ai администратор/claude_ai.py');
    const command = pythonFunction(source, '_client_appointment_command');
    expect(command).toContain('current_context()');
    expect(command).toContain('command(operation, context.proof, payload)');
    expect(command).toContain('state == "UNKNOWN"');
    expect(command).not.toMatch(
      /database\.(?:get_client|get_or_create_client)|yclients\.(?:update_booking|cancel_booking|reschedule_booking)|_check_record_ownership|_resolve_user_record_id/,
    );

    const executeTool = pythonFunction(source, '_execute_tool');
    expect(executeTool).toContain('tool_name == "update_booking"');
    expect(executeTool).toContain('"appointment-services"');
    expect(executeTool).toContain('tool_name == "reschedule_booking"');
    expect(executeTool).toContain('"appointment-reschedule"');
    expect(executeTool).toContain('tool_name == "cancel_booking"');
    expect(executeTool).toContain('"appointment-cancel"');
  });

  it('retires every legacy journal mutation route in favor of CrmStaffAccess', () => {
    const source = read('ai администратор/webhook_server.py');
    const expected = new Map([
      ['panel_journal_attendance_handler', 'set_appointment_attendance'],
      ['panel_journal_add_service_handler', 'set_appointment_services'],
      ['panel_journal_set_services_handler', 'set_appointment_services'],
      ['panel_journal_set_duration_handler', 'set_appointment_duration'],
      ['panel_journal_set_client_name_handler', 'set_appointment_fields'],
    ]);
    for (const [name, action] of expected) {
      const handler = pythonFunction(source, name);
      expect(handler).toContain('canonical_staff_session_required');
      expect(handler).toContain('"canonical_authority": "CrmStaffAccess"');
      expect(handler).toContain(`"canonical_action": "${action}"`);
      expect(handler).toContain('"business_mutations": 0');
      expect(handler).toContain('status=410');
      expect(handler).not.toMatch(
        /_yc\.|dispatch_appointment_action|database\./,
      );
    }
  });

  it('maps all six active YClients mutation helpers to canonical appointment actions', () => {
    const source = read('ai администратор/yclients.py');
    const expected = new Map([
      ['update_booking', 'set_appointment_services'],
      ['set_record_attendance', 'set_appointment_attendance'],
      ['add_services_to_record', 'set_appointment_services'],
      ['set_record_services', 'set_appointment_services'],
      ['set_record_duration', 'set_appointment_duration'],
      ['set_record_client_name', 'set_appointment_fields'],
    ]);
    for (const [name, action] of expected) {
      const method = pythonFunction(source, name);
      expect(method).toContain('dispatch_appointment_action(');
      expect(method).toContain(`action_class="${action}"`);
      expect(method).not.toMatch(/self\._put\(|requests\.(?:put|request)\(/);
    }
  });

  it('routes Client service replacement through the existing Action Engine and rechecks authority before dispatch', () => {
    const runtime = read(
      'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
    );
    const controller = read(
      'maya-saas-backend/src/crm/client-channel.controller.ts',
    );
    const crm = read('maya-saas-backend/src/crm/crm.service.ts');
    const start = runtime.indexOf('async setClientAppointmentServices(');
    const end = runtime.indexOf('private clientAppointmentPayload(', start);
    const method = runtime.slice(start, end);
    expect(method).toContain('clientAppointmentAuthority(');
    expect(method).toContain("'set_appointment_services'");
    expect(method).toContain('executeResidualAppointmentWithReceipt(');
    expect(method).toContain('authorizationCheck: async () =>');
    expect(method).toContain("scope: 'client-channel.appointment.services.v1'");
    expect(controller).toContain("operation === 'appointment-services'");

    const dispatch = crm.indexOf(
      'dispatch: async (normalizedInput) =>',
      45_000,
    );
    const recheck = crm.indexOf(
      'await invocation.authorizationCheck?.();',
      dispatch,
    );
    const provider = crm.indexOf(
      'this.dispatchResidualAppointmentMutation(',
      dispatch,
    );
    expect(dispatch).toBeGreaterThanOrEqual(0);
    expect(recheck).toBeGreaterThan(dispatch);
    expect(provider).toBeGreaterThan(recheck);
  });

  it('keeps the active AI, journal, and adapter ratchet green', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = execFileSync('python3', [guard, '--root', pwa, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b18ActiveLegacyProviderMutationOwners: 0,
      b18LegacyAppointmentAuthorityBypasses: 0,
      b18AppointmentSitesMapped: '6/6',
    });
  });
});
