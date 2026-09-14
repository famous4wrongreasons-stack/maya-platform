-- Owner-approved B7 V1. Additive only; no inferred Client habits or history.
ALTER TABLE "CustomerProfile" ADD COLUMN "encryptedClientPreferences" TEXT;

ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_client_habits_owner_check"
    CHECK ("encryptedClientPreferences" IS NULL OR "clientId" IS NOT NULL),
  ADD CONSTRAINT "CustomerProfile_client_habits_ciphertext_v1_check"
    CHECK ("encryptedClientPreferences" IS NULL OR (
      octet_length("encryptedClientPreferences") BETWEEN 41 AND 10963
      AND "encryptedClientPreferences" ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
    ));
-- Plaintext version/count/code-point/UTF-8 bounds are checked by the canonical
-- executor before encryption. PostgreSQL does not inspect encrypted content.
