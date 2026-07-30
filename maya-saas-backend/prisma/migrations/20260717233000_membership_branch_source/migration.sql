-- Move tenant-specific branch assignment into Membership. Legacy User.branchId
-- remains as a compatibility projection until all composite user FKs migrate.
ALTER TABLE "Membership"
ADD COLUMN "branchId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Membership" AS membership
    JOIN "User" AS tenant_user
      ON tenant_user."id" = membership."userId"
    JOIN "Branch" AS branch
      ON branch."id" = tenant_user."branchId"
    WHERE tenant_user."branchId" IS NOT NULL
      AND tenant_user."tenantId" = membership."tenantId"
      AND branch."tenantId" <> membership."tenantId"
  ) THEN
    RAISE EXCEPTION 'User branch assignment crosses tenant boundary';
  END IF;
END $$;

UPDATE "Membership" AS membership
SET "branchId" = tenant_user."branchId"
FROM "User" AS tenant_user
JOIN "Branch" AS branch
  ON branch."id" = tenant_user."branchId"
WHERE tenant_user."id" = membership."userId"
  AND tenant_user."tenantId" = membership."tenantId"
  AND branch."tenantId" = membership."tenantId";

CREATE INDEX "Membership_tenantId_branchId_idx"
ON "Membership"("tenantId", "branchId");

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_branchId_tenantId_fkey"
FOREIGN KEY ("branchId", "tenantId")
REFERENCES "Branch"("id", "tenantId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
