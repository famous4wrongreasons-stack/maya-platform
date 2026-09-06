import ts from 'typescript';

/** Permanent B29/B30 Client-originated Appointment mutation guard.
 * Verified Client → Appointment.mayaClientId ownership → Action Engine.
 * Test exclusions are filename-qualified.
 */
export function scanClientAppointmentCancel(
  file: string,
  source: string,
): string[] {
  return scanClientAppointmentCommands(file, source);
}

export function scanClientAppointmentCommands(
  file: string,
  source: string,
): string[] {
  if (file.endsWith('.spec.ts') || file.endsWith('.architecture.ts')) return [];
  const failures: string[] = [];
  const dedicatedCancel = file.endsWith('client-appointment-cancel.service.ts');
  const dedicatedReschedule = file.endsWith(
    'client-appointment-reschedule.service.ts',
  );
  const initiator =
    file.endsWith('appointments.controller.ts') ||
    file.endsWith('appointments.service.ts') ||
    file.endsWith('ai-tool-handler.service.ts');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.body) {
      const name = node.name.getText(ast);
      const clientCancel =
        dedicatedCancel ||
        (file.endsWith('appointments.controller.ts') &&
          name === 'cancelAppointment') ||
        (file.endsWith('appointments.service.ts') &&
          name === 'cancelForClient') ||
        (file.endsWith('ai-tool-handler.service.ts') &&
          name === 'cancelOwnAppointment');
      const clientReschedule =
        dedicatedReschedule ||
        (file.endsWith('appointments.controller.ts') &&
          name === 'rescheduleAppointment') ||
        (file.endsWith('appointments.service.ts') &&
          name === 'rescheduleForClient') ||
        (file.endsWith('ai-tool-handler.service.ts') &&
          name === 'rescheduleOwnAppointment');
      if (!clientCancel && !clientReschedule) {
        ts.forEachChild(node, visit);
        return;
      }
      const body = node.body.getText(ast);
      if (
        /findForClient|updateForClient|get_or_create_client|findClientByPhone|phoneMatch|chat_id/.test(
          body,
        )
      )
        failures.push(`${name}: legacy User/phone/chat authority`);
      if (initiator && /appointment\.(?:update|updateMany|create)\(/.test(body))
        failures.push(`${name}: direct Appointment mutation from initiator`);
      if (
        initiator &&
        /adapter\.(?:cancel|reschedule)Appointment|cancelInCrmForClient|crmService\.(?:cancel|reschedule)Appointment\(/.test(
          body,
        )
      )
        failures.push(`${name}: direct provider mutation from initiator`);
      if (
        (name === 'cancelForClient' || name === 'cancelAppointment') &&
        !/clientAppointmentCanceler\.forAccount|cancelForClient\(/.test(body)
      )
        failures.push(`${name}: missing verified Client cancel initiator`);
      if (
        (name === 'rescheduleForClient' || name === 'rescheduleAppointment') &&
        !/clientAppointmentRescheduler\.forAccount|rescheduleForClient\(/.test(
          body,
        )
      )
        failures.push(`${name}: missing verified Client reschedule initiator`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (dedicatedCancel) {
    for (const required of [
      'clientChannelSubjectHash(',
      'links.length !== 1',
      'revokedAt: null',
      'mayaClientId: client.id',
      'executeInternalAppointmentCancelWithReceipt',
      'executeCancelAppointmentWithReceipt',
    ])
      if (!source.includes(required))
        failures.push(`Required cancel authority missing: ${required}`);
    if (/findForClient|updateForClient/.test(source))
      failures.push('Dedicated canceler still uses User association lookup');
  }
  if (dedicatedReschedule) {
    for (const required of [
      'clientChannelSubjectHash(',
      'links.length !== 1',
      'revokedAt: null',
      'mayaClientId: client.id',
      'executeInternalAppointmentRescheduleWithReceipt',
      'executeRescheduleAppointmentWithReceipt',
    ])
      if (!source.includes(required))
        failures.push(`Required reschedule authority missing: ${required}`);
    if (/findForClient|updateForClient/.test(source))
      failures.push('Dedicated rescheduler still uses User association lookup');
  }
  if (
    file === 'appointments/appointments.service.ts' &&
    !source.includes('this.clientAppointmentCanceler.forAccount(')
  )
    failures.push('HTTP cancel must use verified Client canceler');
  if (
    file === 'appointments/appointments.service.ts' &&
    !source.includes('this.clientAppointmentRescheduler.forAccount(')
  )
    failures.push('HTTP reschedule must use verified Client rescheduler');
  return failures;
}
