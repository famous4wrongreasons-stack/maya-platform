/** Test-only observation of actual complete() arguments, never a semantic grade,
 * source of authority, model output substitute, or copy of private chat context. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { UserRole } from '../../../src/common/domain.enums';

export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | {
      [key: string]: AuditJson;
    };
export type CoreFullOfflineAuditScope = {
  tenantId: string;
  userId: string;
  privateValues: readonly string[];
};
export type AuditIncompleteReason =
  | 'arguments_shape'
  | 'actor_shape'
  | 'decisions_shape'
  | 'decision_shape'
  | 'semantic_plan_shape'
  | 'tool_results_shape'
  | 'tool_result_shape'
  | 'accessor_omitted'
  | 'unsupported_value'
  | 'cycle_omitted'
  | 'bounded_capture'
  | 'key_collision';
export type CoreFullOfflineAudit = {
  actor: {
    role: string | null;
    sameTenant: boolean | null;
    sameActor: boolean | null;
  };
  semanticPlans: AuditJson[];
  toolResults: Array<{ name: string; result: AuditJson }>;
  response: AuditJson;
  completeness: {
    status: 'complete' | 'incomplete';
    reasons: AuditIncompleteReason[];
    decisionsSeen: number | null;
    semanticPlansCaptured: number;
    toolResultsSeen: number | null;
    toolResultsCaptured: number;
  };
};
const OMITTED = '[private omitted]';
const UNAVAILABLE = '[audit unavailable]';
const MAX_DEPTH = 24;
const MAX_NODES = 16000;
const MAX_TEXT = 262144;
const MAX_STRING = 16384;
const MAX_ARRAY = 512;
const MAX_KEYS = 256;
// Invoke Date intrinsics with an explicit receiver, never methods, toJSON, or
// accessors on the observed Date. Strings still pass the privacy projection.
const dateGetTime = (value: Date): number => Date.prototype.getTime.call(value);
const dateToISOString = (value: Date): string =>
  Date.prototype.toISOString.call(value);
const data = (value: unknown, key: string): PropertyDescriptor | undefined =>
  value !== null && typeof value === 'object' && !types.isProxy(value)
    ? Object.getOwnPropertyDescriptor(value, key)
    : undefined;
const ownValue = (value: unknown, key: string): unknown => {
  const descriptor = data(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value')
    ? (descriptor.value as unknown)
    : undefined;
};
const plain = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !types.isProxy(value) &&
  [Object.prototype, null].includes(
    Object.getPrototypeOf(value) as object | null,
  );
const reference = (value: string | number) =>
  'sha256:' + createHash('sha256').update(String(value)).digest('hex');
const keyWords = (key: string) =>
  key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const referenceKey = (key: string) =>
  /(?:^|_)(?:ids?|refs?|references?|tokens?|handles?|signatures?|seals?|hashes?|proofs?|nonce)$/.test(
    keyWords(key),
  ) ||
  ['depends_on', 'authorization', 'cookie', 'source_revision'].includes(
    keyWords(key),
  );
const secretKey = (key: string) =>
  /(?:^|_)(?:password|secret|credentials?|api_key|private_key)(?:_|$)/.test(
    keyWords(key),
  );
const piiKey = (key: string, person: boolean) =>
  /(?:^|_)(?:email|phone|mobile|full_name|first_name|last_name|middle_name|client_name|customer_name|contact_name|address)(?:_|$)/.test(
    keyWords(key),
  ) ||
  (person && ['name', 'display_name', 'title'].includes(keyWords(key)));
const privatePersonKey = (key: string) =>
  /(?:^|[_.])(?:clients?|customers?|contacts?|recipients?|patients?)(?:[_.]|$)/.test(
    keyWords(key),
  );
const publicCatalogKey = (key: string) =>
  /^(?:staff|employees?|services?|goods|items|categories|branches|branch)$/.test(
    keyWords(key),
  );

function sanitizer(
  privateValues: readonly string[],
  reasons: Set<AuditIncompleteReason>,
  identityValues: readonly string[] = [],
) {
  if (
    !Array.isArray(privateValues) ||
    types.isProxy(privateValues) ||
    privateValues.length > 2048
  )
    throw new Error('core_full_offline_audit_scope_refused');
  const privateStrings: string[] = [];
  let privateBytes = 0;
  for (let index = 0; index < privateValues.length; index++) {
    const value = ownValue(privateValues, String(index));
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096)
      throw new Error('core_full_offline_audit_scope_refused');
    privateBytes += value.length;
    if (privateBytes > 131072)
      throw new Error('core_full_offline_audit_scope_refused');
    privateStrings.push(value);
  }
  const privateSet = new Set([...privateStrings, ...identityValues]);
  const ordered = [...privateSet].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const escaped = ordered.map((value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const privatePattern = escaped.length
    ? new RegExp(escaped.join('|'), 'g')
    : null;
  let nodes = 0,
    textBytes = 0;
  const active = new WeakSet<object>();
  const text = (value: string, key: string): string => {
    if (value.length > MAX_STRING || textBytes + value.length > MAX_TEXT) {
      reasons.add('bounded_capture');
      return UNAVAILABLE;
    }
    textBytes += value.length;
    // Explicit known private values win over structural identifier hashing.
    const redacted = privatePattern
      ? value.replace(privatePattern, OMITTED)
      : value;
    if (redacted === OMITTED) return OMITTED;
    if (redacted === value && referenceKey(key)) return reference(value);
    // One replacement pass: generated hashes are never re-hashed or mistaken for
    // phone digits. Public dates and numerical source facts remain intact.
    return redacted.replace(
      /\[(?:name|reference) removed\]@[a-f0-9]{32}_\d+|\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{12,})|\b[a-f0-9]{32,128}\b|\+?\d[\d ()-]{8,24}\d/gi,
      (candidate) => {
        if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(candidate))
          return OMITTED;
        if (/^\+?\d[\d ()-]{8,24}\d$/.test(candidate)) {
          const count = candidate.replace(/\D/g, '').length;
          return count >= 10 && count <= 15 ? OMITTED : candidate;
        }
        return reference(candidate);
      },
    );
  };
  const walk = (
    value: unknown,
    key = '',
    person = false,
    depth = 0,
  ): AuditJson => {
    nodes++;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) {
      reasons.add('bounded_capture');
      return UNAVAILABLE;
    }
    if (secretKey(key) || piiKey(key, person))
      return value === null ? null : OMITTED;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return referenceKey(key)
        ? privateSet.has(String(value))
          ? OMITTED
          : reference(value)
        : value;
    if (typeof value === 'string') return text(value, key);
    if (typeof value !== 'object' || types.isProxy(value)) {
      reasons.add('unsupported_value');
      return UNAVAILABLE;
    }
    if (types.isDate(value)) {
      const instant = dateGetTime(value);
      if (Number.isFinite(instant)) return text(dateToISOString(value), key);
      reasons.add('unsupported_value');
      return UNAVAILABLE;
    }
    if (active.has(value)) {
      reasons.add('cycle_omitted');
      return UNAVAILABLE;
    }
    const array = Array.isArray(value);
    if (!array && !plain(value)) {
      reasons.add('unsupported_value');
      return UNAVAILABLE;
    }
    active.add(value);
    try {
      const childPerson = publicCatalogKey(key)
        ? false
        : person || privatePersonKey(key);
      if (array) {
        if (value.length > MAX_ARRAY) reasons.add('bounded_capture');
        const result: AuditJson[] = [];
        for (
          let index = 0;
          index < Math.min(value.length, MAX_ARRAY);
          index++
        ) {
          const descriptor = data(value, String(index));
          if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
            reasons.add('accessor_omitted');
            result.push(UNAVAILABLE);
          } else
            result.push(
              walk(descriptor.value as unknown, key, childPerson, depth + 1),
            );
        }
        return result;
      }
      const result: { [key: string]: AuditJson } = Object.create(null) as {
        [key: string]: AuditJson;
      };
      const keys = Reflect.ownKeys(value);
      if (keys.length > MAX_KEYS) reasons.add('bounded_capture');
      for (const childKey of keys.slice(0, MAX_KEYS)) {
        if (typeof childKey !== 'string') {
          reasons.add('unsupported_value');
          continue;
        }
        const descriptor = data(value, childKey)!;
        if (!descriptor.enumerable) continue;
        const outputKey = text(childKey, '');
        if (Object.hasOwn(result, outputKey)) {
          reasons.add('key_collision');
          continue;
        }
        if (!Object.hasOwn(descriptor, 'value')) {
          reasons.add('accessor_omitted');
          result[outputKey] = UNAVAILABLE;
        } else
          result[outputKey] = walk(
            descriptor.value as unknown,
            childKey,
            childPerson,
            depth + 1,
          );
      }
      return result;
    } finally {
      active.delete(value);
    }
  };
  return walk;
}

/** Same bounded privacy projection for source facts and current HTTP selections.
 * Unsupported/truncated values remain explicit '[audit unavailable]' markers. */
