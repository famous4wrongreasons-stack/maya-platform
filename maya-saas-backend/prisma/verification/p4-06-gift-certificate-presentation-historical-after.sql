\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT count(*) FROM "GiftCertificate" WHERE "id" = 'p406-historical-cert') <> 1 THEN
    RAISE EXCEPTION 'Historical GiftCertificate was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "GiftCertificate"
    WHERE "id" = 'p406-historical-cert'
      AND "presentationKeyVersion" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Historical GiftCertificate received a fake presentation key version';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "GiftCertificateRedemption"
    WHERE "id" = 'p406-historical-redemption'
      AND "certificateId" = 'p406-historical-cert'
      AND "tenantId" = 'p406-historical-tenant'
  ) THEN
    RAISE EXCEPTION 'Historical GiftCertificateRedemption was not preserved';
  END IF;

  IF (SELECT "nominalAmountKopecks" FROM "GiftCertificate" WHERE "id" = 'p406-historical-cert') <> 300000 THEN
    RAISE EXCEPTION 'Historical certificate value changed';
  END IF;
END;
$$;

SELECT 'P4-06 historical compatibility after migration: PASS' AS result;
