BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
CREATE UNIQUE INDEX "Membership_id_tenantId_key" ON "Membership"("id", "tenantId");

CREATE UNIQUE INDEX "Appointment_id_tenantId_mayaClientId_key" ON "Appointment"("id", "tenantId", "mayaClientId");

-- Shared SQL predicates only; no new execution or lifecycle owner.
CREATE FUNCTION "RC_execution_set_resolved"(tenant text, ids text[]) RETURNS boolean LANGUAGE sql AS $$
 SELECT NOT EXISTS (
  SELECT 1 FROM "ActionExecution" e WHERE e."tenantId"=tenant AND e.id=ANY(ids) AND (
   e.state NOT IN ('SUCCEEDED','FAILED','NOT_EXECUTED') OR e."finalizedAt" IS NULL OR
   e."reconciliationState" NOT IN ('NOT_REQUIRED','RESOLVED') OR
   e."leaseOwner" IS NOT NULL OR e."leaseTokenHash" IS NOT NULL OR e."leaseExpiresAt" IS NOT NULL OR
   EXISTS (SELECT 1 FROM "ActionAttempt" a WHERE a."tenantId"=tenant AND a."actionExecutionId"=e.id AND a.state='STARTED') OR
   EXISTS (SELECT 1 FROM "MarketingCampaign" c JOIN "MarketingCampaignRecipient" r ON r."campaignId"=c.id AND r."tenantId"=tenant
    WHERE c."tenantId"=tenant AND c."actionExecutionId"=e.id AND
     (r."deliveryState" IS NULL OR r."deliveryState" NOT IN ('ACCEPTED','DELIVERED','FAILED','SKIPPED') OR
      r."reconciliationState" IS NULL OR r."reconciliationState" NOT IN ('NOT_REQUIRED','RESOLVED') OR
      r."leaseOwner" IS NOT NULL OR r."leaseTokenHash" IS NOT NULL OR r."leaseExpiresAt" IS NOT NULL)) OR
   EXISTS (SELECT 1 FROM "MarketingCampaign" c JOIN "MarketingDeliveryAttempt" a ON a."campaignId"=c.id AND a."tenantId"=tenant
    WHERE c."tenantId"=tenant AND c."actionExecutionId"=e.id AND (a.state IS NULL OR a.state='STARTED'))
  )
 )
$$;

CREATE FUNCTION "RC_payload_claim"(tenant text, kind text, ref text, digest text, deadline timestamptz, action text, policy text)
RETURNS boolean LANGUAGE sql AS $$
 SELECT deadline <= clock_timestamp() AND EXISTS (
  SELECT 1 FROM "MaintenanceRun" r JOIN "MaintenanceItemClaim" c ON c."maintenanceRunId"=r.id
  WHERE r.scope='tenant' AND r."tenantId"=tenant AND r.state='RUNNING'
   AND r."maintenanceKind"=action AND r."policyKey"=policy AND r."policyVersion"=1
   AND r."authorityType"='SYSTEM_POLICY' AND r."requestedByUserId" IS NULL AND r."approvedByUserId" IS NULL
   AND r."leaseOwner" IS NOT NULL AND r."leaseTokenHash" IS NOT NULL AND r."leaseExpiresAt">clock_timestamp()
   AND r."cursorHash" IS NOT NULL AND r."maxItems" BETWEEN 1 AND 10000
   AND c."itemKind"=kind AND c.state='CLAIMED'
   AND c."itemRefHash"=encode(sha256(convert_to(r."runIdentityFingerprint" || '/' || kind || '/' || tenant || '/' || ref || '/' || digest || '/' || floor(extract(epoch FROM deadline)*1000)::bigint::text,'UTF8')),'hex')
 )
$$;

CREATE FUNCTION "RC_confirmed_owner_receipt"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item jsonb; ref text;
BEGIN
 item=to_jsonb(NEW); ref=item->>TG_ARGV[0];
 IF ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ActionExecution" e
  WHERE e.id=ref AND e."tenantId"=item->>'tenantId' AND e.state='SUCCEEDED'
   AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
   AND e."reconciliationState" IN ('NOT_REQUIRED','RESOLVED')) THEN
  RAISE EXCEPTION 'R-C owner mutation requires the same committed canonical receipt' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

COMMIT;
