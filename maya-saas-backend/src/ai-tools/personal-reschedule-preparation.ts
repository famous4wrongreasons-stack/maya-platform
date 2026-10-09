import type { ConversationSemanticPlan } from '../conversation-intelligence/conversation-intelligence.types';
import { mutationClarification } from './mutation-response';

/** Presentation for the exact validated own-list -> unresolved reschedule plan.
 * The caller still owns runtime admission and the current B26 result. Append
 * this only to a verified server-composed own-list reply, never to an unavailable
 * read. No appointment, availability, mutation arguments or authority are
 * inferred from the list, including when it contains only one appointment. */
export function rescheduleOwnReadClarification(
  plan: ConversationSemanticPlan | null,
): string | null {
  if (plan?.tasks.length !== 2) return null;
  const [read, reschedule] = plan.tasks;
  if (
    !read.id ||
    !reschedule.id ||
    read.id === reschedule.id ||
    read.intent !== 'booking.list_own' ||
    read.domain !== 'booking' ||
    read.action !== 'read' ||
    read.data_class !== 'C' ||
    read.permission.required !== 'appointments.own.read' ||
    read.permission.status !== 'allowed' ||
    read.tool.status !== 'ready' ||
    read.tool.name !== 'appointments.own.list' ||
    read.tool.alternatives.length !== 1 ||
    read.tool.alternatives[0] !== 'appointments.own.list' ||
    read.requires_clarification ||
    read.requires_confirmation ||
    read.depends_on.length !== 0 ||
    reschedule.intent !== 'booking.reschedule_own' ||
    reschedule.domain !== 'booking' ||
    reschedule.action !== 'execute' ||
    reschedule.data_class !== 'E' ||
    reschedule.permission.required !== 'appointments.own.reschedule' ||
    reschedule.permission.status !== 'allowed' ||
    reschedule.tool.status !== 'ready' ||
    reschedule.tool.name !== 'appointments.own.reschedule' ||
    reschedule.tool.alternatives.length !== 1 ||
    reschedule.tool.alternatives[0] !== 'appointments.own.reschedule' ||
    !reschedule.requires_clarification ||
    !reschedule.requires_confirmation ||
    reschedule.depends_on.length !== 1 ||
    reschedule.depends_on[0] !== read.id ||
    (Object.hasOwn(reschedule.entities, 'appointment') &&
      !plan.context.unresolved_references.includes('appointment'))
  )
    return null;

  // Reuse the existing finite preference formatter. Its single-task input is a
  // temporary view, not a replacement for the retained two-task semantic plan.
  return mutationClarification({
    ...plan,
    tasks: [{ ...reschedule, entities: { ...reschedule.entities } }],
    context: {
      ...plan.context,
      unresolved_references: [
        ...new Set([...plan.context.unresolved_references, 'appointment']),
      ],
    },
  });
}
