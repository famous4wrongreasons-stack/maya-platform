-- Восстановление структуры маркетингового сегмента.
--
-- Три миграции были применены к проду 14.08 и утеряны: файлов нет ни в
-- одной ветке, ни в оборванных объектах git, ни на сервере. Побайтовое
-- восстановление невозможно, поэтому имена НЕ переиспользуются — иначе
-- контрольная сумма разойдётся и каждый выкат начнёт падать.
--
-- 🔴 Ни одного IF NOT EXISTS. Для каждого объекта три исхода:
--   нет           → создать (чистая база);
--   есть и совпал → ноль операций (прод);
--   есть и ОТЛИЧАЕТСЯ → RAISE EXCEPTION, выкат откатывается.
-- Молча пройти мимо расхождения нельзя: ради этого цикл и затеян.

-- ═══ таблица MarketingAudienceRecipient ═══
DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public."MarketingAudienceRecipient"') IS NULL THEN
    CREATE TABLE "MarketingAudienceRecipient" (
      "audienceId" TEXT NOT NULL,
      "consentRecordedAt" TIMESTAMP(3),
      "consentSource" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "eligibilityStatus" TEXT NOT NULL,
      "exclusionReason" TEXT,
      "externalClientId" TEXT NOT NULL,
      "id" TEXT NOT NULL,
      "internalUserId" TEXT,
      "metricsJson" JSONB,
      "tenantId" TEXT NOT NULL
    );
  ELSE
    -- Таблица уже есть: сверяем состав колонок, а не принимаем на веру.
    SELECT string_agg(expected.name, ', ') INTO missing
      FROM (VALUES
        ('audienceId'),
        ('consentRecordedAt'),
        ('consentSource'),
        ('createdAt'),
        ('eligibilityStatus'),
        ('exclusionReason'),
        ('externalClientId'),
        ('id'),
        ('internalUserId'),
        ('metricsJson'),
        ('tenantId')
      ) AS expected(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'MarketingAudienceRecipient'
          AND c.column_name = expected.name);
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'reconciliation: таблица MarketingAudienceRecipient существует, но в ней нет колонок: %', missing;
    END IF;
  END IF;
END $$;

