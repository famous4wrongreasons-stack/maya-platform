import { UserRole } from '../../common/domain.enums';
import { Injectable } from '@nestjs/common';
import { PersonalClientContextService } from '../../appointments/personal-client-context.service';
import { ClientAppointmentReadService } from '../../crm/client-appointment-read.service';
import { AiToolRuntimeService } from '../../ai-tools/ai-tool-runtime.service';
import type { PersonalSchedulePort } from './personal-schedule.port';
const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
@Injectable()
export class PersonalScheduleAdapter implements PersonalSchedulePort {
  constructor(
    private readonly contexts: PersonalClientContextService,
    private readonly owner: ClientAppointmentReadService,
    private readonly runtime: AiToolRuntimeService,
  ) {}
  async prepare(actor: Parameters<PersonalSchedulePort['prepare']>[0]) {
    const personal = await this.contexts.select(actor, 'personal_client');
    return { revalidate: () => personal.revalidate() };
  }
  async resolve(
    actor: Parameters<PersonalSchedulePort['resolve']>[0],
    completed: unknown,
  ) {
    if (actor.tenantId === null) return null;
    // The exact own-list invocation selects the personal read context. Business role alone
    // never passes this resolver, and no Client/phone/predecessor comes from arguments.
    const personal = await this.contexts.select(actor, 'personal_client');
    const source = object(completed)?.appointments;
    if (!Array.isArray(source)) return null;
    const ids = new Set(
      source
        .map((v) => object(v)?.id)
        .filter((v): v is string => typeof v === 'string'),
    );
    const current = await this.owner.forAccount(actor.tenantId, actor.userId);
    // Bounded first eligible canonical row; identity is its exact owner id, never its index/time.
    const row = current.find(
      (v) => ids.has(v.id) && v.is_upcoming && v.status !== 'canceled',
    );
    if (!row) return null;
    const serviceId = row.service_ids.length === 1 ? row.service_ids[0] : null;
    let rescheduleStart: string | null = null,
      rescheduleEnd: string | null = null;
    if (serviceId !== null) {
      const answer = await this.runtime.execute(
        actor,
        'booking.availability.read',
        {
          surface: 'web',
          arguments: {
            date: row.start_at.toISOString(),
            service_ids: [serviceId],
            staff_id: row.staff_external_id,
            ...(row.branch_id === null ? {} : { branch_id: row.branch_id }),
          },
        },
        { suppressWidgetTrigger: true },
      );
      const result = object(answer);
      const slots =
        result?.status === 'completed' ? object(result.result)?.slots : null;
      if (Array.isArray(slots)) {
        const target = slots
          .map(object)
          .find(
            (s) =>
              s &&
              typeof s.start === 'string' &&
              typeof s.end === 'string' &&
              s.staff_id === row.staff_external_id &&
              Date.parse(s.start) > Date.now() &&
              Date.parse(s.start) !== row.start_at.getTime(),
          );
        if (target) {
          rescheduleStart = target.start as string;
          rescheduleEnd = target.end as string;
        }
      }
    }
    await personal.revalidate();
    return {
      canManageAsClient:
        actor.role === UserRole.CLIENT || actor.role === UserRole.CUSTOMER,
      appointmentId: row.id,
      start: row.start_at.toISOString(),
      end: row.end_at.toISOString(),
      serviceId,
      staffId: row.staff_external_id,
      title: row.services.map((s) => s.name).join(', ') || 'Запись',
      rescheduleStart,
      rescheduleEnd,
      revalidate: async () => {
        await personal.revalidate();
        if (
          !(await this.owner.forAccount(actor.tenantId!, actor.userId)).some(
            (v) =>
              v.id === row.id &&
              v.start_at.getTime() === row.start_at.getTime() &&
              v.end_at.getTime() === row.end_at.getTime() &&
              v.staff_external_id === row.staff_external_id &&
              JSON.stringify(v.service_ids) ===
                JSON.stringify(row.service_ids) &&
              v.status === row.status,
          )
        )
          throw new Error('personal_appointment_changed');
      },
    };
  }
}
