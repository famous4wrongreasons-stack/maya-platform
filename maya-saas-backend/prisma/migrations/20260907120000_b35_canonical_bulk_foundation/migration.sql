BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- B35 approved exact mapping V1. Prospective only; no historical UPDATE/backfill.
-- Dropping NOT NULL is metadata-only. Role CHECKs preserve all legacy requirements.
ALTER TABLE "MarketingCampaign"
 ADD COLUMN "bulkIntentContract" TEXT,
 ADD COLUMN "bulkIntentHash" TEXT,
 ADD COLUMN "parentRecipientId" TEXT,
 ADD COLUMN "bulkSlotKey" TEXT,
 ALTER COLUMN "channel" DROP NOT NULL,
 ALTER COLUMN "provider" DROP NOT NULL;
ALTER TABLE "MarketingAudience" ADD COLUMN "snapshotContract" TEXT;
ALTER TABLE "MarketingAudienceRecipient" ADD COLUMN "clientId" TEXT;
ALTER TABLE "MarketingCampaignRecipient"
 ADD COLUMN "clientId" TEXT,
 ADD COLUMN "routePlanJson" JSONB,
 ADD COLUMN "contentEncrypted" TEXT,
 ADD COLUMN "aggregateState" "CommunicationCampaignState";
ALTER TABLE "MarketingDeliveryAttempt" ADD COLUMN "dispatchEligibilityJson" JSONB;
ALTER TABLE "MarketingPolicy" ADD COLUMN "canonicalHistoryStartedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "B35_audience_client_key" ON "MarketingAudienceRecipient"("tenantId","audienceId","clientId");
CREATE UNIQUE INDEX "B35_bulk_client_key" ON "MarketingCampaignRecipient"("tenantId","campaignId","clientId");
CREATE UNIQUE INDEX "B35_recipient_slot_key" ON "MarketingCampaign"("tenantId","parentRecipientId","bulkSlotKey");
CREATE INDEX "B35_audience_client_idx" ON "MarketingAudienceRecipient"("tenantId","clientId");
CREATE INDEX "B35_recipient_client_history_idx" ON "MarketingCampaignRecipient"("tenantId","clientId","createdAt","id");
ALTER TABLE "MarketingAudienceRecipient" ADD CONSTRAINT "B35_audience_client_fkey"
 FOREIGN KEY ("clientId","tenantId") REFERENCES "Client"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "B35_recipient_client_fkey"
 FOREIGN KEY ("clientId","tenantId") REFERENCES "Client"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "B35_transport_parent_fkey"
 FOREIGN KEY ("parentRecipientId","tenantId") REFERENCES "MarketingCampaignRecipient"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "MarketingCampaign" DROP CONSTRAINT "MarketingCampaign_lifecycle_v1_complete_check";
ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_lifecycle_v1_complete_check" CHECK (
    "lifecycleVersion" IN (0, 2) OR (
      "lifecycleVersion" = 1
      AND "scope" IS NOT NULL
      AND "actionExecutionId" IS NOT NULL
      AND "aggregateState" IS NOT NULL
      AND "contentRef" IS NOT NULL AND length(btrim("contentRef")) > 0
      AND "messageSnapshotHash" <> ''
      AND "idempotencyKey" IS NOT NULL AND length(btrim("idempotencyKey")) > 0
      AND "deliveryCapabilityKey" IS NOT NULL AND length(btrim("deliveryCapabilityKey")) > 0
      AND "deliveryCapabilityVersion" IS NOT NULL AND "deliveryCapabilityVersion" > 0
      AND "retryPolicyKey" IS NOT NULL AND length(btrim("retryPolicyKey")) > 0
      AND "retryPolicyVersion" IS NOT NULL AND "retryPolicyVersion" > 0
      AND "reconciliationPolicyKey" IS NOT NULL AND length(btrim("reconciliationPolicyKey")) > 0
      AND "reconciliationPolicyVersion" IS NOT NULL AND "reconciliationPolicyVersion" > 0
    )
  );

ALTER TABLE "MarketingCampaignRecipient" DROP CONSTRAINT "MarketingCampaignRecipient_lifecycle_v1_complete_check";
ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_lifecycle_v1_complete_check" CHECK (
    "lifecycleVersion" IN (0, 2) OR (
      "lifecycleVersion" = 1
      AND "identityVersion" IS NOT NULL AND "identityVersion" > 0
      AND "recipientKind" IS NOT NULL AND length(btrim("recipientKind")) > 0
      AND "recipientRefHash" IS NOT NULL AND length(btrim("recipientRefHash")) > 0
      AND "contentIdentityHash" IS NOT NULL AND length(btrim("contentIdentityHash")) > 0
      AND "deliveryState" IS NOT NULL
      AND "externalDispatchState" IS NOT NULL
      AND "reconciliationState" IS NOT NULL
      AND "eligibilityBasis" IS NOT NULL AND length(btrim("eligibilityBasis")) > 0
      AND "eligibilityDecision" IN ('ALLOW', 'SKIP', 'DENY')
      AND "eligibilityPolicyVersion" IS NOT NULL AND "eligibilityPolicyVersion" > 0
      AND "eligibilityEvidenceRef" IS NOT NULL AND length(btrim("eligibilityEvidenceRef")) > 0
      AND "eligibilityEvidenceHash" IS NOT NULL AND length(btrim("eligibilityEvidenceHash")) > 0
      AND "eligibilityCheckedAt" IS NOT NULL
    )
  );

ALTER TABLE "MarketingCampaignRecipient" DROP CONSTRAINT "MarketingCampaignRecipient_unknown_check";
ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_unknown_check" CHECK (
    "lifecycleVersion" IN (0, 2) OR "deliveryState" <> 'UNKNOWN' OR (
      "externalDispatchState" = 'MAY_HAVE_CROSSED'
      AND "reconciliationState" <> 'NOT_REQUIRED'
      AND "nextAttemptAt" IS NULL
      AND "unknownAt" IS NOT NULL
      AND "terminalAt" IS NULL
    )
  );

