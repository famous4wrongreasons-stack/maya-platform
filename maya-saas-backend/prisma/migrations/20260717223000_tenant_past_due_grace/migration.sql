-- Persist the billing grace window so access cannot be extended by repeated requests.
ALTER TABLE "Tenant"
ADD COLUMN "pastDueAt" TIMESTAMP(3),
ADD COLUMN "graceEndsAt" TIMESTAMP(3);

-- Existing past-due tenants use the end of their paid/trial access window.
UPDATE "Tenant"
SET
  "pastDueAt" = LEAST(COALESCE("currentPeriodEnd", "trialEndsAt", "updatedAt"), "updatedAt"),
  "graceEndsAt" = LEAST(COALESCE("currentPeriodEnd", "trialEndsAt", "updatedAt"), "updatedAt") + INTERVAL '3 days'
WHERE "status" = 'past_due';

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_past_due_window_check"
CHECK (
  ("pastDueAt" IS NULL AND "graceEndsAt" IS NULL)
  OR
  ("pastDueAt" IS NOT NULL AND "graceEndsAt" IS NOT NULL AND "graceEndsAt" > "pastDueAt")
);

CREATE INDEX "Tenant_status_graceEndsAt_idx"
ON "Tenant"("status", "graceEndsAt");
