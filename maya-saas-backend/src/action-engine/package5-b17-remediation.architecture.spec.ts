import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const pwa = resolve(root, 'ai администратор');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

function pythonFunction(source: string, name: string) {
  const match = source.match(
    new RegExp(
      `(?:^|\\n)(?:async )?def ${name}\\([\\s\\S]*?(?=\\n(?:async )?def |$)`,
    ),
  );
  if (!match) throw new Error(`Missing production function ${name}`);
  return match[0];
}

describe('Package 5 B17 Client appointment identity remediation', () => {
  const webhook = read('ai администратор/webhook_server.py');
  const runtime = read(
    'maya-saas-backend/src/crm/client-channel-runtime.service.ts',
  );

  it('makes both PWA endpoints verified-channel initiators only', () => {
    const context = pythonFunction(webhook, '_client_record_request_context');
    const cancel = pythonFunction(webhook, 'client_cancel_record_handler');
    const reschedule = pythonFunction(
      webhook,
      'client_reschedule_record_handler',
    );
    expect(context).toContain('p5_b17_verified_client_appointment_authority');
    expect(context).toContain('client_commands.channel_proof');
    expect(cancel).toContain('"appointment-cancel"');
    expect(reschedule).toContain('"appointment-reschedule"');
    for (const source of [context, cancel, reschedule]) {
      expect(source).not.toMatch(
        /_authed_chat_id|database\.(?:get_client|get_or_create_client|has_valid_consent_by_chat_id|mark_cancel_actor|mark_reschedule_actor)|_yc\.|cancel_for_client|reschedule_for_client/,
      );
    }
  });

  it('accepts no caller-supplied Client, tenant, phone, staff, service or branch authority', () => {
    const context = pythonFunction(webhook, '_client_record_request_context');
    expect(context).toContain(
      'allowed = {"record_id", "date", "time", "datetime", "auth_data", "session_token"}',
    );
    const payload = runtime.slice(
      runtime.indexOf('private clientAppointmentPayload('),
      runtime.indexOf('private clientAppointmentServicesPayload('),
    );
    const authority = runtime.slice(
      runtime.indexOf('private async clientAppointmentAuthority('),
      runtime.indexOf('private async executeClientAppointment('),
    );
    expect(payload).toContain(
      "expected = reschedule ? 'recordId,start' : 'recordId'",
    );
    expect(runtime.slice(0, runtime.indexOf('issue(channelProof'))).toContain(
      'providerSubjectHash: channel.providerSubjectHash',
    );
    expect(authority).toContain('tenantId_crmProvider_crmExternalId');
    expect(authority).toContain(
      'appointment.mayaClientId !== identity.clientId',
    );
    expect(`${payload}\n${authority}`).not.toMatch(
      /phoneHash|clientPhone|chat_id|staffId|serviceIds|branchId/,
    );
  });

  it('reuses the approved cancel/reschedule Action Engine contracts and UNKNOWN handling', () => {
    const execution = runtime.slice(
      runtime.indexOf('private async executeClientAppointment('),
      runtime.indexOf('/** AC4 delivery reader'),
    );
    expect(execution).toContain('executeCancelAppointmentWithReceipt');
    expect(execution).toContain('executeRescheduleAppointmentWithReceipt');
    expect(execution).toContain("sourceType: 'authenticated_request'");
    expect(execution).toContain('authorizationCheck: async () =>');
    expect(execution).toContain('this.clientAppointmentAuthority(');
    expect(execution).toContain('actionExecutionResultFromError');
    expect(execution).toContain("execution.state === 'UNKNOWN'");
    expect(execution).toContain("execution_owner: 'action_engine'");
    expect(execution).not.toMatch(
      /adapter\.|cancelAppointment\(\{|rescheduleAppointment\(\{|provider\.put|fetch\(/,
    );
  });

  it('removes the retired phone/YClients owner from client_record_actions', () => {
    const source = read('ai администратор/client_record_actions.py');
    expect(source).toContain('def parse_new_datetime');
    expect(source).not.toMatch(
      /def (?:cancel_for_client|reschedule_for_client|_owned_upcoming_record)|client_phone|cancel_booking|reschedule_booking|get_record/,
    );
  });

  it('forwards signed Telegram and Maya session proof through the active proxy', () => {
    const proxy = read('сайт и приложение/pwa-assets/tg-auth/api-proxy.php');
    const branch = proxy.match(
      /case 'client_cancel_record':[\s\S]*?\n\s*break;/,
    )?.[0];
    expect(branch).toBeDefined();
    expect(branch).toContain('HTTP_X_TELEGRAM_INITDATA');
    expect(branch).toContain('HTTP_AUTHORIZATION');
    expect(branch).not.toMatch(/get_client|get_or_create_client|chat_id|phone/);
  });

  it('keeps the active B13-B17 PWA protection green', () => {
    const guard = resolve(pwa, 'package5_control_plane_runtime_guard.py');
    const result = execFileSync('python3', [guard, '--root', pwa, '--json'], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toMatchObject({
      pass: true,
      activePwaIncluded: true,
      b17ClientAppointmentLegacyIdentityOwners: 0,
    });
  });
});
