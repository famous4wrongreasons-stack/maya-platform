BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
CREATE TABLE "PublicCommunityComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationKey" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "sourceKind" TEXT NOT NULL,
    "visitorSubjectHash" CHAR(64),
    "identityHash" CHAR(64) NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "authorEncrypted" TEXT,
    "textEncrypted" TEXT,
    "contentHash" CHAR(64) NOT NULL,
    "consentPolicyVersion" TEXT,
    "consentAcceptedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
    "payloadErasedAt" TIMESTAMPTZ(3),
    "creationExecutionId" TEXT,
    "sourceGatewayId" TEXT NOT NULL,
    "lastModerationExecutionId" TEXT,

    CONSTRAINT "PublicCommunityComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicCommunityInteraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "visitorSubjectHash" CHAR(64) NOT NULL,
    "identityHash" CHAR(64) NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "expectedVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "desiredValue" BOOLEAN,
    "viewDay" DATE,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "sourceGatewayId" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,

    CONSTRAINT "PublicCommunityInteraction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "R09_comment_feed_idx" ON "PublicCommunityComment"("tenantId", "publicationKey", "status", "createdAt");

CREATE INDEX "R09_comment_retention_idx" ON "PublicCommunityComment"("retentionUntil");

CREATE UNIQUE INDEX "R09_PublicCommunityComment_tenant_uq" ON "PublicCommunityComment"("id", "tenantId");

CREATE UNIQUE INDEX "R09_comment_identity_uq" ON "PublicCommunityComment"("tenantId", "sourceGatewayId", "identityHash");

CREATE UNIQUE INDEX "R09_PublicCommunityInteraction_tenant_uq" ON "PublicCommunityInteraction"("id", "tenantId");

CREATE UNIQUE INDEX "R09_interaction_identity_uq" ON "PublicCommunityInteraction"("tenantId", "sourceGatewayId", "identityHash");

CREATE UNIQUE INDEX "R09_interaction_version_uq" ON "PublicCommunityInteraction"("tenantId", "sourceGatewayId", "publicationKey", "visitorSubjectHash", "kind", "version");

