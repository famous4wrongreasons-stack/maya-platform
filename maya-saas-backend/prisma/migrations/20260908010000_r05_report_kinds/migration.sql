BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- R05 Option A, approved at 0ad0eef2: extend only the finite report kinds.
-- B36 table, columns, immutable bindings, retention and historical rows stay intact.
ALTER TABLE "OwnerReportRun" DROP CONSTRAINT "B36_report_contract_check";
ALTER TABLE "OwnerReportRun" ADD CONSTRAINT "B36_report_contract_check" CHECK (
  "reportType" IN ('daily_report', 'morning_owner', 'morning_staff') AND "reportVersion" = 1
  AND "periodLocalDate" ~ '^\d{4}-\d{2}-\d{2}$'
  AND length(btrim("timezone")) > 0
  AND "intentHash" ~ '^[a-f0-9]{64}$'
  AND "expiresAt" > "admittedAt"
  AND "payloadRetentionUntil" = "admittedAt" + interval '7 days'
  AND "auditRetentionUntil" = "admittedAt" + interval '365 days'
);
COMMIT;
