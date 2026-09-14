BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
ALTER TABLE "ActionExecution" ADD COLUMN "teamMessageId" TEXT;

ALTER TABLE "ActionExecution" ADD COLUMN "teamMessageSlotKey" TEXT;

CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationKey" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "sendExecutionId" TEXT NOT NULL,
    "identityHash" CHAR(64) NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "payloadEncrypted" TEXT,
    "payloadHash" CHAR(64) NOT NULL,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawnByUserId" TEXT,
    "withdrawalExecutionId" TEXT,
    "withdrawalIdentityHash" CHAR(64),
    "withdrawalIntentHash" CHAR(64),
    "revision" INTEGER NOT NULL,
    "planHash" CHAR(64) NOT NULL,
    "planEncrypted" TEXT,
    "payloadErasedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "reserveExecutionId" TEXT NOT NULL,
    "finalizeExecutionId" TEXT,
    "uploadIdentityHash" CHAR(64) NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "objectStoreKey" TEXT NOT NULL,
    "contentSha256" CHAR(64) NOT NULL,
    "declaredSize" BIGINT NOT NULL,
    "actualSize" BIGINT,
    "mime" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filenameEncrypted" TEXT,
    "state" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "mediaExpiresAt" TIMESTAMPTZ(3),
    "storageReceiptHash" CHAR(64),
    "payloadErasedAt" TIMESTAMPTZ(3),
    "lastObservedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TeamAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "R12_message_feed_idx" ON "TeamMessage"("tenantId", "conversationKey", "createdAt");

CREATE INDEX "R12_message_retention_idx" ON "TeamMessage"("expiresAt");

CREATE UNIQUE INDEX "R12_TeamMessage_tenant_uq" ON "TeamMessage"("id", "tenantId");

CREATE UNIQUE INDEX "R12_message_identity_uq" ON "TeamMessage"("tenantId", "conversationKey", "senderUserId", "identityHash");

CREATE UNIQUE INDEX "R12_message_attachment_uq" ON "TeamMessage"("attachmentId", "tenantId", "senderUserId");

CREATE UNIQUE INDEX "R12_message_send_uq" ON "TeamMessage"("tenantId", "sendExecutionId");

CREATE UNIQUE INDEX "R12_message_withdraw_uq" ON "TeamMessage"("tenantId", "withdrawalExecutionId");

CREATE INDEX "R12_attachment_upload_idx" ON "TeamAttachment"("tenantId", "uploadExpiresAt");

CREATE INDEX "R12_attachment_retention_idx" ON "TeamAttachment"("mediaExpiresAt");

CREATE UNIQUE INDEX "R12_TeamAttachment_tenant_uq" ON "TeamAttachment"("id", "tenantId");

CREATE UNIQUE INDEX "R12_attachment_identity_uq" ON "TeamAttachment"("tenantId", "ownerUserId", "uploadIdentityHash");

CREATE UNIQUE INDEX "R12_attachment_object_uq" ON "TeamAttachment"("objectStoreKey");

CREATE UNIQUE INDEX "R12_attachment_owner_uq" ON "TeamAttachment"("id", "tenantId", "ownerUserId");

CREATE UNIQUE INDEX "R12_execution_slot_uq" ON "ActionExecution"("tenantId", "teamMessageId", "teamMessageSlotKey");