ALTER TABLE "MarketingCampaignRecipient" DROP CONSTRAINT "MarketingCampaignRecipient_terminal_check";
ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_terminal_check" CHECK (
    "lifecycleVersion" IN (0, 2) OR (
      ("terminalAt" IS NULL OR (
        "deliveryState" IN ('ACCEPTED', 'DELIVERED', 'FAILED', 'SKIPPED')
        AND "leaseOwner" IS NULL AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL
      ))
      AND ("deliveryState" NOT IN ('DELIVERED', 'FAILED', 'SKIPPED') OR "terminalAt" IS NOT NULL)
      AND ("deliveryState" NOT IN ('NOT_SENT', 'UNKNOWN') OR "terminalAt" IS NULL)
    )
  );

ALTER TABLE "MarketingCampaignRecipient" DROP CONSTRAINT "MarketingCampaignRecipient_outcome_timestamps_check";
ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_outcome_timestamps_check" CHECK (
    "lifecycleVersion" IN (0, 2) OR (
      ("deliveryState" <> 'ACCEPTED' OR "acceptedAt" IS NOT NULL)
      AND ("deliveryState" <> 'DELIVERED' OR "deliveredAt" IS NOT NULL)
      AND ("deliveryState" <> 'FAILED' OR "failedAt" IS NOT NULL)
      AND ("nextAttemptAt" IS NULL OR "deliveryState" = 'NOT_SENT')
    )
  );

