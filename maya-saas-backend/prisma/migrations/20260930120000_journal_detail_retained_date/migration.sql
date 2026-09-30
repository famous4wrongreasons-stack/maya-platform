-- NS-1 Option A. Add only the fixed journal detail source to the erasable date scope.
-- The original REFINE branch is unchanged. No table/column or generic NAVIGATE authority.
ALTER TABLE "WidgetIntentRecord" DROP CONSTRAINT "WidgetIntentRecord_journal_date_scope_check";
ALTER TABLE "WidgetIntentRecord" ADD CONSTRAINT "WidgetIntentRecord_journal_date_scope_check" CHECK (
  "retainedLocalBusinessDate" IS NULL OR (
    "effect" = 'REFINE' AND
    "capabilitySpace" = 'C9' AND
    "capabilityKey" = 'operations.journal.read' AND
    "retainedLocalBusinessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND
    to_char(to_date("retainedLocalBusinessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "retainedLocalBusinessDate"
  ) OR (
    ("effect" = 'NAVIGATE' AND "widgetKind" = 'SCHEDULE'
     AND "capabilitySpace" IS NULL AND "capabilityKey" IS NULL
     AND "sourceCapabilitySpace" = 'C9' AND "sourceCapabilityKey" = 'operations.journal.read'
     AND "inputSchemaHash" IS NULL
     AND "targetJson" = '{"class":"detail","ref":"fs.calendar"}'::jsonb) IS TRUE
    AND "retainedLocalBusinessDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND to_char(to_date("retainedLocalBusinessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "retainedLocalBusinessDate"
  )
);
