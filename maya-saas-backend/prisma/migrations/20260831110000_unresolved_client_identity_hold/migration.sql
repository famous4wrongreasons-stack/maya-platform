-- Cycle 06 Blocking Package 4 P4-03 unresolved-identity hold foundation.
-- One row records one known tenant/provider/external-id collision. It does not
-- create canonical identities, carry loyalty value, or persist raw PII.

CREATE TABLE "UnresolvedClientIdentityHold" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  "sourceEvidenceHash" TEXT NOT NULL,
  "unresolvedPrincipalCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolutionActionExecutionId" TEXT,

  CONSTRAINT "UnresolvedClientIdentityHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UnresolvedClientIdentityHold_reason_check" CHECK (
    "reasonCode" = 'loyalty_identity_unresolved'
  ),
  CONSTRAINT "UnresolvedClientIdentityHold_provider_check" CHECK (
    length(btrim("provider")) > 0
  ),
  CONSTRAINT "UnresolvedClientIdentityHold_external_id_check" CHECK (
    length(btrim("externalId")) > 0
  ),
  CONSTRAINT "UnresolvedClientIdentityHold_source_namespace_check" CHECK (
    length(btrim("sourceNamespace")) > 0
  ),
  CONSTRAINT "UnresolvedClientIdentityHold_evidence_hash_check" CHECK (
    "sourceEvidenceHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "UnresolvedClientIdentityHold_principal_count_check" CHECK (
    "unresolvedPrincipalCount" >= 2
  ),
  CONSTRAINT "UnresolvedClientIdentityHold_resolution_pair_check" CHECK (
    ("resolvedAt" IS NULL) = ("resolutionActionExecutionId" IS NULL)
  )
);

CREATE UNIQUE INDEX "UnresolvedClientIdentityHold_tenant_provider_external_key"
  ON "UnresolvedClientIdentityHold"("tenantId", "provider", "externalId");

CREATE INDEX "UnresolvedClientIdentityHold_tenant_reason_resolved_idx"
  ON "UnresolvedClientIdentityHold"("tenantId", "reasonCode", "resolvedAt");

ALTER TABLE "UnresolvedClientIdentityHold"
  ADD CONSTRAINT "UnresolvedClientIdentityHold_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UnresolvedIdentityHold_resolution_execution_tenant_fkey"
  FOREIGN KEY ("resolutionActionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_unresolved_client_identity_hold_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."resolvedAt" IS NOT NULL
    OR NEW."resolutionActionExecutionId" IS NOT NULL
  THEN
    RAISE EXCEPTION 'UnresolvedClientIdentityHold must be created active'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "UnresolvedClientIdentityHold_active_insert_guard"
BEFORE INSERT ON "UnresolvedClientIdentityHold"
FOR EACH ROW EXECUTE FUNCTION "guard_unresolved_client_identity_hold_insert"();

CREATE FUNCTION "guard_unresolved_client_identity_hold_lifecycle"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."resolvedAt" IS NULL THEN
      RAISE EXCEPTION 'Active UnresolvedClientIdentityHold cannot be deleted'
        USING ERRCODE = '23514';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."externalId" IS DISTINCT FROM OLD."externalId"
    OR NEW."reasonCode" IS DISTINCT FROM OLD."reasonCode"
    OR NEW."sourceNamespace" IS DISTINCT FROM OLD."sourceNamespace"
    OR NEW."sourceEvidenceHash" IS DISTINCT FROM OLD."sourceEvidenceHash"
    OR NEW."unresolvedPrincipalCount" IS DISTINCT FROM OLD."unresolvedPrincipalCount"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'UnresolvedClientIdentityHold evidence is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."resolvedAt" IS NULL THEN
    IF NEW."resolvedAt" IS NULL
      AND NEW."resolutionActionExecutionId" IS NULL
    THEN
      RETURN NEW;
    END IF;

    IF NEW."resolvedAt" IS NOT NULL
      AND NEW."resolutionActionExecutionId" IS NOT NULL
    THEN
      RETURN NEW;
    END IF;
  ELSIF NEW."resolvedAt" IS NOT DISTINCT FROM OLD."resolvedAt"
    AND NEW."resolutionActionExecutionId" IS NOT DISTINCT FROM OLD."resolutionActionExecutionId"
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'UnresolvedClientIdentityHold resolution is one-way'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "UnresolvedClientIdentityHold_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "UnresolvedClientIdentityHold"
FOR EACH ROW EXECUTE FUNCTION "guard_unresolved_client_identity_hold_lifecycle"();
