-- Approved B5/B6 V1: additive slots only. No historical choices are inferred.
ALTER TABLE "CustomerProfile"
  ADD COLUMN "defaultVisitMood" TEXT,
  ADD COLUMN "notificationPreferencesJson" JSONB;
ALTER TABLE "Appointment" ADD COLUMN "clientVisitMood" TEXT;

CREATE FUNCTION "valid_client_notification_preferences_v1"(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  overrides JSONB;
  item RECORD;
BEGIN
  IF value IS NULL THEN RETURN TRUE; END IF;
  IF jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR value->'version' IS DISTINCT FROM '1'::jsonb
    OR NOT (value ?& ARRAY['version', 'overrides'])
    OR value - ARRAY['version', 'overrides'] <> '{}'::jsonb
    OR jsonb_typeof(value->'overrides') IS DISTINCT FROM 'object'
  THEN RETURN FALSE; END IF;
  overrides := value->'overrides';
  IF overrides = '{}'::jsonb THEN RETURN FALSE; END IF;
  FOR item IN SELECT entry.key, entry.value FROM jsonb_each(overrides) AS entry LOOP
    IF item.key IN ('record_changes', 'reminder', 'marketing', 'cycle', 'birthday', 'freed_slot') THEN
      IF jsonb_typeof(item.value) <> 'boolean' THEN RETURN FALSE; END IF;
    ELSIF item.key = 'reminder_hours' THEN
      IF jsonb_typeof(item.value) <> 'number' THEN RETURN FALSE; END IF;
      IF (item.value::text)::numeric NOT BETWEEN 1 AND 48
        OR trunc((item.value::text)::numeric) <> (item.value::text)::numeric
      THEN RETURN FALSE; END IF;
    ELSIF item.key = 'marketing_freq' THEN
      IF item.value NOT IN ('"week"'::jsonb, '"2weeks"'::jsonb, '"month"'::jsonb)
      THEN RETURN FALSE; END IF;
    ELSIF item.key IN ('quiet_from', 'quiet_to') THEN
      IF item.value <> 'null'::jsonb THEN
        IF jsonb_typeof(item.value) <> 'number' THEN RETURN FALSE; END IF;
        IF (item.value::text)::numeric NOT BETWEEN 0 AND 23
          OR trunc((item.value::text)::numeric) <> (item.value::text)::numeric
        THEN RETURN FALSE; END IF;
      END IF;
    ELSE RETURN FALSE;
    END IF;
  END LOOP;
  IF (overrides ? 'quiet_from') <> (overrides ? 'quiet_to')
    OR ((overrides->'quiet_from' = 'null'::jsonb) IS DISTINCT FROM (overrides->'quiet_to' = 'null'::jsonb))
  THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;

ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_default_visit_mood_check"
    CHECK ("defaultVisitMood" IS NULL OR "defaultVisitMood" IN ('red', 'blue')),
  ADD CONSTRAINT "CustomerProfile_client_preference_owner_check"
    CHECK (("defaultVisitMood" IS NULL AND "notificationPreferencesJson" IS NULL) OR "clientId" IS NOT NULL),
  ADD CONSTRAINT "CustomerProfile_notification_preferences_v1_check"
    CHECK ("valid_client_notification_preferences_v1"("notificationPreferencesJson") IS TRUE);

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_client_visit_mood_check"
    CHECK ("clientVisitMood" IS NULL OR ("clientVisitMood" IN ('red', 'blue') AND "mayaClientId" IS NOT NULL));

CREATE FUNCTION "guard_appointment_client_preference_owner"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."clientVisitMood" IS NOT NULL AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."mayaClientId" IS DISTINCT FROM OLD."mayaClientId"
    OR NEW."crmProvider" IS DISTINCT FROM OLD."crmProvider"
    OR NEW."crmExternalId" IS DISTINCT FROM OLD."crmExternalId"
  ) THEN
    RAISE EXCEPTION 'Established Client visit preference identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Appointment_client_preference_owner_guard"
BEFORE UPDATE ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION "guard_appointment_client_preference_owner"();
