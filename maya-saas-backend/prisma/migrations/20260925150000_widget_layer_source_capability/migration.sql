-- I-MIG3 / Contract V1.2: retain the server-owned source capability as sealed audit evidence
-- only for NAVIGATE(detail/w).  This evidence is never authority; Gates 6/13 re-evaluate current
-- authority before any use.  The migration is additive and deliberately has no data backfill.

ALTER TABLE "WidgetIntentRecord"
  ADD COLUMN "sourceCapabilitySpace" TEXT,
  ADD COLUMN "sourceCapabilityKey" TEXT;

ALTER TABLE "WidgetIntentRecord"
  ADD CONSTRAINT "WidgetIntentRecord_sourceCapability_pair_check" CHECK (
    ("sourceCapabilitySpace" IS NULL) = ("sourceCapabilityKey" IS NULL)
  ),
  ADD CONSTRAINT "WidgetIntentRecord_sourceCapability_value_check" CHECK (
    "sourceCapabilitySpace" IS NULL OR (
      "sourceCapabilitySpace" = 'C9' AND
      char_length("sourceCapabilityKey") BETWEEN 1 AND 128
    )
  ),
  ADD CONSTRAINT "WidgetIntentRecord_sourceCapability_scope_check" CHECK (
    ("sourceCapabilitySpace" IS NOT NULL) = COALESCE(
      "effect" = 'NAVIGATE' AND ("targetJson" ->> 'class') IN ('detail', 'w'),
      FALSE
    )
  );