ALTER TABLE "ActionExecution" ADD CONSTRAINT "R12_execution_message_fk" FOREIGN KEY ("teamMessageId", "tenantId") REFERENCES "TeamMessage"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_TeamMessage_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_message_sender_fk" FOREIGN KEY ("senderUserId", "tenantId") REFERENCES "Membership"("userId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_message_withdrawer_fk" FOREIGN KEY ("withdrawnByUserId", "tenantId") REFERENCES "Membership"("userId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_message_send_fk" FOREIGN KEY ("sendExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_message_withdraw_fk" FOREIGN KEY ("withdrawalExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_message_attachment_fk" FOREIGN KEY ("attachmentId", "tenantId", "senderUserId") REFERENCES "TeamAttachment"("id", "tenantId", "ownerUserId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamAttachment" ADD CONSTRAINT "R12_TeamAttachment_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamAttachment" ADD CONSTRAINT "R12_attachment_member_fk" FOREIGN KEY ("ownerUserId", "tenantId") REFERENCES "Membership"("userId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamAttachment" ADD CONSTRAINT "R12_attachment_reserve_fk" FOREIGN KEY ("reserveExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamAttachment" ADD CONSTRAINT "R12_attachment_finalize_fk" FOREIGN KEY ("finalizeExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TeamMessage" ADD CONSTRAINT "R12_message_contract_check" CHECK (
 "conversationKey"='team/main' AND "identityHash" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$'
 AND "payloadHash" ~ '^[a-f0-9]{64}$' AND "planHash" ~ '^[a-f0-9]{64}$'
 AND "expiresAt"="createdAt"+interval '365 days'
 AND ((status='SENT' AND revision=0 AND num_nonnulls("withdrawnAt","withdrawnByUserId","withdrawalExecutionId","withdrawalIdentityHash","withdrawalIntentHash")=0)
  OR (status='WITHDRAWN' AND revision=1 AND num_nonnulls("withdrawnAt","withdrawnByUserId","withdrawalExecutionId","withdrawalIdentityHash","withdrawalIntentHash")=5
   AND "withdrawnByUserId"="senderUserId" AND "withdrawalIdentityHash" ~ '^[a-f0-9]{64}$' AND "withdrawalIntentHash" ~ '^[a-f0-9]{64}$'))
);
ALTER TABLE "TeamAttachment" ADD CONSTRAINT "R12_attachment_contract_check" CHECK (
 "uploadIdentityHash" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$' AND "contentSha256" ~ '^[a-f0-9]{64}$'
 AND length(btrim("objectStoreKey"))>0 AND "declaredSize" BETWEEN 1 AND 1073741824
 AND ("actualSize" IS NULL OR "actualSize"="declaredSize") AND revision>=0
 AND "uploadExpiresAt"="createdAt"+interval '1 hour' AND state IN ('RESERVED','SEALED','BOUND','ERASED')
 AND kind IN ('image','video','audio','file')
 AND (state NOT IN ('SEALED','BOUND') OR ("finalizeExecutionId" IS NOT NULL AND "actualSize" IS NOT NULL AND "storageReceiptHash" IS NOT NULL AND "storageReceiptHash" ~ '^[a-f0-9]{64}$'))
 AND (state<>'BOUND' OR "mediaExpiresAt" IS NOT NULL)
);
ALTER TABLE "ActionExecution" ADD CONSTRAINT "R12_execution_binding_check" CHECK (
 ("teamMessageId" IS NULL AND "teamMessageSlotKey" IS NULL AND capability<>'communication.team-message-notification.execute.v1') OR
 ("teamMessageId" IS NOT NULL AND "teamMessageSlotKey" IS NOT NULL AND "teamMessageSlotKey" ~ '^[a-f0-9]{64}$'
  AND capability='communication.team-message-notification.execute.v1' AND "actionClass"='deliver_report_briefing')
);
CREATE FUNCTION "R12_message_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exec text; class text;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'R12 message tombstone retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'SENT' OR NEW.revision<>0 OR NEW."payloadEncrypted" IS NULL OR NEW."planEncrypted" IS NULL OR NEW."payloadErasedAt" IS NOT NULL THEN RAISE EXCEPTION 'R12 initial immutable message plan required' USING ERRCODE='23514'; END IF;
  IF NEW."attachmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TeamAttachment" a JOIN "ActionExecution" e ON e.id=a."finalizeExecutionId" AND e."tenantId"=a."tenantId"
   WHERE a.id=NEW."attachmentId" AND a."tenantId"=NEW."tenantId" AND a."ownerUserId"=NEW."senderUserId" AND a.state='SEALED' AND e.state='SUCCEEDED' AND a."payloadErasedAt" IS NULL) THEN RAISE EXCEPTION 'R12 exact finalized owned attachment required' USING ERRCODE='23514'; END IF;
  exec=NEW."sendExecutionId";class='send_team_message';
 ELSIF NEW."payloadEncrypted" IS NULL AND NEW."planEncrypted" IS NULL AND OLD."payloadErasedAt" IS NULL AND NEW."payloadErasedAt" IS NOT NULL
  AND (to_jsonb(NEW)-ARRAY['payloadEncrypted','planEncrypted','payloadErasedAt'])=(to_jsonb(OLD)-ARRAY['payloadEncrypted','planEncrypted','payloadErasedAt'])
  AND "RC_payload_claim"(OLD."tenantId",'TeamMessage',OLD.id,OLD."planHash",LEAST(OLD."expiresAt",COALESCE(OLD."withdrawnAt",OLD."expiresAt")),'purge_team_message_payloads','team-lifecycle-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=OLD."tenantId" AND (id=OLD."sendExecutionId" OR id=OLD."withdrawalExecutionId" OR "teamMessageId"=OLD.id))) THEN RETURN NEW;
 ELSE
  IF OLD.status<>'SENT' OR NEW.status<>'WITHDRAWN' OR NEW.revision<>OLD.revision+1
   OR (to_jsonb(NEW)-ARRAY['status','revision','withdrawnAt','withdrawnByUserId','withdrawalExecutionId','withdrawalIdentityHash','withdrawalIntentHash'])<>(to_jsonb(OLD)-ARRAY['status','revision','withdrawnAt','withdrawnByUserId','withdrawalExecutionId','withdrawalIdentityHash','withdrawalIntentHash']) THEN RAISE EXCEPTION 'R12 explicit own withdrawal only' USING ERRCODE='23514'; END IF;
  exec=NEW."withdrawalExecutionId";class='withdraw_team_message';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "ActionExecution" e JOIN "Membership" m ON m."userId"=e."actorUserId" AND m."tenantId"=e."tenantId" JOIN "User" u ON u.id=m."userId"
  WHERE e.id=exec AND e."tenantId"=NEW."tenantId" AND e."actorUserId"=NEW."senderUserId" AND e."actionClass"=class
   AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW' AND m.status='active' AND u.status='active'
   AND m.role IN ('tenant_owner','business_owner','tenant_admin','administrator','staff')) THEN RAISE EXCEPTION 'R12 current admitted sender required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "R12_message_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TeamMessage" FOR EACH ROW EXECUTE FUNCTION "R12_message_guard"();
