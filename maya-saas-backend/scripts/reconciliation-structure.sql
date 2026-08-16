\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'

\o :out_prefix'_columns.txt'
SELECT c.table_name, c.column_name, c.data_type,
       coalesce(c.character_maximum_length::text,''), coalesce(c.numeric_precision::text,''),
       coalesce(c.datetime_precision::text,''), c.is_nullable,
       coalesce(c.column_default,''), coalesce(c.udt_name,'')
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_name=c.table_name AND t.table_schema=c.table_schema AND t.table_type='BASE TABLE'
WHERE c.table_schema=current_schema()
ORDER BY c.table_name, c.column_name;

\o :out_prefix'_constraints.txt'
SELECT conrelid::regclass::text, conname, contype::text, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace=current_schema()::regnamespace
ORDER BY conrelid::regclass::text, conname;

\o :out_prefix'_indexes.txt'
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname=current_schema() ORDER BY tablename, indexname;

\o :out_prefix'_enums.txt'
SELECT t.typname, e.enumlabel, e.enumsortorder::text
FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
JOIN pg_namespace n ON n.oid=t.typnamespace AND n.nspname=current_schema()
ORDER BY t.typname, e.enumsortorder;

\o :out_prefix'_sequences.txt'
SELECT sequence_name, data_type, start_value, increment
FROM information_schema.sequences WHERE sequence_schema=current_schema()
ORDER BY sequence_name;
\o
