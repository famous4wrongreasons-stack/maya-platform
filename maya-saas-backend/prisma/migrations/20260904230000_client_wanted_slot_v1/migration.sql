-- Owner-approved B9 V1. One exact Client-owned waitlist request; no backfill.
CREATE TABLE "ClientWantedSlotInterest" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "desiredStartAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  "matchToleranceMinutes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByActionExecutionId" TEXT NOT NULL,
  "lastMutationActionExecutionId" TEXT,
  "sourceChannelLinkId" TEXT NOT NULL,
  "matchedSourceEventId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "notifiedAt" TIMESTAMP(3),
  "terminalAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientWantedSlotInterest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientWantedSlotInterest_exact_time_check" CHECK (
    "matchToleranceMinutes" = 0 AND "expiresAt" = "desiredStartAt"
  ),
  CONSTRAINT "ClientWantedSlotInterest_status_check" CHECK (
    "status" IN ('ACTIVE', 'MATCHED', 'NOTIFIED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT "ClientWantedSlotInterest_state_evidence_check" CHECK (
    ("status" = 'ACTIVE' AND "matchedSourceEventId" IS NULL AND "matchedAt" IS NULL AND "notifiedAt" IS NULL AND "terminalAt" IS NULL)
    OR ("status" = 'MATCHED' AND "matchedSourceEventId" IS NOT NULL AND "matchedAt" IS NOT NULL AND "notifiedAt" IS NULL AND "terminalAt" IS NULL)
    OR ("status" = 'NOTIFIED' AND "matchedSourceEventId" IS NOT NULL AND "matchedAt" IS NOT NULL AND "notifiedAt" IS NOT NULL AND "terminalAt" IS NOT NULL)
    OR ("status" = 'CANCELLED' AND "terminalAt" IS NOT NULL AND "lastMutationActionExecutionId" IS NOT NULL)
    OR ("status" = 'EXPIRED' AND "terminalAt" IS NOT NULL AND "lastMutationActionExecutionId" IS NULL)
  )
);

CREATE UNIQUE INDEX "ClientWantedSlotInterest_id_tenantId_key"
  ON "ClientWantedSlotInterest"("id", "tenantId");
CREATE UNIQUE INDEX "ClientWantedSlotInterest_tenant_createExecution_key"
  ON "ClientWantedSlotInterest"("tenantId", "createdByActionExecutionId");
CREATE UNIQUE INDEX "ClientWantedSlotInterest_tenant_mutationExecution_key"
  ON "ClientWantedSlotInterest"("tenantId", "lastMutationActionExecutionId");
CREATE UNIQUE INDEX "ClientChannelLink_client_reference_key"
  ON "ClientChannelLink"("id", "tenantId", "clientId");
CREATE UNIQUE INDEX "ClientWantedSlotInterest_active_identity_key"
  ON "ClientWantedSlotInterest"("tenantId", "clientId", "branchId", "staffId", "desiredStartAt")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "ClientWantedSlotInterest_client_active_idx"
  ON "ClientWantedSlotInterest"("tenantId", "clientId", "status", "expiresAt");
CREATE INDEX "ClientWantedSlotInterest_match_idx"
  ON "ClientWantedSlotInterest"("tenantId", "branchId", "staffId", "desiredStartAt", "status");
CREATE INDEX "ClientWantedSlotInterest_order_idx"
  ON "ClientWantedSlotInterest"("tenantId", "status", "createdAt", "id");

