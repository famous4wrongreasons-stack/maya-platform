ALTER TABLE "ActionExecution" DROP CONSTRAINT "ActionExecution_source_shape_check";
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_source_shape_check" CHECK (
  "sourceType" IN ('agent_task','authenticated_request','scheduler','webhook','legacy_bridge','synthetic_shadow','public_booking')
  AND (("sourceType" = 'agent_task' AND "agentTaskId" IS NOT NULL AND "sourceRef" = "agentTaskId") OR ("sourceType" <> 'agent_task' AND "agentTaskId" IS NULL))
  AND ("sourceType" <> 'public_booking' OR ("capability" = 'crm.appointment.create.v1' AND "sourceRef" IS NOT NULL AND "actorUserId" IS NULL))
);
CREATE FUNCTION "public_booking_action_binding_v1"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceType" = 'public_booking' AND NOT EXISTS (
    SELECT 1 FROM "PublicBookingAttempt" a
    JOIN "PublicBookingSession" s ON s.id=a."sessionId" AND s."tenantId"=a."tenantId"
    JOIN "PublicBookingQuote" q ON q.id=a."quoteId" AND q."sessionId"=s.id
    WHERE a.id=NEW."sourceRef" AND a."tenantId"=NEW."tenantId"
      AND a."normalizedInputHash"=NEW."normalizedInputHash" AND a."targetRef"=NEW."targetRef"
      AND NOT a."preDispatchFailure" AND s."revokedAt" IS NULL
      AND s."expiresAt">CURRENT_TIMESTAMP AND q."expiresAt">CURRENT_TIMESTAMP
  ) THEN RAISE EXCEPTION 'bound public booking intent required'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ActionExecution_public_booking_binding" BEFORE INSERT ON "ActionExecution" FOR EACH ROW EXECUTE FUNCTION "public_booking_action_binding_v1"();