-- Immutable safe route references. Full ownership is checked when the graph seals.
CREATE FUNCTION b35_route_shape(p JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE e JSONB; keys TEXT[];
BEGIN
 IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p) k;
 IF keys <> ARRAY['apnsDevices','contract','link','policyVersion','primary','userId','webPushEndpoints']
 OR p->>'contract' IS DISTINCT FROM 'maya.bulk-client-route/1'
 OR p->>'primary' NOT IN ('inbox','telegram','web_push','none')
 OR p->>'policyVersion' IS DISTINCT FROM '1'
 OR jsonb_typeof(p->'webPushEndpoints') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p->'apnsDevices') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p->'webPushEndpoints') > 5 THEN RETURN false; END IF;
 IF (p->>'primary' = 'inbox') IS DISTINCT FROM (p->>'userId' IS NOT NULL)
 OR (p->>'primary' IN ('inbox','telegram')) IS DISTINCT FROM (p->>'link' IS NOT NULL)
 OR (p->>'primary' <> 'inbox' AND jsonb_array_length(p->'apnsDevices') > 0)
 OR (p->>'primary' = 'none' AND jsonb_array_length(p->'webPushEndpoints') > 0)
 OR (p->>'primary' = 'web_push' AND jsonb_array_length(p->'webPushEndpoints') = 0) THEN RETURN false; END IF;
 IF p->>'link' IS NOT NULL THEN
  e := p->'link';
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(e) k;
  IF keys <> ARRAY['id','provider','subjectHash','verificationEvidenceHash']
  OR NULLIF(e->>'id','') IS NULL OR NULLIF(e->>'provider','') IS NULL
  OR NOT COALESCE(e->>'subjectHash' ~ '^[a-f0-9]{64}$',false)
  OR NOT COALESCE(e->>'verificationEvidenceHash' ~ '^[a-f0-9]{64}$',false) THEN RETURN false; END IF;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'webPushEndpoints') LOOP
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(e) k;
  IF keys <> ARRAY['clientChannelLinkId','id','materialHash'] OR NULLIF(e->>'id','') IS NULL
  OR NULLIF(e->>'clientChannelLinkId','') IS NULL OR NOT COALESCE(e->>'materialHash' ~ '^[a-f0-9]{64}$',false) THEN RETURN false; END IF;
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(p->'apnsDevices') LOOP
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(e) k;
  IF keys <> ARRAY['id','tokenHash'] OR NULLIF(e->>'id','') IS NULL
  OR NOT COALESCE(e->>'tokenHash' ~ '^[a-f0-9]{64}$',false) THEN RETURN false; END IF;
 END LOOP;
 RETURN (SELECT count(*)=count(DISTINCT value->>'id') FROM jsonb_array_elements(p->'webPushEndpoints'))
 AND (SELECT count(*)=count(DISTINCT value->>'id') FROM jsonb_array_elements(p->'apnsDevices'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE FUNCTION b35_slots(p JSONB) RETURNS TABLE(slot TEXT, channel TEXT)
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
 SELECT 'primary', p->>'primary' WHERE p->>'primary' <> 'none'
 UNION ALL SELECT 'web_push','web_push' WHERE p->>'primary' IN ('inbox','telegram') AND jsonb_array_length(p->'webPushEndpoints') > 0
 UNION ALL SELECT 'apns:'||(value->>'id'),'apns' FROM jsonb_array_elements(p->'apnsDevices')
$$;

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "B35_campaign_shape_check" CHECK (
 CASE WHEN "lifecycleVersion" = 2 THEN
  "bulkIntentContract" IS NOT DISTINCT FROM 'maya.marketing-bulk-intent/1'
  AND COALESCE("bulkIntentHash" ~ '^[a-f0-9]{64}$',false)
  AND "scope" IS NOT DISTINCT FROM 'BULK' AND "audienceId" IS NOT NULL
  AND "channel" IS NULL AND "provider" IS NULL
  AND "parentRecipientId" IS NULL AND "bulkSlotKey" IS NULL
  AND "deliveryCapabilityKey" IS NULL AND "deliveryCapabilityVersion" IS NULL
  AND "retryPolicyKey" IS NULL AND "retryPolicyVersion" IS NULL
  AND "reconciliationPolicyKey" IS NULL AND "reconciliationPolicyVersion" IS NULL
  AND "recipientUserIdsJson" = '[]'::jsonb
  AND "recipientCount" BETWEEN 0 AND 500 AND NULLIF("idempotencyKey",'') IS NOT NULL
  AND "createdByUserId" IS NOT NULL AND "aggregateState" IS NOT NULL
  AND "audienceSnapshotHash" ~ '^[a-f0-9]{64}$' AND "messageSnapshotHash" ~ '^[a-f0-9]{64}$'
  AND (CASE WHEN "confirmedAt" IS NULL THEN
    "aggregateState" = 'DRAFT' AND "confirmedByUserId" IS NULL AND "confirmationHash" IS NULL AND "actionExecutionId" IS NULL
   ELSE "aggregateState" NOT IN ('DRAFT','LEGACY_UNRESOLVED') AND "confirmedByUserId" IS NOT NULL
    AND COALESCE("confirmationHash" ~ '^[a-f0-9]{64}$',false) AND "actionExecutionId" IS NOT NULL END)
 ELSE "channel" IS NOT NULL AND "provider" IS NOT NULL
  AND "bulkIntentContract" IS NULL AND "bulkIntentHash" IS NULL
  AND (("parentRecipientId" IS NULL AND "bulkSlotKey" IS NULL) OR
   ("lifecycleVersion" = 1 AND "scope" = 'SINGLE' AND "parentRecipientId" IS NOT NULL AND NULLIF("bulkSlotKey",'') IS NOT NULL)) END
);
ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "B35_recipient_shape_check" CHECK (
 CASE WHEN "lifecycleVersion" = 2 THEN
  "clientId" IS NOT NULL AND "recipientKind" IS NOT DISTINCT FROM 'canonical_client'
  AND "identityVersion" IS NOT DISTINCT FROM 1 AND b35_route_shape("routePlanJson")
  AND COALESCE("contentIdentityHash" ~ '^[a-f0-9]{64}$',false)
  AND COALESCE("recipientRefHash" ~ '^[a-f0-9]{64}$',false)
  AND "aggregateState" IS NOT NULL AND "aggregateState" NOT IN ('DRAFT','LEGACY_UNRESOLVED')
  AND "internalUserId" IS NULL AND "deliveryState" IS NULL AND "externalDispatchState" IS NULL
  AND "reconciliationState" IS NULL AND "attemptCount" = 0
  AND "providerMessageId" IS NULL AND "providerStatus" IS NULL AND "dispatchedAt" IS NULL
  AND "responseReceivedAt" IS NULL AND "acceptedAt" IS NULL AND "deliveredAt" IS NULL
  AND "failedAt" IS NULL AND "unknownAt" IS NULL AND "nextAttemptAt" IS NULL
  AND (("terminalAt" IS NOT NULL) = ("aggregateState" IN ('COMPLETED','PARTIAL','FAILED','SKIPPED','CANCELLED','EXPIRED')))
  AND ("terminalAt" IS NULL OR ("leaseOwner" IS NULL AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL))
  AND ("contentEncrypted" IS NOT NULL OR ("terminalAt" IS NOT NULL AND "payloadRetentionUntil" IS NOT NULL))
 ELSE "clientId" IS NULL AND "routePlanJson" IS NULL AND "contentEncrypted" IS NULL AND "aggregateState" IS NULL END
);
ALTER TABLE "MarketingAudience" ADD CONSTRAINT "B35_audience_shape_check" CHECK (
 "snapshotContract" IS NULL OR ("snapshotContract" = 'maya.bulk-client-audience/1'
 AND "status" IN ('ASSEMBLING','FROZEN') AND "recipientUserIdsJson" = '[]'::jsonb
 AND "snapshotHash" ~ '^[a-f0-9]{64}$' AND "candidateCount" BETWEEN 0 AND 500
 AND "eligibleCount" BETWEEN 0 AND "candidateCount" AND "unavailableCount" >= 0)
);

-- Sealing is transactional. The parent lock orders concurrent member edits/seal.
CREATE FUNCTION b35_audience_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE a "MarketingAudience"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME = 'MarketingAudience' THEN
  IF TG_OP <> 'INSERT' AND OLD."snapshotContract" IS NOT NULL THEN
   IF TG_OP = 'DELETE' OR (OLD.status = 'FROZEN' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN
    RAISE EXCEPTION 'B35 immutable audience' USING ERRCODE = '23514';
   END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."snapshotContract" IS DISTINCT FROM OLD."snapshotContract" THEN
   RAISE EXCEPTION 'B35 historical audience promotion forbidden' USING ERRCODE = '23514';
  END IF;
 ELSE
  SELECT * INTO a FROM "MarketingAudience" WHERE id = COALESCE(NEW."audienceId",OLD."audienceId")
   AND "tenantId" = COALESCE(NEW."tenantId",OLD."tenantId") FOR UPDATE;
  IF TG_OP = 'UPDATE' AND (NEW."audienceId",NEW."tenantId",NEW."clientId") IS DISTINCT FROM (OLD."audienceId",OLD."tenantId",OLD."clientId") THEN
   IF OLD."clientId" IS NOT NULL OR NEW."clientId" IS NOT NULL THEN
    RAISE EXCEPTION 'B35 audience member identity immutable' USING ERRCODE = '23514';
   END IF;
  END IF;
  IF a."snapshotContract" IS NOT NULL THEN
   IF a.status = 'FROZEN' OR TG_OP = 'DELETE' OR NEW."clientId" IS NULL OR NEW."internalUserId" IS NOT NULL THEN
    RAISE EXCEPTION 'B35 frozen audience / canonical Client required' USING ERRCODE = '23514';
   END IF;
  ELSIF NEW."clientId" IS NOT NULL THEN
   RAISE EXCEPTION 'B35 Client requires canonical audience' USING ERRCODE = '23514';
  END IF;
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "B35_audience_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingAudience"
 FOR EACH ROW EXECUTE FUNCTION b35_audience_guard();
CREATE TRIGGER "B35_audience_member_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingAudienceRecipient"
 FOR EACH ROW EXECUTE FUNCTION b35_audience_guard();

CREATE FUNCTION b35_audience_sealed() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE a "MarketingAudience"%ROWTYPE; n INTEGER;
BEGIN
 SELECT * INTO a FROM "MarketingAudience" WHERE id=NEW.id;
 IF a."snapshotContract" IS NULL THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM "MarketingAudienceRecipient" WHERE "tenantId"=a."tenantId" AND "audienceId"=a.id;
 IF a.status <> 'FROZEN' OR n <> a."eligibleCount" OR EXISTS (
  SELECT 1 FROM "MarketingAudienceRecipient" WHERE "tenantId"=a."tenantId" AND "audienceId"=a.id AND "clientId" IS NULL
 ) THEN RAISE EXCEPTION 'B35 audience must commit sealed with exact canonical members' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "B35_audience_sealed" AFTER INSERT OR UPDATE ON "MarketingAudience"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b35_audience_sealed();

-- Identity comparisons deliberately ignore mutable projections/lease counters.
CREATE FUNCTION b35_pick(j JSONB, keys TEXT[]) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
 SELECT COALESCE(jsonb_object_agg(k,j->k),'{}'::jsonb) FROM unnest(keys) k
$$;
CREATE FUNCTION b35_graph_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE root "MarketingCampaign"%ROWTYPE; parent "MarketingCampaignRecipient"%ROWTYPE;
 oldj JSONB; newj JSONB; keys TEXT[]; sealed BOOLEAN; owned BOOLEAN;
BEGIN
 oldj:=to_jsonb(OLD); newj:=to_jsonb(NEW);
 IF TG_TABLE_NAME='MarketingCampaign' THEN
  owned:=COALESCE(NEW."lifecycleVersion"=2 OR NEW."parentRecipientId" IS NOT NULL,false)
   OR COALESCE(OLD."lifecycleVersion"=2 OR OLD."parentRecipientId" IS NOT NULL,false);
  IF NOT owned THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'B35 durable identity cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW."tenantId",NEW."lifecycleVersion",NEW."parentRecipientId",NEW."bulkSlotKey")
    IS DISTINCT FROM (OLD.id,OLD."tenantId",OLD."lifecycleVersion",OLD."parentRecipientId",OLD."bulkSlotKey") THEN
   RAISE EXCEPTION 'B35 role/identity immutable; no historical promotion' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD."aggregateState" IN ('COMPLETED','PARTIAL','FAILED','SKIPPED','CANCELLED','EXPIRED')
   AND NEW."aggregateState" IS DISTINCT FROM OLD."aggregateState" THEN
   RAISE EXCEPTION 'B35 terminal campaign cannot reopen' USING ERRCODE='23514';
  END IF;
  sealed:=TG_OP='UPDATE' AND (OLD."confirmedAt" IS NOT NULL OR OLD."parentRecipientId" IS NOT NULL);
  keys:=ARRAY['id','tenantId','lifecycleVersion','parentRecipientId','bulkSlotKey','bulkIntentContract','bulkIntentHash',
   'createdByUserId','audienceId','channel','provider','message','recipientUserIdsJson','recipientCount','idempotencyKey',
   'expiresAt','createdAt','audienceSnapshotHash','messageSnapshotHash','confirmationHash','confirmedAt','confirmedByUserId',
   'scheduledFor','scope','actionExecutionId','contentRef','deliveryCapabilityKey','deliveryCapabilityVersion',
   'retryPolicyKey','retryPolicyVersion','reconciliationPolicyKey','reconciliationPolicyVersion','payloadRetentionUntil','auditRetentionUntil'];
 ELSE
  SELECT * INTO root FROM "MarketingCampaign" WHERE id=COALESCE(NEW."campaignId",OLD."campaignId")
   AND "tenantId"=COALESCE(NEW."tenantId",OLD."tenantId") FOR UPDATE;
  owned:=root."lifecycleVersion"=2 OR root."parentRecipientId" IS NOT NULL
    OR COALESCE(OLD."lifecycleVersion"=2,false) OR COALESCE(NEW."lifecycleVersion"=2,false);
  IF NOT owned THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'B35 durable recipient cannot be deleted' USING ERRCODE='23514'; END IF;
  IF (root."lifecycleVersion"=2) IS DISTINCT FROM (NEW."lifecycleVersion"=2) THEN
   RAISE EXCEPTION 'B35 logical/transport role mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND root."lifecycleVersion"=2 AND root."confirmedAt" IS NOT NULL THEN
   RAISE EXCEPTION 'B35 confirmed member set immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND NEW."contentEncrypted" IS NULL AND NEW."lifecycleVersion"=2 THEN
   RAISE EXCEPTION 'B35 new Client content must be durable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW."tenantId",NEW."campaignId",NEW."lifecycleVersion",NEW."clientId")
   IS DISTINCT FROM (OLD.id,OLD."tenantId",OLD."campaignId",OLD."lifecycleVersion",OLD."clientId") THEN
   RAISE EXCEPTION 'B35 recipient identity immutable' USING ERRCODE='23514';
  END IF;
  sealed:=TG_OP='UPDATE' AND (root."confirmedAt" IS NOT NULL OR root."parentRecipientId" IS NOT NULL);
  keys:=ARRAY['id','tenantId','campaignId','clientId','lifecycleVersion','externalClientId','internalUserId','idempotencyKey',
   'createdAt','identityVersion','recipientKind','recipientRefHash','contentIdentityHash','routePlanJson',
   'payloadRetentionUntil','auditRetentionUntil','consentEvidenceId','eligibilityEvidenceRef'];
  IF sealed AND NEW."contentEncrypted" IS DISTINCT FROM OLD."contentEncrypted" AND NOT (
   NEW."contentEncrypted" IS NULL AND OLD."terminalAt" IS NOT NULL
   AND OLD."payloadRetentionUntil" IS NOT NULL AND OLD."payloadRetentionUntil" <= CURRENT_TIMESTAMP
  ) THEN RAISE EXCEPTION 'B35 immutable Client content' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD."leaseTokenHash" IS NOT NULL AND NEW."leaseTokenHash" IS NOT NULL
   AND NEW."leaseTokenHash" IS DISTINCT FROM OLD."leaseTokenHash" AND OLD."leaseExpiresAt">CURRENT_TIMESTAMP THEN
   RAISE EXCEPTION 'B35 live lease cannot be stolen' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.revision <= OLD.revision THEN
   RAISE EXCEPTION 'B35 recipient revision must advance' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD."terminalAt" IS NOT NULL AND
   (to_jsonb(NEW)-ARRAY['updatedAt','revision','contentEncrypted']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['updatedAt','revision','contentEncrypted'])
  THEN RAISE EXCEPTION 'B35 terminal outcome cannot reopen or change' USING ERRCODE='23514'; END IF;
 END IF;
 IF sealed AND b35_pick(oldj,keys) IS DISTINCT FROM b35_pick(newj,keys) THEN
  RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: B35 approved intent is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "B35_campaign_identity_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingCampaign"
 FOR EACH ROW EXECUTE FUNCTION b35_graph_identity_guard();
CREATE TRIGGER "B35_recipient_identity_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingCampaignRecipient"
 FOR EACH ROW EXECUTE FUNCTION b35_graph_identity_guard();

-- No new durable graph can commit with foreign or incomplete ownership.
CREATE FUNCTION b35_graph_check() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE c "MarketingCampaign"%ROWTYPE; r "MarketingCampaignRecipient"%ROWTYPE;
 a "MarketingAudience"%ROWTYPE; e "ActionExecution"%ROWTYPE; n INTEGER; m INTEGER;
 campaign_id TEXT; tid TEXT; route JSONB; slotrow RECORD; leaf RECORD;
BEGIN
 tid:=NEW."tenantId";
 IF TG_TABLE_NAME='MarketingCampaign' THEN campaign_id:=NEW.id;
 ELSIF TG_TABLE_NAME='MarketingCampaignRecipient' THEN campaign_id:=NEW."campaignId";
 ELSE
  SELECT mc.id INTO campaign_id FROM "MarketingCampaign" mc WHERE mc."actionExecutionId"=NEW.id AND mc."tenantId"=tid;
  IF campaign_id IS NULL AND NEW.capability IN ('communication.bulk-campaign.admit.v2','communication.bulk-slot.admit.v2')
   AND NEW.state NOT IN ('PENDING_APPROVAL','NOT_EXECUTED') THEN
   RAISE EXCEPTION 'B35 admission requires exact durable graph' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT * INTO c FROM "MarketingCampaign" WHERE "MarketingCampaign".id=campaign_id AND "tenantId"=tid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF c."lifecycleVersion"=2 THEN
  SELECT * INTO a FROM "MarketingAudience" WHERE "MarketingAudience".id=c."audienceId" AND "tenantId"=tid;
  IF a."snapshotContract" IS DISTINCT FROM 'maya.bulk-client-audience/1' OR a.status IS DISTINCT FROM 'FROZEN'
    OR a."snapshotHash" IS DISTINCT FROM c."audienceSnapshotHash" OR a."eligibleCount"<>c."recipientCount" THEN
   RAISE EXCEPTION 'B35 exact sealed audience required' USING ERRCODE='23514';
  END IF;
  IF c."confirmedAt" IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO e FROM "ActionExecution" WHERE "ActionExecution".id=c."actionExecutionId" AND "tenantId"=tid;
  IF e.capability IS DISTINCT FROM 'communication.bulk-campaign.admit.v2' OR e."actionClass" IS DISTINCT FROM 'deliver_bulk_campaign'
   OR e."targetRef" IS DISTINCT FROM c.id OR e."approvalDecision" IS DISTINCT FROM 'APPROVED'
   OR e."approvalDecidedByUserId" IS DISTINCT FROM c."confirmedByUserId" OR e."approvalDecidedAt" IS DISTINCT FROM c."confirmedAt"
   OR NOT COALESCE(e."evidenceRefsJson" @> jsonb_build_array('b35:intent:'||c."bulkIntentHash"),false) THEN
   RAISE EXCEPTION 'B35 matching immutable Action Engine approval required' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
   (SELECT "clientId" FROM "MarketingAudienceRecipient" WHERE "tenantId"=tid AND "audienceId"=c."audienceId"
    EXCEPT SELECT "clientId" FROM "MarketingCampaignRecipient" WHERE "tenantId"=tid AND "campaignId"=c.id AND "lifecycleVersion"=2)
   UNION ALL
   (SELECT "clientId" FROM "MarketingCampaignRecipient" WHERE "tenantId"=tid AND "campaignId"=c.id
    EXCEPT SELECT "clientId" FROM "MarketingAudienceRecipient" WHERE "tenantId"=tid AND "audienceId"=c."audienceId")
  ) THEN RAISE EXCEPTION 'B35 approved audience/Client child set must be equal' USING ERRCODE='23514'; END IF;
  -- Verify references only at first seal, not on later revocation/reconciliation.
  IF TG_TABLE_NAME='MarketingCampaign' AND (TG_OP='INSERT' OR to_jsonb(OLD)->>'confirmedAt' IS NULL) THEN
   FOR r IN SELECT * FROM "MarketingCampaignRecipient" WHERE "tenantId"=tid AND "campaignId"=c.id LOOP
    route:=r."routePlanJson";
    IF route->>'link' IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM "ClientChannelLink" l WHERE l.id=route->'link'->>'id' AND l."tenantId"=tid AND l."clientId"=r."clientId"
      AND l.provider=route->'link'->>'provider' AND l."providerSubjectHash"=route->'link'->>'subjectHash'
      AND l."verificationEvidenceHash"=route->'link'->>'verificationEvidenceHash' AND l."revokedAt" IS NULL
      AND l.provider=CASE route->>'primary' WHEN 'inbox' THEN 'maya_user' ELSE 'telegram' END
    ) THEN RAISE EXCEPTION 'B35 route binding foreign/revoked/mismatched' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(route->'webPushEndpoints') ep WHERE NOT EXISTS (
     SELECT 1 FROM "ClientWebPushEndpoint" p WHERE p.id=ep->>'id' AND p."tenantId"=tid AND p."clientId"=r."clientId"
      AND p."clientChannelLinkId"=ep->>'clientChannelLinkId' AND p."materialHash"=ep->>'materialHash' AND p."endedAt" IS NULL
    )) THEN RAISE EXCEPTION 'B35 Web Push plan foreign/ended/mismatched' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(route->'apnsDevices') d WHERE NOT EXISTS (
     SELECT 1 FROM "DevicePushToken" p WHERE p.id=d->>'id' AND p."tenantId"=tid AND p."userId"=route->>'userId'
    )) THEN RAISE EXCEPTION 'B35 APNs plan foreign/missing' USING ERRCODE='23514'; END IF;
   END LOOP;
  END IF;
  IF c."aggregateState" IN ('COMPLETED','PARTIAL','FAILED','SKIPPED','CANCELLED','EXPIRED') AND EXISTS (
   SELECT 1 FROM "MarketingCampaignRecipient" cr WHERE cr."tenantId"=tid AND cr."campaignId"=c.id
    AND (cr."terminalAt" IS NULL OR cr."aggregateState" IN ('READY','RUNNING','UNRESOLVED'))
  ) THEN RAISE EXCEPTION 'B35 root cannot terminalize pending/UNKNOWN children' USING ERRCODE='23514'; END IF;
  IF c."aggregateState" IN ('COMPLETED','PARTIAL','FAILED','SKIPPED','CANCELLED','EXPIRED') AND c."aggregateState"::text IS DISTINCT FROM (
   SELECT CASE WHEN count(*)=0 THEN 'SKIPPED'
    WHEN count(*) FILTER (WHERE cr."aggregateState"='COMPLETED')=count(*) THEN 'COMPLETED'
    WHEN count(*) FILTER (WHERE cr."aggregateState"='FAILED')=count(*) THEN 'FAILED'
    WHEN count(*) FILTER (WHERE cr."aggregateState"='CANCELLED')=count(*) THEN 'CANCELLED'
    WHEN count(*) FILTER (WHERE cr."aggregateState"='EXPIRED')=count(*) THEN 'EXPIRED'
    WHEN count(*) FILTER (WHERE cr."aggregateState" IN ('SKIPPED','CANCELLED','EXPIRED'))=count(*) THEN 'SKIPPED'
    ELSE 'PARTIAL' END
   FROM "MarketingCampaignRecipient" cr WHERE cr."tenantId"=tid AND cr."campaignId"=c.id
  ) THEN RAISE EXCEPTION 'B35 root outcome must project actual Client outcomes' USING ERRCODE='23514'; END IF;
 ELSIF c."parentRecipientId" IS NOT NULL THEN
  SELECT * INTO r FROM "MarketingCampaignRecipient" WHERE "MarketingCampaignRecipient".id=c."parentRecipientId" AND "tenantId"=tid;
  IF r."lifecycleVersion" IS DISTINCT FROM 2 OR NOT EXISTS (
   SELECT 1 FROM "MarketingCampaign" p WHERE p.id=r."campaignId" AND p."tenantId"=tid AND p."lifecycleVersion"=2 AND p."confirmedAt" IS NOT NULL
  ) OR NOT EXISTS (SELECT 1 FROM b35_slots(r."routePlanJson") s WHERE s.slot=c."bulkSlotKey" AND s.channel=c.channel) THEN
   RAISE EXCEPTION 'B35 transport must fill an originally approved slot' USING ERRCODE='23514';
  END IF;
  SELECT * INTO e FROM "ActionExecution" WHERE "ActionExecution".id=c."actionExecutionId" AND "tenantId"=tid;
  IF e.capability IS DISTINCT FROM 'communication.bulk-slot.admit.v2' OR e."actionClass" IS DISTINCT FROM 'deliver_bulk_campaign'
    OR e."targetRef" IS DISTINCT FROM r.id OR NOT COALESCE(e."evidenceRefsJson" @> jsonb_build_array('b35:slot:'||c."bulkSlotKey"),false) THEN
   RAISE EXCEPTION 'B35 transport admission binding mismatch' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO n FROM "MarketingCampaignRecipient" cr WHERE cr."tenantId"=tid AND cr."campaignId"=c.id;
  IF n<>c."recipientCount" THEN RAISE EXCEPTION 'B35 transport leaf set must match exact pinned count' USING ERRCODE='23514'; END IF;
  FOR leaf IN SELECT * FROM "MarketingCampaignRecipient" cr WHERE cr."tenantId"=tid AND cr."campaignId"=c.id LOOP
   IF (CASE c.channel
    WHEN 'inbox' THEN leaf."recipientKind"='internal_user' AND leaf."internalUserId"=r."routePlanJson"->>'userId'
      AND leaf."eligibilityEvidenceRef"='b35:link:'||(r."routePlanJson"->'link'->>'id')
    WHEN 'telegram' THEN leaf."recipientKind"='telegram_chat' AND leaf."internalUserId" IS NULL
      AND leaf."eligibilityEvidenceRef"='b35:link:'||(r."routePlanJson"->'link'->>'id')
    WHEN 'apns' THEN leaf."recipientKind"='device_token' AND leaf."internalUserId"=r."routePlanJson"->>'userId'
      AND leaf."eligibilityEvidenceRef"='b35:device:'||substring(c."bulkSlotKey" FROM 6)
    WHEN 'web_push' THEN leaf."recipientKind"='client_web_push_endpoint' AND leaf."internalUserId" IS NULL AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(r."routePlanJson"->'webPushEndpoints') ep
       WHERE leaf."eligibilityEvidenceRef"='b35:endpoint:'||(ep->>'id'))
    ELSE false END) IS NOT TRUE THEN
    RAISE EXCEPTION 'B35 leaf must retain exact planned endpoint reference' USING ERRCODE='23514';
   END IF;
  END LOOP;
  IF (SELECT count(DISTINCT cr."eligibilityEvidenceRef") FROM "MarketingCampaignRecipient" cr WHERE cr."tenantId"=tid AND cr."campaignId"=c.id) <> c."recipientCount" THEN
   RAISE EXCEPTION 'B35 duplicate endpoint leaf forbidden' USING ERRCODE='23514'; END IF;
  IF c.channel='web_push' THEN
   IF c."recipientCount" <> jsonb_array_length(r."routePlanJson"->'webPushEndpoints') THEN
    RAISE EXCEPTION 'B35 exact pinned Web Push fanout required' USING ERRCODE='23514'; END IF;
  ELSIF c."recipientCount"<>1 THEN RAISE EXCEPTION 'B35 single fixed transport recipient required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "B35_campaign_graph" AFTER INSERT OR UPDATE ON "MarketingCampaign"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b35_graph_check();