CREATE CONSTRAINT TRIGGER "R12_message_send_receipt" AFTER INSERT ON "TeamMessage" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('sendExecutionId');
CREATE CONSTRAINT TRIGGER "R12_message_withdraw_receipt" AFTER UPDATE ON "TeamMessage" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('withdrawalExecutionId');
CREATE FUNCTION "R12_attachment_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE exec text; msg "TeamMessage"%ROWTYPE; deadline timestamptz;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'R12 attachment tombstone retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'RESERVED' OR NEW.revision<>0 OR NEW."finalizeExecutionId" IS NOT NULL OR NEW."actualSize" IS NOT NULL OR NEW."storageReceiptHash" IS NOT NULL OR NEW."mediaExpiresAt" IS NOT NULL OR NEW."payloadErasedAt" IS NOT NULL OR NEW."filenameEncrypted" IS NULL THEN RAISE EXCEPTION 'R12 reservation before publish required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "ActionExecution" e JOIN "Membership" m ON m."userId"=e."actorUserId" AND m."tenantId"=e."tenantId" JOIN "User" u ON u.id=m."userId"
   WHERE e.id=NEW."reserveExecutionId" AND e."tenantId"=NEW."tenantId" AND e."actorUserId"=NEW."ownerUserId" AND e."actionClass"='reserve_team_attachment' AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
    AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner','tenant_admin','administrator','staff')) THEN RAISE EXCEPTION 'R12 canonical current reservation owner required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['finalizeExecutionId','actualSize','state','revision','mediaExpiresAt','storageReceiptHash','payloadErasedAt','lastObservedAt','filenameEncrypted'])<>(to_jsonb(OLD)-ARRAY['finalizeExecutionId','actualSize','state','revision','mediaExpiresAt','storageReceiptHash','payloadErasedAt','lastObservedAt','filenameEncrypted'])
  OR NEW.revision<>OLD.revision+1 OR (OLD."finalizeExecutionId" IS NOT NULL AND NEW."finalizeExecutionId" IS DISTINCT FROM OLD."finalizeExecutionId") THEN RAISE EXCEPTION 'R12 immutable upload intent / CAS required' USING ERRCODE='23514'; END IF;
 SELECT * INTO msg FROM "TeamMessage" WHERE "attachmentId"=OLD.id AND "tenantId"=OLD."tenantId";
 deadline=CASE WHEN msg.id IS NULL THEN OLD."uploadExpiresAt" ELSE LEAST(msg."createdAt"+interval '48 hours',COALESCE(msg."withdrawnAt",msg."createdAt"+interval '48 hours')) END;
 IF NEW.state='ERASED' AND OLD.state<>'ERASED' AND NEW."filenameEncrypted" IS NULL AND NEW."payloadErasedAt" IS NOT NULL
  AND NEW."actualSize" IS NOT DISTINCT FROM OLD."actualSize" AND NEW."mediaExpiresAt" IS NOT DISTINCT FROM OLD."mediaExpiresAt" AND NEW."storageReceiptHash" IS NOT DISTINCT FROM OLD."storageReceiptHash"
  AND "RC_payload_claim"(OLD."tenantId",'TeamAttachment',OLD.id,OLD."contentSha256",deadline,'purge_team_attachment_payloads','team-lifecycle-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=OLD."tenantId" AND (id=OLD."reserveExecutionId" OR id=OLD."finalizeExecutionId" OR id=msg."sendExecutionId" OR id=msg."withdrawalExecutionId" OR "teamMessageId"=msg.id))) THEN RETURN NEW; END IF;
 IF NEW."filenameEncrypted" IS DISTINCT FROM OLD."filenameEncrypted" OR NEW."payloadErasedAt" IS DISTINCT FROM OLD."payloadErasedAt" THEN RAISE EXCEPTION 'R12 exact attachment payload claim required' USING ERRCODE='23514'; END IF;
 IF OLD.state='SEALED' AND NEW.state='BOUND' AND msg.id IS NOT NULL AND NEW."mediaExpiresAt"=msg."createdAt"+interval '48 hours'
  AND NEW."actualSize" IS NOT DISTINCT FROM OLD."actualSize" AND NEW."storageReceiptHash" IS NOT DISTINCT FROM OLD."storageReceiptHash"
  AND EXISTS (SELECT 1 FROM "TeamMessage" WHERE id=msg.id AND xmin=pg_current_xact_id()::xid) THEN RETURN NEW; END IF;
 IF OLD.state='RESERVED' AND NEW.state IN ('RESERVED','SEALED') AND NEW."finalizeExecutionId" IS NOT NULL AND NEW."mediaExpiresAt" IS NULL
  AND EXISTS (SELECT 1 FROM "ActionExecution" e JOIN "Membership" m ON m."userId"=e."actorUserId" AND m."tenantId"=e."tenantId" JOIN "User" u ON u.id=m."userId"
   WHERE e.id=NEW."finalizeExecutionId" AND e."tenantId"=NEW."tenantId" AND e."actorUserId"=NEW."ownerUserId" AND e."actionClass"='finalize_team_attachment'
    AND e.state IN ('READY','EXECUTING','UNKNOWN','SUCCEEDED') AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
    AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner','tenant_admin','administrator','staff')) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'R12 canonical reservation/finalization/binding transition required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R12_attachment_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TeamAttachment" FOR EACH ROW EXECUTE FUNCTION "R12_attachment_guard"();
CREATE CONSTRAINT TRIGGER "R12_attachment_reserve_receipt" AFTER INSERT ON "TeamAttachment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('reserveExecutionId');
CREATE FUNCTION "R12_attachment_final_receipt"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.state IN ('SEALED','BOUND') AND NOT EXISTS (SELECT 1 FROM "ActionExecution" WHERE id=NEW."finalizeExecutionId" AND "tenantId"=NEW."tenantId" AND state='SUCCEEDED') THEN RAISE EXCEPTION 'R12 final object requires confirmed canonical receipt' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "R12_attachment_final_receipt" AFTER UPDATE ON "TeamAttachment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "R12_attachment_final_receipt"();
CREATE FUNCTION "R12_execution_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."teamMessageId" IS NOT NULL THEN RAISE EXCEPTION 'R12 delivery evidence retained' USING ERRCODE='23514'; END IF; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."teamMessageId" IS DISTINCT FROM OLD."teamMessageId" OR NEW."teamMessageSlotKey" IS DISTINCT FROM OLD."teamMessageSlotKey" THEN RAISE EXCEPTION 'R12 immutable delivery slot binding' USING ERRCODE='23514'; END IF; RETURN NEW;
 END IF;
 IF NEW."teamMessageId" IS NULL THEN RETURN NEW; END IF;
 IF NEW.state<>'READY' OR NEW."dryRun" OR NEW."policyDecision"<>'ALLOW' OR NOT EXISTS (
  SELECT 1 FROM "TeamMessage" m JOIN "ActionExecution" e ON e.id=m."sendExecutionId" AND e."tenantId"=m."tenantId"
  WHERE m.id=NEW."teamMessageId" AND m."tenantId"=NEW."tenantId" AND m."planEncrypted" IS NOT NULL AND m.status='SENT' AND e.state='SUCCEEDED') THEN RAISE EXCEPTION 'R12 confirmed message and complete slot admission required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "R12_execution_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecution" FOR EACH ROW EXECUTE FUNCTION "R12_execution_guard"();

CREATE FUNCTION "R12_message_attachment_receipt"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."attachmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TeamAttachment" a
  WHERE a.id=NEW."attachmentId" AND a."tenantId"=NEW."tenantId" AND a."ownerUserId"=NEW."senderUserId"
   AND a.state='BOUND' AND a."mediaExpiresAt"=NEW."createdAt"+interval '48 hours') THEN
  RAISE EXCEPTION 'R12 message and exact sealed attachment binding must commit together' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "R12_message_attachment_receipt" AFTER INSERT ON "TeamMessage" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "R12_message_attachment_receipt"();

COMMIT;
