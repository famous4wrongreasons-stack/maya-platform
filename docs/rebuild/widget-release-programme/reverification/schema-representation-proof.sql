\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'maya_widget_gate_proof_release_20260929'
     OR inet_server_addr() <> '127.0.0.1'::inet OR inet_server_port() <> 55729 THEN
    RAISE EXCEPTION 'Owned local proof database required';
  END IF;
END $$;
-- Copy CHECK/NOT NULL constraints only. No persistent schema or identity rows change.
CREATE TEMP TABLE sb1_challenge_shape (LIKE public."ClientLinkChallenge" INCLUDING CONSTRAINTS) ON COMMIT DROP;
DO $$
DECLARE
  evidence jsonb := jsonb_build_object(
    'contract','a18.client-link-challenge.issue.v1','resolver','sb1.design-only',
    'resolutionEvidenceRef','synthetic:crm-link','resolutionEvidenceHash',repeat('a',64),
    'issuerAuthorityHash',repeat('b',64),'tenantId','synthetic-tenant',
    'clientId','synthetic-client','issuedAt','2026-09-29T00:00:00.000Z','policyVersion',1);
  proposal jsonb := jsonb_build_object(
    'mayaUserId','synthetic-user','mayaSubjectHash',repeat('c',64),
    'verificationChannel',jsonb_build_object('kind','sms','crmLinkId','synthetic-crm-link','addressHash',repeat('d',64)),
    'predecessorLinkId','synthetic-revoked-link');
  key text; value jsonb; constraint_name text; refused boolean;
BEGIN
  INSERT INTO sb1_challenge_shape ("id","tenantId","clientId","tokenHash","tokenHashVersion","policyVersion",
    "issuedAt","expiresAt","issuanceEvidenceJson","issuanceEvidenceHash")
    VALUES ('shape-v1','synthetic-tenant','synthetic-client',repeat('e',64),1,1,
      '2026-09-29T00:00:00Z','2026-09-29T00:10:00Z',evidence,repeat('f',64));
  FOR key,value IN SELECT * FROM jsonb_each(proposal) LOOP
    refused := false;
    BEGIN
      INSERT INTO sb1_challenge_shape SELECT "id","tenantId","clientId","tokenHash","tokenHashVersion","policyVersion",
        "issuedAt","expiresAt",evidence || jsonb_build_object(key,value),"issuanceEvidenceHash",
        "consumedAt","consumedLinkId","consumedProvider","consumedSubjectHash"
        FROM sb1_challenge_shape WHERE "id"='shape-v1';
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
      IF constraint_name <> 'ClientLinkChallenge_evidence_check' THEN RAISE; END IF;
      refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'Unexpected extra-key admission: %', key; END IF;
    RAISE NOTICE 'PASS: current V1 refuses persistent correlation member %', key;
  END LOOP;
  refused := false;
  BEGIN
    INSERT INTO sb1_challenge_shape SELECT "id","tenantId","clientId","tokenHash","tokenHashVersion",2,
      "issuedAt","expiresAt",evidence || proposal || jsonb_build_object('contract','a18.client-link-challenge.issue.v2','policyVersion',2),
      "issuanceEvidenceHash","consumedAt","consumedLinkId","consumedProvider","consumedSubjectHash"
      FROM sb1_challenge_shape WHERE "id"='shape-v1';
  EXCEPTION WHEN check_violation THEN refused := true;
  END;
  IF NOT refused THEN RAISE EXCEPTION 'Unexpected V2 admission'; END IF;
  IF (SELECT count(*) FROM sb1_challenge_shape) <> 1 THEN RAISE EXCEPTION 'Unexpected shape writes'; END IF;
  IF pg_get_functiondef('public.check_client_link_challenge_outcome_v1()'::regprocedure)
      NOT LIKE '%l."supersedesLinkId" IS NULL%' THEN
    RAISE EXCEPTION 'Initial-only outcome guard changed';
  END IF;
END $$;
SELECT jsonb_build_object('contract','maya.sb1.persistence-design-proof/1',
  'initial_v1_shape','PASS','additional_correlation_members_refused',4,
  'v2_shape_refused',true,'initial_outcome_guard_unchanged',true,
  'new_persistent_columns_required',0,'new_models_required',0,
  'permanent_schema_writes',0,'permanent_identity_writes',0);
ROLLBACK;
