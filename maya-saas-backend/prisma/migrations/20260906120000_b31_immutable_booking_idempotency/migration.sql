-- Approved B31 Option A: one model, nine scalar columns, no historical backfill.
ALTER TABLE "ActionExecution"
  ADD COLUMN "bookingIntentContract" TEXT,
  ADD COLUMN "bookingIntentHash" TEXT,
  ADD COLUMN "bookingIntentEncrypted" TEXT;

ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_booking_intent_check" CHECK (
  ("bookingIntentContract" IS NULL AND "bookingIntentHash" IS NULL AND "bookingIntentEncrypted" IS NULL)
  OR ("bookingIntentContract" IS NOT NULL AND "bookingIntentContract" = 'maya.client-appointment-create-intent/1'
      AND "bookingIntentHash" IS NOT NULL AND "bookingIntentHash" ~ '^[a-f0-9]{64}$'
      AND "capability" = 'crm.appointment.create.v1' AND "actionClass" = 'create_appointment')
);

CREATE TABLE "ActionExecutionIdempotencyBinding" (
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "idempotencyScope" TEXT NOT NULL,
  "requestIdempotencyKeyHash" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionExecutionIdempotencyBinding_pkey" PRIMARY KEY
    ("tenantId", "idempotencyScope", "requestIdempotencyKeyHash"),
  CONSTRAINT "ActionExecutionIdempotencyBinding_key_check" CHECK (
    "idempotencyScope" = 'appointments.client.create.v1'
    AND "requestIdempotencyKeyHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "ActionExecutionIdempotencyBinding_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionExecutionIdempotencyBinding_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId")
    REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionExecutionIdempotencyBinding_actionExecutionId_tenant_fkey" FOREIGN KEY ("actionExecutionId", "tenantId")
    REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ActionExecutionIdempotencyBinding_actionExecutionId_tenantI_idx"
  ON "ActionExecutionIdempotencyBinding"("actionExecutionId", "tenantId");
CREATE INDEX "ActionExecutionIdempotencyBinding_clientId_tenantId_idx"
  ON "ActionExecutionIdempotencyBinding"("clientId", "tenantId");

CREATE FUNCTION "guard_b31_booking_intent"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."bookingIntentContract" IS NOT NULL AND EXISTS (SELECT 1 FROM "Tenant" WHERE id = OLD."tenantId") THEN
      RAISE EXCEPTION 'B31 booking identity cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."bookingIntentContract" IS NOT NULL AND NEW."bookingIntentEncrypted" IS NULL THEN
      RAISE EXCEPTION 'B31 accepted intent requires encrypted snapshot' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- This also prevents installing an invented fingerprint on a legacy row.
  IF NEW."bookingIntentContract" IS DISTINCT FROM OLD."bookingIntentContract"
     OR NEW."bookingIntentHash" IS DISTINCT FROM OLD."bookingIntentHash"
     OR (OLD."bookingIntentContract" IS NOT NULL AND
       (NEW."tenantId", NEW.id, NEW."normalizedInputContract", NEW."normalizedInputHash", NEW."identityFingerprint",
        NEW."capability", NEW."actionClass", NEW."targetRef", NEW."transportIdempotencyKey") IS DISTINCT FROM
       (OLD."tenantId", OLD.id, OLD."normalizedInputContract", OLD."normalizedInputHash", OLD."identityFingerprint",
        OLD."capability", OLD."actionClass", OLD."targetRef", OLD."transportIdempotencyKey")) THEN
    RAISE EXCEPTION 'B31 accepted booking intent is immutable; no historical backfill' USING ERRCODE = '23514';
  END IF;
  IF NEW."bookingIntentEncrypted" IS DISTINCT FROM OLD."bookingIntentEncrypted"
     OR (OLD."bookingIntentContract" IS NOT NULL AND NEW."normalizedInputEncrypted" IS DISTINCT FROM OLD."normalizedInputEncrypted") THEN
    IF (NEW."bookingIntentEncrypted" IS DISTINCT FROM OLD."bookingIntentEncrypted" AND NEW."bookingIntentEncrypted" IS NOT NULL)
       OR (NEW."normalizedInputEncrypted" IS DISTINCT FROM OLD."normalizedInputEncrypted" AND NEW."normalizedInputEncrypted" IS NOT NULL)
       OR OLD."bookingIntentContract" IS NULL
       OR NEW.state::TEXT NOT IN ('SUCCEEDED', 'FAILED', 'NOT_EXECUTED')
       OR NEW."payloadRetentionUntil" IS NULL OR NEW."payloadRetentionUntil" > CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'B31 snapshot permits only terminal retention cleanup' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ActionExecution_b31_intent_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecution"
  FOR EACH ROW EXECUTE FUNCTION "guard_b31_booking_intent"();

CREATE FUNCTION "guard_b31_idempotency_binding"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE e "ActionExecution"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "Tenant" WHERE id = OLD."tenantId") THEN
      RAISE EXCEPTION 'B31 accepted binding cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'B31 accepted binding cannot be rebound' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  -- Serialize aliases on their durable owner as well as the unique caller key.
  SELECT * INTO e FROM "ActionExecution"
    WHERE id = NEW."actionExecutionId" AND "tenantId" = NEW."tenantId" FOR UPDATE;
  IF NOT FOUND OR e."bookingIntentContract" IS DISTINCT FROM 'maya.client-appointment-create-intent/1' THEN
    RAISE EXCEPTION 'B31 binding requires an existing canonical booking intent' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "ActionExecutionIdempotencyBinding"
    WHERE "actionExecutionId" = e.id AND "tenantId" = e."tenantId" AND "clientId" <> NEW."clientId") THEN
    RAISE EXCEPTION 'B31 execution cannot bind a different Client' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ActionExecutionIdempotencyBinding_immutable_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecutionIdempotencyBinding"
  FOR EACH ROW EXECUTE FUNCTION "guard_b31_idempotency_binding"();

CREATE FUNCTION "require_b31_execution_binding"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."bookingIntentContract" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ActionExecutionIdempotencyBinding" WHERE "actionExecutionId" = NEW.id AND "tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'B31 execution and first binding must commit atomically' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "ActionExecution_b31_binding_required"
  AFTER INSERT ON "ActionExecution" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "require_b31_execution_binding"();