export function sanitizeCoreFullOfflineAuditValue(
  value: unknown,
  privateValues: readonly string[],
): AuditJson {
  return sanitizer(privateValues, new Set())(value);
}

/** Explicitly selected public tenant-branding facts only. The caller owns the
 * source read; this helper does not infer that arbitrary contact data is public.
 * Scalar projection preserves the public business address without relaxing the
 * generic sanitizer's refusal of unknown/customer address fields. */
export function projectCoreFullOfflinePublicCompany(
  value: unknown,
  privateValues: readonly string[],
): { name: AuditJson; address: AuditJson; businessHours: AuditJson } {
  const keys = ['name', 'address', 'businessHours'];
  if (
    !plain(value) ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => {
      const descriptor = data(value, key);
      return (
        descriptor?.enumerable === true &&
        Object.hasOwn(descriptor, 'value') &&
        (descriptor.value === null || typeof descriptor.value === 'string')
      );
    })
  )
    throw new Error('core_full_offline_public_company_shape_refused');
  const walk = sanitizer(privateValues, new Set());
  return {
    name: walk(ownValue(value, 'name')),
    address: walk(ownValue(value, 'address')),
    businessHours: walk(ownValue(value, 'businessHours')),
  };
}

type PublicCompanyBinding = {
  tenantId: string;
  companyId: string;
  provider: 'yclients';
};
type ObservedPublicCompany = {
  company: {
    name: string | null;
    address: string | null;
    businessHours: string | null;
  };
  provenance: {
    qualification: 'LAST_OBSERVED_FIXTURE_PROFILE_NOT_AUTHORITY';
    source: 'external_crm';
    reader: 'CRMAdapter.getCompanyProfile';
    provider: 'yclients';
    tenantHash: string;
    companyHash: string;
    observationSequence: number;
    contentHash: string;
  };
};