ALTER TABLE "PublicCommunityComment" ADD CONSTRAINT "R09_PublicCommunityComment_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PublicCommunityComment" ADD CONSTRAINT "R09_comment_parent_fk" FOREIGN KEY ("parentCommentId", "tenantId") REFERENCES "PublicCommunityComment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PublicCommunityComment" ADD CONSTRAINT "R09_comment_creation_fk" FOREIGN KEY ("creationExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PublicCommunityComment" ADD CONSTRAINT "R09_comment_moderation_fk" FOREIGN KEY ("lastModerationExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PublicCommunityInteraction" ADD CONSTRAINT "R09_PublicCommunityInteraction_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "R09_brand_parent_uq" ON "PublicCommunityComment"("tenantId","parentCommentId") WHERE "sourceKind"='BRAND';
CREATE UNIQUE INDEX "R09_view_day_uq" ON "PublicCommunityInteraction"("tenantId","sourceGatewayId","publicationKey","visitorSubjectHash","viewDay") WHERE kind='view';
ALTER TABLE "PublicCommunityComment" ADD CONSTRAINT "R09_comment_contract_check" CHECK (
 "identityHash" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$' AND "contentHash" ~ '^[a-f0-9]{64}$'
 AND length(btrim("publicationKey"))>0 AND length(btrim("sourceGatewayId"))>0 AND revision>=0
 AND status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')
 AND "retentionUntil"="createdAt"+interval '365 days'
 AND (("sourceKind"='GUEST' AND "visitorSubjectHash" IS NOT NULL AND "visitorSubjectHash" ~ '^[a-f0-9]{64}$'
   AND "consentPolicyVersion" IS NOT NULL AND "consentAcceptedAt" IS NOT NULL AND "creationExecutionId" IS NULL
   AND (status='PENDING' OR "lastModerationExecutionId" IS NOT NULL))
  OR ("sourceKind"='BRAND' AND "visitorSubjectHash" IS NULL AND "creationExecutionId" IS NOT NULL AND "parentCommentId" IS NOT NULL))
);
ALTER TABLE "PublicCommunityInteraction" ADD CONSTRAINT "R09_interaction_contract_check" CHECK (
 "contractVersion"=1 AND "identityHash" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$'
 AND "visitorSubjectHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$'
 AND length(btrim("publicationKey"))>0 AND length(btrim("sourceGatewayId"))>0
 AND "expectedVersion">=0 AND version="expectedVersion"+1
 AND ((kind='like' AND "desiredValue" IS NOT NULL AND "viewDay" IS NULL)
  OR (kind='view' AND "desiredValue" IS NULL AND "viewDay" IS NOT NULL AND "viewDay"=("receivedAt" AT TIME ZONE 'UTC')::date))
);
CREATE FUNCTION "R09_comment_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref text; parent "PublicCommunityComment"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'R09 source and moderation tombstones retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."authorEncrypted" IS NULL OR NEW."textEncrypted" IS NULL OR NEW."payloadErasedAt" IS NOT NULL OR NEW.revision<>0 THEN
   RAISE EXCEPTION 'R09 immutable initial content required' USING ERRCODE='23514';
  END IF;
  IF NEW."sourceKind"='GUEST' THEN
   IF NEW.status<>'PENDING' OR NEW."lastModerationExecutionId" IS NOT NULL THEN RAISE EXCEPTION 'R09 guest source cannot publish itself' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT * INTO parent FROM "PublicCommunityComment" WHERE id=NEW."parentCommentId" AND "tenantId"=NEW."tenantId" FOR SHARE;
   IF parent.id IS NULL OR parent.status<>'APPROVED' OR parent."publicationKey"<>NEW."publicationKey" OR NEW.status<>'APPROVED' THEN
    RAISE EXCEPTION 'R09 reply exact approved parent required' USING ERRCODE='23514';
   END IF;
   ref=NEW."creationExecutionId";
  END IF;
 ELSIF NEW."authorEncrypted" IS NULL AND NEW."textEncrypted" IS NULL AND OLD."payloadErasedAt" IS NULL AND NEW."payloadErasedAt" IS NOT NULL
  AND (to_jsonb(NEW)-ARRAY['authorEncrypted','textEncrypted','payloadErasedAt'])=(to_jsonb(OLD)-ARRAY['authorEncrypted','textEncrypted','payloadErasedAt'])
  AND "RC_payload_claim"(OLD."tenantId",'PublicCommunityComment',OLD.id,OLD."contentHash",OLD."retentionUntil",'purge_public_community_payloads','public-community-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY_REMOVE(ARRAY[OLD."creationExecutionId",OLD."lastModerationExecutionId"],NULL)) THEN RETURN NEW;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','revision','lastModerationExecutionId'])<>(to_jsonb(OLD)-ARRAY['status','revision','lastModerationExecutionId'])
   OR NEW.revision<>OLD.revision+1 OR NEW."lastModerationExecutionId" IS NULL OR NEW."lastModerationExecutionId" IS NOT DISTINCT FROM OLD."lastModerationExecutionId" THEN
   RAISE EXCEPTION 'R09 immutable content / explicit moderation CAS required' USING ERRCODE='23514';
  END IF;
  ref=NEW."lastModerationExecutionId";
 END IF;
 IF ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ActionExecution" e JOIN "Membership" m ON m."userId"=e."actorUserId" AND m."tenantId"=e."tenantId" JOIN "User" u ON u.id=m."userId"
  WHERE e.id=ref AND e."tenantId"=NEW."tenantId" AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
   AND e."actionClass"=CASE WHEN TG_OP='INSERT' THEN 'publish_public_community_reply' ELSE 'moderate_public_community_comment' END
   AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner','tenant_admin','administrator')) THEN
  RAISE EXCEPTION 'R09 exact human moderator execution required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "R09_comment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PublicCommunityComment" FOR EACH ROW EXECUTE FUNCTION "R09_comment_guard"();
CREATE CONSTRAINT TRIGGER "R09_reply_receipt" AFTER INSERT ON "PublicCommunityComment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('creationExecutionId');
CREATE CONSTRAINT TRIGGER "R09_moderation_receipt" AFTER UPDATE ON "PublicCommunityComment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('lastModerationExecutionId');
CREATE FUNCTION "R09_interaction_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'R09 immutable anonymous source fact' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('r09/'||NEW."tenantId"||'/'||NEW."sourceGatewayId"||'/'||NEW."publicationKey"||'/'||NEW."visitorSubjectHash"||'/'||NEW.kind,0));
 SELECT COALESCE(max(version),0) INTO previous FROM "PublicCommunityInteraction" WHERE "tenantId"=NEW."tenantId" AND "sourceGatewayId"=NEW."sourceGatewayId" AND "publicationKey"=NEW."publicationKey" AND "visitorSubjectHash"=NEW."visitorSubjectHash" AND kind=NEW.kind;
 IF NEW."expectedVersion"<>previous THEN RAISE EXCEPTION 'R09 stale source projection version' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "R09_interaction_guard" BEFORE INSERT OR UPDATE OR DELETE ON "PublicCommunityInteraction" FOR EACH ROW EXECUTE FUNCTION "R09_interaction_guard"();

COMMIT;