CREATE CONSTRAINT TRIGGER "B35_recipient_graph" AFTER INSERT OR UPDATE ON "MarketingCampaignRecipient"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b35_graph_check();
CREATE CONSTRAINT TRIGGER "B35_admission_graph" AFTER INSERT OR UPDATE ON "ActionExecution"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b35_graph_check();

CREATE FUNCTION b35_attempt_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE c "MarketingCampaign"%ROWTYPE; r "MarketingCampaignRecipient"%ROWTYPE;
 logical "MarketingCampaignRecipient"%ROWTYPE; previous "MarketingDeliveryAttempt"%ROWTYPE; seq INTEGER;
BEGIN
 SELECT * INTO c FROM "MarketingCampaign" WHERE id=COALESCE(NEW."campaignId",OLD."campaignId") AND "tenantId"=COALESCE(NEW."tenantId",OLD."tenantId");
 IF c."lifecycleVersion"=2 THEN RAISE EXCEPTION 'B35 coordinator cannot create provider attempts' USING ERRCODE='23514'; END IF;
 IF c."parentRecipientId" IS NULL THEN
  IF NEW."dispatchEligibilityJson" IS NOT NULL THEN RAISE EXCEPTION 'B35 dispatch proof requires bulk transport owner' USING ERRCODE='23514'; END IF;
  RETURN COALESCE(NEW,OLD);
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'B35 attempt history cannot be deleted' USING ERRCODE='23514'; END IF;
 SELECT * INTO r FROM "MarketingCampaignRecipient" WHERE id=NEW."recipientId" AND "tenantId"=NEW."tenantId" AND "campaignId"=c.id FOR UPDATE;
 SELECT * INTO logical FROM "MarketingCampaignRecipient" WHERE id=c."parentRecipientId" AND "tenantId"=c."tenantId";
 IF r."lifecycleVersion" IS DISTINCT FROM 1 OR NEW."lifecycleVersion"<>1 THEN RAISE EXCEPTION 'B35 transport recipient required' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT COALESCE(max("attemptNumber"),0)+1 INTO seq FROM "MarketingDeliveryAttempt" WHERE "tenantId"=NEW."tenantId" AND "recipientId"=r.id;
  IF NEW."attemptNumber"<>seq OR NEW.state<>'STARTED' OR r."terminalAt" IS NOT NULL
   OR r."leaseExpiresAt">=CURRENT_TIMESTAMP OR EXISTS (
    SELECT 1 FROM "MarketingDeliveryAttempt" WHERE "tenantId"=NEW."tenantId" AND "recipientId"=r.id AND state='STARTED'
   ) THEN RAISE EXCEPTION 'B35 attempt claim is not unique/openable' USING ERRCODE='23514'; END IF;
  IF NEW.kind='EXECUTION' AND (r."deliveryState"<>'NOT_SENT' OR r."externalDispatchState"<>'NOT_CROSSED'
   OR NEW."externalDispatchState"<>'NOT_CROSSED' OR NOT EXISTS (
    SELECT 1 FROM "ActionExecution" e WHERE e.id=c."actionExecutionId" AND e."tenantId"=c."tenantId" AND e.state='SUCCEEDED'
   ) OR EXISTS (
    SELECT 1 FROM "MarketingDeliveryAttempt" WHERE "tenantId"=NEW."tenantId" AND "recipientId"=r.id AND kind='EXECUTION'
      AND NOT (state='FAILED' AND "externalDispatchState"='NOT_CROSSED' AND "outcomeCode"='WORKER_LOST_BEFORE_DISPATCH')
   )) THEN RAISE EXCEPTION 'B35 effect requires successful admission; no repeat after outcome' USING ERRCODE='23514'; END IF;
  IF NEW.kind='EXECUTION' AND c."bulkSlotKey"<>'primary' AND NOT EXISTS (
   SELECT 1 FROM "MarketingCampaign" primary_envelope JOIN "MarketingCampaignRecipient" primary_leaf
    ON primary_leaf."campaignId"=primary_envelope.id AND primary_leaf."tenantId"=primary_envelope."tenantId"
   WHERE primary_envelope."parentRecipientId"=c."parentRecipientId" AND primary_envelope."tenantId"=c."tenantId"
    AND primary_envelope."bulkSlotKey"='primary' AND primary_leaf."deliveryState" IN ('ACCEPTED','DELIVERED')
  ) THEN RAISE EXCEPTION 'B35 supplemental effect requires actual primary acceptance' USING ERRCODE='23514'; END IF;
  IF NEW.kind='RECONCILIATION' AND (r."deliveryState"<>'UNKNOWN' OR r."reconciliationState"<>'REQUIRED'
    OR NEW."externalDispatchState"<>'NOT_APPLICABLE') THEN
   RAISE EXCEPTION 'B35 reconciliation requires original UNKNOWN' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'STARTED' AND NEW."providerReferenceEncrypted" IS NULL AND OLD."providerReferenceEncrypted" IS NOT NULL
    AND OLD."payloadRetentionUntil" IS NOT NULL AND OLD."payloadRetentionUntil"<=CURRENT_TIMESTAMP
    AND (to_jsonb(NEW)-'providerReferenceEncrypted')=(to_jsonb(OLD)-'providerReferenceEncrypted') THEN
   RETURN NEW; -- Existing payload-retention authority may redact, never rewrite an outcome.
  END IF;
  IF OLD.state<>'STARTED' OR b35_pick(to_jsonb(OLD),ARRAY['id','tenantId','campaignId','recipientId','attemptNumber','kind','startedAt','createdAt','batchKey','lifecycleVersion','providerRequestIdentityHash','providerIdempotencyKeyHash','payloadRetentionUntil'])
   IS DISTINCT FROM b35_pick(to_jsonb(NEW),ARRAY['id','tenantId','campaignId','recipientId','attemptNumber','kind','startedAt','createdAt','batchKey','lifecycleVersion','providerRequestIdentityHash','providerIdempotencyKeyHash','payloadRetentionUntil']) THEN
   RAISE EXCEPTION 'B35 finished attempt / identity immutable' USING ERRCODE='23514'; END IF;
  IF OLD."externalDispatchState"<>'NOT_CROSSED' AND NEW."dispatchEligibilityJson" IS DISTINCT FROM OLD."dispatchEligibilityJson" THEN
   RAISE EXCEPTION 'B35 dispatch eligibility is sealed' USING ERRCODE='23514'; END IF;
  IF OLD."externalDispatchState"='MAY_HAVE_CROSSED' AND NEW."externalDispatchState" NOT IN ('MAY_HAVE_CROSSED','ACKNOWLEDGED') THEN
   RAISE EXCEPTION 'B35 provider boundary cannot be erased' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.kind='EXECUTION' AND NEW."externalDispatchState"<>'NOT_CROSSED' THEN
  IF NOT COALESCE(NEW."dispatchEligibilityJson" @> jsonb_build_object('contract','maya.bulk-dispatch-eligibility/1',
   'tenantId',NEW."tenantId",'clientId',logical."clientId",'decision','ALLOW'),false)
   OR NULLIF(NEW."dispatchEligibilityJson"->>'checkedAt','') IS NULL THEN
   RAISE EXCEPTION 'B35 dispatch boundary requires current ALLOW evidence' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "B35_attempt_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingDeliveryAttempt"
 FOR EACH ROW EXECUTE FUNCTION b35_attempt_guard();

