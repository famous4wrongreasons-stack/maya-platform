-- Add a tenant-qualified payment key for fail-closed billing mutations.
CREATE UNIQUE INDEX "BillingPayment_id_tenantId_key"
ON "BillingPayment"("id", "tenantId");