ALTER TABLE "ClientWantedSlotInterest"
  ADD CONSTRAINT "ClientWantedSlotInterest_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ClientWantedSlotInterest_client_fkey"
    FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ClientWantedSlotInterest_branch_fkey"
    FOREIGN KEY ("branchId", "tenantId") REFERENCES "Branch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ClientWantedSlotInterest_staff_fkey"
    FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ClientWantedSlotInterest_channel_fkey"
    FOREIGN KEY ("sourceChannelLinkId", "tenantId", "clientId") REFERENCES "ClientChannelLink"("id", "tenantId", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ClientWantedSlotInterest_create_execution_fkey"
    FOREIGN KEY ("createdByActionExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ClientWantedSlotInterest_mutation_execution_fkey"
    FOREIGN KEY ("lastMutationActionExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_client_wanted_slot_insert"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE active_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId" || ':wanted-slot:' || NEW."clientId", 0));
  NEW."expiresAt" := NEW."desiredStartAt";
  NEW."matchToleranceMinutes" := 0;
  NEW."status" := 'ACTIVE';
  NEW."createdAt" := timezone('UTC'::text, CURRENT_TIMESTAMP);
  NEW."updatedAt" := NEW."createdAt";
  NEW."matchedSourceEventId" := NULL;
  NEW."matchedAt" := NULL;
  NEW."notifiedAt" := NULL;
  NEW."terminalAt" := NULL;
  NEW."lastMutationActionExecutionId" := NULL;
  IF NEW."desiredStartAt" <= timezone('UTC'::text, CURRENT_TIMESTAMP) THEN
    RAISE EXCEPTION 'Wanted slot must be in the future';
  END IF;
  SELECT count(*) INTO active_count FROM "ClientWantedSlotInterest"
    WHERE "tenantId" = NEW."tenantId" AND "clientId" = NEW."clientId" AND "status" = 'ACTIVE';
  IF active_count >= 10 THEN
    RAISE EXCEPTION 'CLIENT_WANTED_SLOT_LIMIT_EXCEEDED';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ClientWantedSlotInterest_insert_guard"
BEFORE INSERT ON "ClientWantedSlotInterest"
FOR EACH ROW EXECUTE FUNCTION "guard_client_wanted_slot_insert"();

CREATE FUNCTION "guard_client_wanted_slot_update"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."staffId" IS DISTINCT FROM OLD."staffId"
    OR NEW."desiredStartAt" IS DISTINCT FROM OLD."desiredStartAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."matchToleranceMinutes" IS DISTINCT FROM OLD."matchToleranceMinutes"
    OR NEW."createdByActionExecutionId" IS DISTINCT FROM OLD."createdByActionExecutionId"
    OR NEW."sourceChannelLinkId" IS DISTINCT FROM OLD."sourceChannelLinkId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Wanted slot historical request facts are immutable';
  END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status" = 'ACTIVE' AND NEW."status" IN ('MATCHED', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'MATCHED' AND NEW."status" IN ('NOTIFIED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Invalid wanted slot lifecycle transition';
  END IF;
  IF OLD."matchedSourceEventId" IS NOT NULL AND NEW."matchedSourceEventId" IS DISTINCT FROM OLD."matchedSourceEventId" THEN
    RAISE EXCEPTION 'Wanted slot match source is immutable';
  END IF;
  IF OLD."matchedAt" IS NOT NULL AND NEW."matchedAt" IS DISTINCT FROM OLD."matchedAt" THEN
    RAISE EXCEPTION 'Wanted slot match time is immutable';
  END IF;
  IF OLD."notifiedAt" IS NOT NULL AND NEW."notifiedAt" IS DISTINCT FROM OLD."notifiedAt" THEN
    RAISE EXCEPTION 'Wanted slot notification time is immutable';
  END IF;
  IF OLD."terminalAt" IS NOT NULL AND NEW."terminalAt" IS DISTINCT FROM OLD."terminalAt" THEN
    RAISE EXCEPTION 'Wanted slot terminal time is immutable';
  END IF;
  IF NEW."status" = 'EXPIRED' AND timezone('UTC'::text, CURRENT_TIMESTAMP) < NEW."expiresAt" THEN
    RAISE EXCEPTION 'Wanted slot cannot expire before requested start';
  END IF;
  IF NEW."status" = 'MATCHED' AND OLD."status" = 'ACTIVE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId" || ':wanted-slot-event:' || NEW."matchedSourceEventId", 0));
    IF EXISTS (
      SELECT 1 FROM "ClientWantedSlotInterest" earlier
      WHERE earlier."tenantId" = NEW."tenantId"
        AND earlier."branchId" = NEW."branchId"
        AND earlier."staffId" = NEW."staffId"
        AND earlier."desiredStartAt" = NEW."desiredStartAt"
        AND earlier."status" = 'ACTIVE'
        AND (earlier."createdAt", earlier."id") < (NEW."createdAt", NEW."id")
    ) THEN RAISE EXCEPTION 'Wanted slot matching must use earliest eligible ordering'; END IF;
    IF (SELECT count(*) FROM "ClientWantedSlotInterest" matched
        WHERE matched."tenantId" = NEW."tenantId"
          AND matched."matchedSourceEventId" = NEW."matchedSourceEventId") >= 3 THEN
      RAISE EXCEPTION 'WANTED_SLOT_MATCH_FAN_OUT_EXCEEDED';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ClientWantedSlotInterest_update_guard"
BEFORE UPDATE ON "ClientWantedSlotInterest"
FOR EACH ROW EXECUTE FUNCTION "guard_client_wanted_slot_update"();

CREATE FUNCTION "reject_client_wanted_slot_delete"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ClientWantedSlotInterest cannot be physically deleted'; END $$;

CREATE TRIGGER "ClientWantedSlotInterest_delete_guard"
BEFORE DELETE ON "ClientWantedSlotInterest"
FOR EACH ROW EXECUTE FUNCTION "reject_client_wanted_slot_delete"();