-- Deferred correlation supports the existing atomic recipient+attempt update order.
CREATE FUNCTION b35_outcome_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r "MarketingCampaignRecipient"%ROWTYPE; c "MarketingCampaign"%ROWTYPE;
 a "MarketingDeliveryAttempt"%ROWTYPE; n INTEGER; missing INTEGER; pending INTEGER; unknowns INTEGER;
 successes INTEGER; failures INTEGER; skips INTEGER; projected TEXT;
BEGIN
 SELECT * INTO r FROM "MarketingCampaignRecipient" WHERE id=NEW.id;
 SELECT * INTO c FROM "MarketingCampaign" WHERE id=r."campaignId" AND "tenantId"=r."tenantId";
 IF r."lifecycleVersion"=2 THEN
  IF r."terminalAt" IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO missing FROM b35_slots(r."routePlanJson") s WHERE NOT EXISTS (
   SELECT 1 FROM "MarketingCampaign" e WHERE e."tenantId"=r."tenantId" AND e."parentRecipientId"=r.id AND e."bulkSlotKey"=s.slot
  );
  SELECT count(*) FILTER (WHERE leaf."deliveryState"='NOT_SENT'), count(*) FILTER (WHERE leaf."deliveryState"='UNKNOWN'),
   count(*) FILTER (WHERE leaf."deliveryState" IN ('ACCEPTED','DELIVERED')),
   count(*) FILTER (WHERE leaf."deliveryState"='FAILED'), count(*) FILTER (WHERE leaf."deliveryState"='SKIPPED')
  INTO pending,unknowns,successes,failures,skips
  FROM "MarketingCampaign" e JOIN "MarketingCampaignRecipient" leaf ON leaf."campaignId"=e.id AND leaf."tenantId"=e."tenantId"
  WHERE e."tenantId"=r."tenantId" AND e."parentRecipientId"=r.id;
  IF missing>0 OR pending>0 OR unknowns>0 THEN RAISE EXCEPTION 'B35 partial/UNKNOWN cannot become terminal' USING ERRCODE='23514'; END IF;
  projected:=CASE WHEN successes>0 AND failures+skips=0 THEN 'COMPLETED'
   WHEN successes>0 THEN 'PARTIAL' WHEN failures>0 AND skips=0 THEN 'FAILED'
   WHEN failures>0 THEN 'PARTIAL' ELSE 'SKIPPED' END;
  IF r."aggregateState"::text<>projected AND NOT (projected='SKIPPED' AND r."aggregateState" IN ('EXPIRED','CANCELLED')) THEN
   RAISE EXCEPTION 'B35 aggregate must match actual leaves' USING ERRCODE='23514'; END IF;
 ELSIF c."parentRecipientId" IS NOT NULL THEN
  SELECT * INTO a FROM "MarketingDeliveryAttempt" WHERE "recipientId"=r.id AND "tenantId"=r."tenantId" ORDER BY "attemptNumber" DESC LIMIT 1;
  SELECT count(*) INTO n FROM "MarketingDeliveryAttempt" WHERE "recipientId"=r.id AND "tenantId"=r."tenantId";
  IF r."attemptCount"<>n OR ((a.state='STARTED') IS DISTINCT FROM (r."leaseOwner" IS NOT NULL) AND n>0) THEN
   RAISE EXCEPTION 'B35 lease/count must match owned attempt' USING ERRCODE='23514'; END IF;
  IF r."deliveryState" IN ('ACCEPTED','DELIVERED') AND NOT COALESCE(a.state='SUCCEEDED' AND (a."externalDispatchState"='ACKNOWLEDGED' OR a.kind='RECONCILIATION'),false) THEN
   RAISE EXCEPTION 'B35 confirmed delivery requires owned successful attempt' USING ERRCODE='23514'; END IF;
  IF r."deliveryState"='UNKNOWN' AND NOT COALESCE((a.state='UNKNOWN' OR a.kind='RECONCILIATION') AND r."externalDispatchState"='MAY_HAVE_CROSSED',false) THEN
   RAISE EXCEPTION 'B35 UNKNOWN evidence must survive' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD."deliveryState"='UNKNOWN' AND r."deliveryState"<>'UNKNOWN' AND NOT COALESCE(a.kind='RECONCILIATION' AND a.state='SUCCEEDED' AND r."reconciliationState"='RESOLVED',false) THEN
   RAISE EXCEPTION 'B35 UNKNOWN requires proven reconciliation' USING ERRCODE='23514'; END IF;
  IF r."externalDispatchState"='MAY_HAVE_CROSSED' AND NOT COALESCE(a."externalDispatchState"='MAY_HAVE_CROSSED' OR a.kind='RECONCILIATION',false) THEN
   RAISE EXCEPTION 'B35 boundary must match attempt' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "B35_outcome_guard" AFTER INSERT OR UPDATE ON "MarketingCampaignRecipient"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b35_outcome_guard();

CREATE FUNCTION b35_history_epoch_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."canonicalHistoryStartedAt" IS NOT NULL THEN RAISE EXCEPTION 'B35 history epoch cannot be erased' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD."canonicalHistoryStartedAt" IS NOT NULL THEN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."canonicalHistoryStartedAt" IS DISTINCT FROM OLD."canonicalHistoryStartedAt" THEN
   RAISE EXCEPTION 'B35 history epoch is write-once' USING ERRCODE='23514'; END IF;
 ELSIF NEW."canonicalHistoryStartedAt" IS NOT NULL THEN
  NEW."canonicalHistoryStartedAt":=timezone('UTC',CURRENT_TIMESTAMP)::timestamp(3);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "B35_history_epoch_guard" BEFORE INSERT OR UPDATE OR DELETE ON "MarketingPolicy"
 FOR EACH ROW EXECUTE FUNCTION b35_history_epoch_guard();

COMMIT;