-- ═══ таблица MarketingCampaignRecipient ═══
DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public."MarketingCampaignRecipient"') IS NULL THEN
    CREATE TABLE "MarketingCampaignRecipient" (
      "acceptedAt" TIMESTAMP(3),
      "attemptCount" INTEGER NOT NULL DEFAULT 0,
      "campaignId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deliveredAt" TIMESTAMP(3),
      "externalClientId" TEXT NOT NULL,
      "failedAt" TIMESTAMP(3),
      "id" TEXT NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "internalUserId" TEXT,
      "lastErrorCode" TEXT,
      "nextAttemptAt" TIMESTAMP(3),
      "providerMessageId" TEXT,
      "providerStatus" TEXT,
      "status" TEXT NOT NULL DEFAULT 'QUEUED'::text,
      "tenantId" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  ELSE
    -- Таблица уже есть: сверяем состав колонок, а не принимаем на веру.
    SELECT string_agg(expected.name, ', ') INTO missing
      FROM (VALUES
        ('acceptedAt'),
        ('attemptCount'),
        ('campaignId'),
        ('createdAt'),
        ('deliveredAt'),
        ('externalClientId'),
        ('failedAt'),
        ('id'),
        ('idempotencyKey'),
        ('internalUserId'),
        ('lastErrorCode'),
        ('nextAttemptAt'),
        ('providerMessageId'),
        ('providerStatus'),
        ('status'),
        ('tenantId'),
        ('updatedAt')
      ) AS expected(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'MarketingCampaignRecipient'
          AND c.column_name = expected.name);
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'reconciliation: таблица MarketingCampaignRecipient существует, но в ней нет колонок: %', missing;
    END IF;
  END IF;
END $$;

-- ═══ таблица MarketingConsentEvidence ═══
DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public."MarketingConsentEvidence"') IS NULL THEN
    CREATE TABLE "MarketingConsentEvidence" (
      "channel" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "evidenceRef" TEXT,
      "expiresAt" TIMESTAMP(3),
      "externalClientId" TEXT NOT NULL,
      "grantedAt" TIMESTAMP(3),
      "id" TEXT NOT NULL,
      "revokedAt" TIMESTAMP(3),
      "source" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  ELSE
    -- Таблица уже есть: сверяем состав колонок, а не принимаем на веру.
    SELECT string_agg(expected.name, ', ') INTO missing
      FROM (VALUES
        ('channel'),
        ('createdAt'),
        ('evidenceRef'),
        ('expiresAt'),
        ('externalClientId'),
        ('grantedAt'),
        ('id'),
        ('revokedAt'),
        ('source'),
        ('status'),
        ('tenantId'),
        ('updatedAt')
      ) AS expected(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'MarketingConsentEvidence'
          AND c.column_name = expected.name);
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'reconciliation: таблица MarketingConsentEvidence существует, но в ней нет колонок: %', missing;
    END IF;
  END IF;
END $$;

-- ═══ таблица MarketingDeliveryAttempt ═══
DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public."MarketingDeliveryAttempt"') IS NULL THEN
    CREATE TABLE "MarketingDeliveryAttempt" (
      "attemptNumber" INTEGER NOT NULL,
      "batchKey" TEXT NOT NULL,
      "campaignId" TEXT NOT NULL,
      "completedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "errorCode" TEXT,
      "httpStatus" INTEGER,
      "id" TEXT NOT NULL,
      "providerResponseCode" TEXT,
      "recipientId" TEXT,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "status" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL
    );
  ELSE
    -- Таблица уже есть: сверяем состав колонок, а не принимаем на веру.
    SELECT string_agg(expected.name, ', ') INTO missing
      FROM (VALUES
        ('attemptNumber'),
        ('batchKey'),
        ('campaignId'),
        ('completedAt'),
        ('createdAt'),
        ('errorCode'),
        ('httpStatus'),
        ('id'),
        ('providerResponseCode'),
        ('recipientId'),
        ('startedAt'),
        ('status'),
        ('tenantId')
      ) AS expected(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'MarketingDeliveryAttempt'
          AND c.column_name = expected.name);
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'reconciliation: таблица MarketingDeliveryAttempt существует, но в ней нет колонок: %', missing;
    END IF;
  END IF;
END $$;

-- ═══ таблица MarketingPolicy ═══
DO $$
DECLARE missing text;
BEGIN
  IF to_regclass('public."MarketingPolicy"') IS NULL THEN
    CREATE TABLE "MarketingPolicy" (
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "dailyRecipientLimit" INTEGER NOT NULL DEFAULT 500,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "maxCampaignCostKopecks" INTEGER,
      "maxCampaignRecipients" INTEGER NOT NULL DEFAULT 500,
      "monthlyRecipientLimit" INTEGER NOT NULL DEFAULT 5000,
      "provider" TEXT NOT NULL DEFAULT 'yclients_sms'::text,
      "tenantId" TEXT NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  ELSE
    -- Таблица уже есть: сверяем состав колонок, а не принимаем на веру.
    SELECT string_agg(expected.name, ', ') INTO missing
      FROM (VALUES
        ('createdAt'),
        ('dailyRecipientLimit'),
        ('enabled'),
        ('maxCampaignCostKopecks'),
        ('maxCampaignRecipients'),
        ('monthlyRecipientLimit'),
        ('provider'),
        ('tenantId'),
        ('updatedAt')
      ) AS expected(name)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'MarketingPolicy'
          AND c.column_name = expected.name);
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'reconciliation: таблица MarketingPolicy существует, но в ней нет колонок: %', missing;
    END IF;
  END IF;
END $$;

-- ═══ колонки MarketingAudience (4) ═══
DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingAudience' AND column_name = 'exclusionReasonsJson';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudience" ADD COLUMN "exclusionReasonsJson" JSONB NOT NULL DEFAULT '{}'::jsonb;
  ELSIF actual.data_type <> 'jsonb'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''{}''::jsonb' THEN
    RAISE EXCEPTION 'reconciliation: MarketingAudience.exclusionReasonsJson отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingAudience' AND column_name = 'provider';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudience" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'yclients_sms'::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''yclients_sms''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingAudience.provider отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingAudience' AND column_name = 'snapshotHash';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudience" ADD COLUMN "snapshotHash" TEXT NOT NULL DEFAULT ''::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingAudience.snapshotHash отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingAudience' AND column_name = 'status';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudience" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'AUDIENCE_CALCULATED'::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''AUDIENCE_CALCULATED''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingAudience.status отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

-- ═══ колонки MarketingCampaign (22) ═══
DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'acceptedCount';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "acceptedCount" INTEGER NOT NULL DEFAULT 0;
  ELSIF actual.data_type <> 'integer'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '0' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.acceptedCount отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'audienceSnapshotHash';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "audienceSnapshotHash" TEXT NOT NULL DEFAULT ''::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.audienceSnapshotHash отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'cancelledAt';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "cancelledAt" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.cancelledAt отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'completedAt';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "completedAt" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.completedAt отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'confirmationHash';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "confirmationHash" TEXT;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.confirmationHash отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'confirmedAt';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "confirmedAt" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.confirmedAt отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'confirmedByUserId';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "confirmedByUserId" TEXT;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.confirmedByUserId отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'costCurrency';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "costCurrency" TEXT NOT NULL DEFAULT 'RUB'::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''RUB''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.costCurrency отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'costEstimateKopecks';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "costEstimateKopecks" INTEGER;
  ELSIF actual.data_type <> 'integer'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.costEstimateKopecks отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'costEstimateStatus';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "costEstimateStatus" TEXT NOT NULL DEFAULT 'unavailable'::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''unavailable''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.costEstimateStatus отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'failedCount';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0;
  ELSIF actual.data_type <> 'integer'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '0' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.failedCount отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'lastErrorCode';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "lastErrorCode" TEXT;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.lastErrorCode отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'leaseExpiresAt';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.leaseExpiresAt отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'leaseOwner';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "leaseOwner" TEXT;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.leaseOwner отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'messageSnapshotHash';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "messageSnapshotHash" TEXT NOT NULL DEFAULT ''::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.messageSnapshotHash отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'provider';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'yclients_sms'::text;
  ELSIF actual.data_type <> 'text'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '''yclients_sms''::text' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.provider отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'queuedAt';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "queuedAt" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.queuedAt отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'retryCount';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
  ELSIF actual.data_type <> 'integer'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '0' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.retryCount отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'scheduledFor';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "scheduledFor" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.scheduledFor отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'skippedCount';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0;
  ELSIF actual.data_type <> 'integer'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '0' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.skippedCount отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'startedAt';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "startedAt" TIMESTAMP(3);
  ELSIF actual.data_type <> 'timestamp without time zone'
      OR actual.is_nullable <> 'YES'
      OR actual.column_default <> '' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.startedAt отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

DO $$
DECLARE actual RECORD;
BEGIN
  SELECT data_type, is_nullable, coalesce(column_default, '') AS column_default
    INTO actual FROM information_schema.columns
   WHERE table_schema = current_schema()
     AND table_name = 'MarketingCampaign' AND column_name = 'unknownCount';
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaign" ADD COLUMN "unknownCount" INTEGER NOT NULL DEFAULT 0;
  ELSIF actual.data_type <> 'integer'
      OR actual.is_nullable <> 'NO'
      OR actual.column_default <> '0' THEN
    RAISE EXCEPTION 'reconciliation: MarketingCampaign.unknownCount отличается — тип=%, nullable=%, default=%',
      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');
  END IF;
END $$;

-- ═══ ключи и проверки (5) ═══
DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingAudienceRecipient_pkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudienceRecipient" ADD CONSTRAINT "MarketingAudienceRecipient_pkey" PRIMARY KEY (id);
  ELSIF actual <> 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingAudienceRecipient_pkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingCampaignRecipient_pkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_pkey" PRIMARY KEY (id);
  ELSIF actual <> 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingCampaignRecipient_pkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingConsentEvidence_pkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingConsentEvidence" ADD CONSTRAINT "MarketingConsentEvidence_pkey" PRIMARY KEY (id);
  ELSIF actual <> 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingConsentEvidence_pkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingDeliveryAttempt_pkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingDeliveryAttempt" ADD CONSTRAINT "MarketingDeliveryAttempt_pkey" PRIMARY KEY (id);
  ELSIF actual <> 'PRIMARY KEY (id)' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingDeliveryAttempt_pkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingPolicy_pkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingPolicy" ADD CONSTRAINT "MarketingPolicy_pkey" PRIMARY KEY ("tenantId");
  ELSIF actual <> 'PRIMARY KEY ("tenantId")' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingPolicy_pkey отличается — %', actual;
  END IF;
END $$;

-- ═══ индексы (14) ═══
DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingAudience_id_tenantId_key';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingAudience_id_tenantId_key" ON public."MarketingAudience" USING btree (id, "tenantId");
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingAudience_id_tenantId_key" ON public."MarketingAudience" USING btree (id, "tenantId")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingAudience_id_tenantId_key отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingAudienceRecipient_tenantId_audienceId_eligibilityStatu';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingAudienceRecipient_tenantId_audienceId_eligibilityStatu" ON public."MarketingAudienceRecipient" USING btree ("tenantId", "audienceId", "eligibilityStatus");
  ELSIF actual <> 'CREATE INDEX "MarketingAudienceRecipient_tenantId_audienceId_eligibilityStatu" ON public."MarketingAudienceRecipient" USING btree ("tenantId", "audienceId", "eligibilityStatus")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingAudienceRecipient_tenantId_audienceId_eligibilityStatu отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingAudienceRecipient_tenantId_audienceId_externalClientId';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingAudienceRecipient_tenantId_audienceId_externalClientId" ON public."MarketingAudienceRecipient" USING btree ("tenantId", "audienceId", "externalClientId");
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingAudienceRecipient_tenantId_audienceId_externalClientId" ON public."MarketingAudienceRecipient" USING btree ("tenantId", "audienceId", "externalClientId")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingAudienceRecipient_tenantId_audienceId_externalClientId отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaign_id_tenantId_key';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingCampaign_id_tenantId_key" ON public."MarketingCampaign" USING btree (id, "tenantId");
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingCampaign_id_tenantId_key" ON public."MarketingCampaign" USING btree (id, "tenantId")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaign_id_tenantId_key отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaign_status_leaseExpiresAt_queuedAt_idx';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingCampaign_status_leaseExpiresAt_queuedAt_idx" ON public."MarketingCampaign" USING btree (status, "leaseExpiresAt", "queuedAt");
  ELSIF actual <> 'CREATE INDEX "MarketingCampaign_status_leaseExpiresAt_queuedAt_idx" ON public."MarketingCampaign" USING btree (status, "leaseExpiresAt", "queuedAt")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaign_status_leaseExpiresAt_queuedAt_idx отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaign_status_scheduledFor_leaseExpiresAt_idx';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingCampaign_status_scheduledFor_leaseExpiresAt_idx" ON public."MarketingCampaign" USING btree (status, "scheduledFor", "leaseExpiresAt");
  ELSIF actual <> 'CREATE INDEX "MarketingCampaign_status_scheduledFor_leaseExpiresAt_idx" ON public."MarketingCampaign" USING btree (status, "scheduledFor", "leaseExpiresAt")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaign_status_scheduledFor_leaseExpiresAt_idx отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaignRecipient_id_tenantId_key';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingCampaignRecipient_id_tenantId_key" ON public."MarketingCampaignRecipient" USING btree (id, "tenantId");
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingCampaignRecipient_id_tenantId_key" ON public."MarketingCampaignRecipient" USING btree (id, "tenantId")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaignRecipient_id_tenantId_key отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaignRecipient_tenantId_campaignId_externalClientId';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingCampaignRecipient_tenantId_campaignId_externalClientId" ON public."MarketingCampaignRecipient" USING btree ("tenantId", "campaignId", "externalClientId");
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingCampaignRecipient_tenantId_campaignId_externalClientId" ON public."MarketingCampaignRecipient" USING btree ("tenantId", "campaignId", "externalClientId")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaignRecipient_tenantId_campaignId_externalClientId отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaignRecipient_tenantId_campaignId_status_nextAttem';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingCampaignRecipient_tenantId_campaignId_status_nextAttem" ON public."MarketingCampaignRecipient" USING btree ("tenantId", "campaignId", status, "nextAttemptAt");
  ELSIF actual <> 'CREATE INDEX "MarketingCampaignRecipient_tenantId_campaignId_status_nextAttem" ON public."MarketingCampaignRecipient" USING btree ("tenantId", "campaignId", status, "nextAttemptAt")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaignRecipient_tenantId_campaignId_status_nextAttem отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingCampaignRecipient_tenantId_idempotencyKey_key';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingCampaignRecipient_tenantId_idempotencyKey_key" ON public."MarketingCampaignRecipient" USING btree ("tenantId", "idempotencyKey");
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingCampaignRecipient_tenantId_idempotencyKey_key" ON public."MarketingCampaignRecipient" USING btree ("tenantId", "idempotencyKey")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingCampaignRecipient_tenantId_idempotencyKey_key отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingConsentEvidence_tenantId_channel_status_idx';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingConsentEvidence_tenantId_channel_status_idx" ON public."MarketingConsentEvidence" USING btree ("tenantId", channel, status);
  ELSIF actual <> 'CREATE INDEX "MarketingConsentEvidence_tenantId_channel_status_idx" ON public."MarketingConsentEvidence" USING btree ("tenantId", channel, status)' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingConsentEvidence_tenantId_channel_status_idx отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingConsentEvidence_tenantId_externalClientId_channel_key';
  IF NOT FOUND THEN
    CREATE UNIQUE INDEX "MarketingConsentEvidence_tenantId_externalClientId_channel_key" ON public."MarketingConsentEvidence" USING btree ("tenantId", "externalClientId", channel);
  ELSIF actual <> 'CREATE UNIQUE INDEX "MarketingConsentEvidence_tenantId_externalClientId_channel_key" ON public."MarketingConsentEvidence" USING btree ("tenantId", "externalClientId", channel)' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingConsentEvidence_tenantId_externalClientId_channel_key отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingDeliveryAttempt_tenantId_campaignId_createdAt_idx';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingDeliveryAttempt_tenantId_campaignId_createdAt_idx" ON public."MarketingDeliveryAttempt" USING btree ("tenantId", "campaignId", "createdAt");
  ELSIF actual <> 'CREATE INDEX "MarketingDeliveryAttempt_tenantId_campaignId_createdAt_idx" ON public."MarketingDeliveryAttempt" USING btree ("tenantId", "campaignId", "createdAt")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingDeliveryAttempt_tenantId_campaignId_createdAt_idx отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT indexdef INTO actual FROM pg_indexes
   WHERE schemaname = current_schema() AND indexname = 'MarketingDeliveryAttempt_tenantId_recipientId_attemptNumber_idx';
  IF NOT FOUND THEN
    CREATE INDEX "MarketingDeliveryAttempt_tenantId_recipientId_attemptNumber_idx" ON public."MarketingDeliveryAttempt" USING btree ("tenantId", "recipientId", "attemptNumber");
  ELSIF actual <> 'CREATE INDEX "MarketingDeliveryAttempt_tenantId_recipientId_attemptNumber_idx" ON public."MarketingDeliveryAttempt" USING btree ("tenantId", "recipientId", "attemptNumber")' THEN
    RAISE EXCEPTION 'reconciliation: индекс MarketingDeliveryAttempt_tenantId_recipientId_attemptNumber_idx отличается — %', actual;
  END IF;
END $$;

-- ═══ внешние ключи (9) ═══
DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingAudienceRecipient_audienceId_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudienceRecipient" ADD CONSTRAINT "MarketingAudienceRecipient_audienceId_tenantId_fkey" FOREIGN KEY ("audienceId", "tenantId") REFERENCES "MarketingAudience"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("audienceId", "tenantId") REFERENCES "MarketingAudience"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingAudienceRecipient_audienceId_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingAudienceRecipient_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingAudienceRecipient" ADD CONSTRAINT "MarketingAudienceRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingAudienceRecipient_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingCampaignRecipient_campaignId_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "MarketingCampaign"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("campaignId", "tenantId") REFERENCES "MarketingCampaign"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingCampaignRecipient_campaignId_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingCampaignRecipient_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingCampaignRecipient" ADD CONSTRAINT "MarketingCampaignRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingCampaignRecipient_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingConsentEvidence_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingConsentEvidence" ADD CONSTRAINT "MarketingConsentEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingConsentEvidence_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingDeliveryAttempt_campaignId_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingDeliveryAttempt" ADD CONSTRAINT "MarketingDeliveryAttempt_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "MarketingCampaign"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("campaignId", "tenantId") REFERENCES "MarketingCampaign"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingDeliveryAttempt_campaignId_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingDeliveryAttempt_recipientId_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingDeliveryAttempt" ADD CONSTRAINT "MarketingDeliveryAttempt_recipientId_tenantId_fkey" FOREIGN KEY ("recipientId", "tenantId") REFERENCES "MarketingCampaignRecipient"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("recipientId", "tenantId") REFERENCES "MarketingCampaignRecipient"(id, "tenantId") ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingDeliveryAttempt_recipientId_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingDeliveryAttempt_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingDeliveryAttempt" ADD CONSTRAINT "MarketingDeliveryAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingDeliveryAttempt_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

DO $$
DECLARE actual text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
   WHERE conname = 'MarketingPolicy_tenantId_fkey' AND connamespace = current_schema()::regnamespace;
  IF NOT FOUND THEN
    ALTER TABLE "MarketingPolicy" ADD CONSTRAINT "MarketingPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  ELSIF actual <> 'FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'reconciliation: ограничение MarketingPolicy_tenantId_fkey отличается — %', actual;
  END IF;
END $$;

