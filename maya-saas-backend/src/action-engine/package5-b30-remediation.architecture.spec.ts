import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('Package 5 B30 Client appointment reschedule remediation', () => {
  it('keeps HTTP reschedule as a verified Client initiator without User association authority', () => {
    const controller = read(
      'maya-saas-backend/src/appointments/appointments.controller.ts',
    );
    const service = read(
      'maya-saas-backend/src/appointments/appointments.service.ts',
    );
    const rescheduler = read(
      'maya-saas-backend/src/crm/client-appointment-reschedule.service.ts',
    );
    const start = service.indexOf('async rescheduleForClient(');
    const end = service.indexOf('getAvailableSlots(tenantId: string', start);
    const method = service.slice(start, end);
    expect(controller).toContain(
      'this.appointmentsService.rescheduleForClient(',
    );
    expect(method).toContain('this.clientAppointmentRescheduler.forAccount(');
    expect(method).not.toMatch(/findForClient|updateForClient/);
    expect(method).not.toMatch(
      /appointmentRepository\.update|crmService\.rescheduleAppointment\(/,
    );
    expect(rescheduler).toContain('mayaClientId: client.id');
    expect(rescheduler).toContain(
      'executeInternalAppointmentRescheduleWithReceipt',
    );
    expect(rescheduler).toContain('executeRescheduleAppointmentWithReceipt');
    expect(rescheduler).not.toMatch(
      /findForClient|updateForClient|clientId: userId/,
    );
  });

  it('executes internal and CRM-backed reschedule through the existing reschedule_appointment action', () => {
    const crm = read('maya-saas-backend/src/crm/crm.service.ts');
    const internal = crm.slice(
      crm.indexOf('async executeInternalAppointmentRescheduleWithReceipt('),
      crm.indexOf('private persistInternalRescheduledAppointment('),
    );
    const plan = crm.slice(
      crm.indexOf('private async rescheduleAppointmentActionPlan('),
      crm.indexOf('async payVisit('),
    );
    expect(internal).toContain("capability: 'crm.appointment.reschedule.v1'");
    expect(internal).toContain('await invocation.authorizationCheck?.()');
    expect(internal).toContain('persistInternalRescheduledAppointment(');
    expect(internal).toContain('mayaClientId');
    expect(plan).toContain('await invocation.authorizationCheck?.()');
    expect(plan).toContain('adapter.rescheduleAppointment(');
    expect(plan).toContain('persistRescheduledAppointmentMirror(');
    expect(plan).toContain("outcome: 'PROVEN_NOT_EXECUTED'");
  });

  it('keeps AI reschedule on the same verified Client initiator', () => {
    const source = read(
      'maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts',
    );
    const start = source.indexOf('private async rescheduleOwnAppointment(');
    const end = source.indexOf('private appointmentActionInvocation(', start);
    const method = source.slice(start, end);
    expect(method).toContain('this.appointmentsService.rescheduleForClient(');
    expect(method).not.toMatch(
      /findForClient|updateForClient|mayaClientId: principal/,
    );
  });
});
