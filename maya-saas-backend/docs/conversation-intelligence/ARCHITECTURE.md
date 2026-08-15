# Architecture

## Request Lifecycle

1. AI Core authenticates the tenant, user, role and surface.
2. Input is bounded and redacted before it reaches an external model.
3. The planner receives one versioned contract containing taxonomy, language
   normalization, policy and only the tools available to that principal.
   This is a compact execution view: the complete taxonomy remains in the
   server and generated datasets, while server-owned risk, permission,
   clarification and response rules are deliberately not delegated to the
   model.
4. The model returns a structured semantic plan with one to five canonical
   tasks. A compound request keeps dependencies between tasks.
5. The server validates every intent, entity, dependency, permission,
   capability boundary and tool candidate. Model-provided permissions are never
   trusted.
6. The runtime executes at most one next tool, tenant-scoped and role-scoped.
   Mutations require the tool catalog approval policy and idempotency.
7. Verified, sanitized tool results return to the reasoning pass.
8. The final model answers each task in order. Its response rule and capability
   boundary come from the server-owned taxonomy.
9. Numeric grounding and audit metadata are checked before the response is
   returned.

## Data Classes

| Class | Meaning                | Required behavior                                           |
| ----- | ---------------------- | ----------------------------------------------------------- |
| A     | General knowledge      | Free-form model reasoning; no tenant facts may be invented. |
| B     | Tenant context         | Use only sanitized context supplied by the runtime.         |
| C     | Verified business data | Require a tenant-scoped tool result.                        |
| D     | Verified calculation   | Calculate only from verified inputs.                        |
| E     | External action        | Preview and obtain runtime approval before side effects.    |
| F     | Forbidden              | Refuse; never reroute to a nearby intent or tool.           |

## Capability Readiness

- `ready`: the canonical behavior has a general-LLM or registered production
  tool path.
- `partial`: a tool exists, but its exact limitation is included in
  `readinessNote` and must be repeated faithfully when relevant.
- `planned`: MAYA understands the request but must return no tool call and must
  not substitute a nearby metric.

Runtime availability remains narrower than taxonomy readiness when a tenant is
missing the required feature, CRM integration, role or permission.

## Context Rules

- Carry only confirmed slots that remain relevant.
- Explicit correction replaces the previous value.
- Topic switches suspend pending action state.
- Resolve pronouns against the nearest compatible entity.
- Ask one material clarification instead of a questionnaire.
- Never clarify an action that is forbidden or not implemented.

## Security Boundaries

- Tenant and role are supplied by authenticated server context.
- Tool calls must belong to an allowed task in the validated plan.
- Raw phone numbers, emails, credentials and direct client identifiers are not
  sent to the model.
- Read/analyze requests do not imply permission to write or execute.
- Every implemented write/execute tool requires actor or owner approval and an
  idempotency key.