/** Observes only actual fixture adapter returns, never calls CRM or supplies
 * an expected reply. A snapshot is last-observed evidence, not proof that this
 * turn read the source; the separate actual tool-evidence gate remains required. */
export function createCoreFullOfflinePublicCompanyRecorder() {
  const observations = new Map<string, ObservedPublicCompany>();
  let sequence = 0;
  const key = (binding: PublicCompanyBinding) => {
    if (
      !plain(binding) ||
      Reflect.ownKeys(binding).length !== 3 ||
      ownValue(binding, 'provider') !== 'yclients' ||
      !['tenantId', 'companyId'].every((field) => {
        const value = ownValue(binding, field);
        return (
          typeof value === 'string' &&
          value.length > 0 &&
          value.length <= 128 &&
          value.trim() === value
        );
      })
    )
      throw new Error('core_full_offline_public_company_binding_refused');
    return JSON.stringify([
      binding.tenantId,
      binding.companyId,
      binding.provider,
    ]);
  };
  return {
    record(binding: PublicCompanyBinding, returned: unknown): void {
      const identity = key(binding);
      if (!plain(returned) || ownValue(returned, 'id') !== binding.companyId)
        throw new Error('core_full_offline_public_company_source_refused');
      const fields = ['title', 'address', 'schedule'].map((field) =>
        ownValue(returned, field),
      );
      if (
        !fields.every(
          (value) =>
            value === null ||
            (typeof value === 'string' &&
              value.trim().length > 0 &&
              value.length <= 1000),
        )
      )
        throw new Error('core_full_offline_public_company_source_refused');
      if (!observations.has(identity) && observations.size >= 48)
        throw new Error('core_full_offline_public_company_bound_refused');
      const [name, address, businessHours] = fields as Array<string | null>;
      const company = { name, address, businessHours };
      observations.set(identity, {
        company,
        provenance: {
          qualification: 'LAST_OBSERVED_FIXTURE_PROFILE_NOT_AUTHORITY',
          source: 'external_crm',
          reader: 'CRMAdapter.getCompanyProfile',
          provider: binding.provider,
          tenantHash: reference(binding.tenantId),
          companyHash: reference(binding.companyId),
          observationSequence: ++sequence,
          contentHash: reference(JSON.stringify(company)),
        },
      });
    },
    snapshot(binding: PublicCompanyBinding): ObservedPublicCompany | null {
      const observed = observations.get(key(binding));
      return observed
        ? {
            company: { ...observed.company },
            provenance: { ...observed.provenance },
          }
        : null;
    },
  };
}

