// Owner spies (plan §4.2): observe whether the widget route reached a canonical owner, without
// changing what the owner does.
//
// A spy wraps the owner's REAL method (`jest.spyOn(Owner.prototype, method)` keeps the implementation),
// so it counts calls and alters nothing. It is installed on the prototype, so it sees a call made
// through ANY instance: the one Nest constructed in an HTTP-level application, or one a gate might
// construct itself in a gateway-level module where the owner is not a provider at all. For an
// application context, `ownersAbsentFrom` names the owners the container does not hold and throws if an
// instance it does hold shadows the prototype method, which a prototype spy would not see.
//
// The owner set is G12 §6.2's: every canonical read a widget answer could be composed from.

import type { INestApplicationContext, Type } from '@nestjs/common';

import { AiToolRuntimeService } from '../../../src/ai-tools/ai-tool-runtime.service';
import { ClientAppointmentReadService } from '../../../src/crm/client-appointment-read.service';
import { MeasurementReadService } from '../../../src/measurement/measurement.read.service';
import { C9Execution } from '../../../src/orchestration/c9.execution';
import { C9Store } from '../../../src/orchestration/c9.store';
import { C8ReadService } from '../../../src/valuation/c8.read';

export interface OwnerMethod {
  readonly owner: Type<unknown>;
  readonly method: string;
}

/** G12 §6.2's owner spies. */
export const CANONICAL_READ_OWNERS: readonly OwnerMethod[] = Object.freeze([
  { owner: AiToolRuntimeService, method: 'execute' },
  { owner: MeasurementReadService, method: 'read' },
  { owner: MeasurementReadService, method: 'snapshot' },
  { owner: C8ReadService, method: 'list' },
  { owner: C8ReadService, method: 'snapshot' },
  { owner: C9Store, method: 'snapshot' },
  { owner: C9Store, method: 'review' },
  { owner: C9Store, method: 'revision' },
  { owner: C9Store, method: 'cancel' },
  { owner: C9Execution, method: 'status' },
  { owner: ClientAppointmentReadService, method: 'forAccount' },
]);

export const ownerMethodName = (m: OwnerMethod): string =>
  `${m.owner.name}.${m.method}`;

export interface OwnerSpies {
  /** Calls per `Owner.method` since installation (or the last `reset`). */
  calls(): Record<string, number>;
  /** The `Owner.method` names that were called at least once. */
  called(): string[];
  reset(): void;
  restore(): void;
}

export function installOwnerSpies(
  owners: readonly OwnerMethod[] = CANONICAL_READ_OWNERS,
): OwnerSpies {
  const spies = owners.map((m) => {
    const proto = m.owner.prototype as Record<string, unknown>;
    if (typeof proto[m.method] !== 'function')
      throw new Error(
        `owner spy: ${ownerMethodName(m)} is not a method (the owner changed; update the spy set)`,
      );
    return {
      name: ownerMethodName(m),
      spy: jest.spyOn(
        proto as Record<string, (...args: unknown[]) => unknown>,
        m.method,
      ),
    };
  });
  return {
    calls: () =>
      Object.fromEntries(spies.map((s) => [s.name, s.spy.mock.calls.length])),
    called: () =>
      spies.filter((s) => s.spy.mock.calls.length > 0).map((s) => s.name),
    reset: () => spies.forEach((s) => s.spy.mockClear()),
    restore: () => spies.forEach((s) => s.spy.mockRestore()),
  };
}

/**
 * For an application that constructs the owners (HTTP level): each owner resolves in the container and
 * its instance reads the method from the prototype, so the prototype spy sees its calls. Returns the
 * owners the container does NOT hold (gateway level: all of them), which a test reports as unreachable
 * by construction.
 */
export function ownersAbsentFrom(
  app: INestApplicationContext,
  owners: readonly OwnerMethod[] = CANONICAL_READ_OWNERS,
): string[] {
  const absent = new Set<string>();
  for (const m of owners) {
    let instance: unknown;
    try {
      instance = app.get(m.owner, { strict: false });
    } catch {
      absent.add(m.owner.name);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(instance, m.method))
      throw new Error(
        `owner spy: the container's ${m.owner.name} shadows ${m.method}; a prototype spy would not see its calls`,
      );
  }
  return [...absent];
}
