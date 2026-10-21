-- A22 remains the owner and encrypted revision store. No backfill or public defaults.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $preflight$
DECLARE existing text;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('maya.a22.customer-facts.v1',0)) THEN
  RAISE EXCEPTION 'customer_facts_migration_lock_unavailable';
 END IF;
 SELECT pg_get_constraintdef(oid) INTO existing FROM pg_constraint
 WHERE conrelid='"TenantBusinessConfigurationRevision"'::regclass
 AND conname='R11_config_contract_check';
 IF existing IS DISTINCT FROM $expected$CHECK (((namespace = ANY (ARRAY['business_rules'::text, 'client_capabilities'::text, 'staff_ai_provider'::text, 'c8_valuation'::text, 'c9_orchestration'::text])) AND ("contractVersion" = 1) AND (revision > 0) AND ("contentHash" ~ '^[a-f0-9]{64}$'::text) AND (((revision = 1) AND ("previousRevisionId" IS NULL)) OR ((revision > 1) AND ("previousRevisionId" IS NOT NULL)))))$expected$ THEN
  RAISE EXCEPTION 'customer_facts_unexpected_a22_constraint';
 END IF;
END $preflight$;
ALTER TABLE "TenantBusinessConfigurationRevision" DROP CONSTRAINT "R11_config_contract_check";
ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_contract_check" CHECK (
 "namespace" IN ('business_rules','client_capabilities','staff_ai_provider','c8_valuation','c9_orchestration','customer_facts') AND "contractVersion"=1 AND "revision">0
 AND "contentHash" ~ '^[a-f0-9]{64}$' AND (("revision"=1 AND "previousRevisionId" IS NULL) OR ("revision">1 AND "previousRevisionId" IS NOT NULL))
);
COMMIT;