export function captureCoreFullOfflineAudit(
  args: readonly unknown[],
  scope: CoreFullOfflineAuditScope,
): CoreFullOfflineAudit {
  if (
    !plain(scope) ||
    typeof ownValue(scope, 'tenantId') !== 'string' ||
    !scope.tenantId ||
    typeof ownValue(scope, 'userId') !== 'string' ||
    !scope.userId ||
    scope.tenantId.length > 4096 ||
    scope.userId.length > 4096 ||
    !Array.isArray(ownValue(scope, 'privateValues'))
  )
    throw new Error('core_full_offline_audit_scope_refused');
  const reasons = new Set<AuditIncompleteReason>();
  const walk = sanitizer(scope.privateValues, reasons, [
    scope.tenantId,
    scope.userId,
  ]);
  const validArgs =
    Array.isArray(args) && !types.isProxy(args) && [7, 8].includes(args.length);
  if (!validArgs) reasons.add('arguments_shape');
  const user = validArgs ? ownValue(args, '0') : undefined;
  const role = ownValue(user, 'role');
  const tenant = ownValue(user, 'tenantId'),
    actor = ownValue(user, 'userId');
  const actorShape =
    plain(user) &&
    typeof role === 'string' &&
    (Object.values(UserRole) as string[]).includes(role) &&
    (typeof tenant === 'string' || tenant === null) &&
    typeof actor === 'string';
  if (!actorShape) reasons.add('actor_shape');
  const semanticPlans: AuditJson[] = [];
  const toolResults: Array<{ name: string; result: AuditJson }> = [];
  const decisions = validArgs ? ownValue(args, '5') : undefined;
  const results =
    validArgs && args.length === 7
      ? []
      : validArgs
        ? ownValue(args, '7')
        : undefined;
  const decisionsArray = Array.isArray(decisions) && !types.isProxy(decisions);
  const resultsArray = Array.isArray(results) && !types.isProxy(results);
  if (!decisionsArray) reasons.add('decisions_shape');
  else {
    if (decisions.length > 32) reasons.add('bounded_capture');
    for (let index = 0; index < Math.min(decisions.length, 32); index++) {
      const decision = ownValue(decisions, String(index));
      if (!plain(decision)) {
        reasons.add('decision_shape');
        continue;
      }
      const plan = data(decision, 'semanticPlan');
      if (!plan) continue;
      if (!Object.hasOwn(plan, 'value')) {
        reasons.add('accessor_omitted');
        continue;
      }
      if (plan.value === null || plan.value === undefined) continue;
      if (!plain(plan.value)) {
        reasons.add('semantic_plan_shape');
        continue;
      }
      semanticPlans.push(walk(plan.value));
    }
  }
  if (!resultsArray) reasons.add('tool_results_shape');
  else {
    if (results.length > 128) reasons.add('bounded_capture');
    for (let index = 0; index < Math.min(results.length, 128); index++) {
      const entry = ownValue(results, String(index));
      const name = ownValue(entry, 'name'),
        result = data(entry, 'result');
      if (
        !plain(entry) ||
        typeof name !== 'string' ||
        !/^[a-z][a-z0-9_.-]{0,127}$/.test(name) ||
        !result ||
        !Object.hasOwn(result, 'value')
      ) {
        reasons.add('tool_result_shape');
        continue;
      }
      const safeName = walk(name);
      toolResults.push({
        name: typeof safeName === 'string' ? safeName : UNAVAILABLE,
        result: walk(result.value as unknown, '', privatePersonKey(name)),
      });
    }
  }
  const response = walk(validArgs ? ownValue(args, '6') : undefined);
  return {
    actor: {
      role: actorShape ? role : null,
      sameTenant: actorShape ? tenant === scope.tenantId : null,
      sameActor: actorShape ? actor === scope.userId : null,
    },
    semanticPlans,
    toolResults,
    response,
    completeness: {
      status: reasons.size ? 'incomplete' : 'complete',
      reasons: [...reasons].sort(),
      decisionsSeen: decisionsArray ? decisions.length : null,
      semanticPlansCaptured: semanticPlans.length,
      toolResultsSeen: resultsArray ? results.length : null,
      toolResultsCaptured: toolResults.length,
    },
  };
}
