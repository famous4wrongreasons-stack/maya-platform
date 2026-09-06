-- Approved B33 Option A: exactly eight persisted fields, no historical backfill.
CREATE TABLE "ClientBookingConfirmation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "clientChannelLinkId" TEXT NOT NULL,
  "actionNamespace" TEXT NOT NULL,
  "confirmationEvidenceJson" JSONB NOT NULL,
  "confirmationEvidenceHash" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  CONSTRAINT "ClientBookingConfirmation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientBookingConfirmation_v1_check" CHECK (
    "id" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    AND "actionNamespace" = 'maya.chat-confirmation/1:crm.appointment.create.v1'
    AND "confirmationEvidenceHash" ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof("confirmationEvidenceJson") = 'object'
    AND octet_length("confirmationEvidenceJson"::text) <= 4096
  ),
  CONSTRAINT "ClientBookingConfirmation_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClientBookingConfirmation_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId")
    REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "ClientBookingConfirmation_link_fkey" FOREIGN KEY ("clientChannelLinkId", "tenantId", "clientId")
    REFERENCES "ClientChannelLink"("id", "tenantId", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "ClientBookingConfirmation_tenantId_clientId_idx" ON "ClientBookingConfirmation"("tenantId", "clientId");
CREATE FUNCTION "guard_b33_confirmation"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'B33 confirmation is immutable and cannot be deleted or rebound' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "ClientChannelLink" l JOIN "Client" c ON c.id = l."clientId" AND c."tenantId" = l."tenantId"
    WHERE l.id = NEW."clientChannelLinkId" AND l."tenantId" = NEW."tenantId" AND l."clientId" = NEW."clientId"
      AND l."revokedAt" IS NULL AND l."verificationVersion" = 1 AND l."subjectHashVersion" = 1
      AND c."mergedIntoClientId" IS NULL FOR SHARE OF l, c;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B33 requires an active verified canonical Client binding' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ClientBookingConfirmation_immutable_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClientBookingConfirmation"
  FOR EACH ROW EXECUTE FUNCTION "guard_b33_confirmation"();
