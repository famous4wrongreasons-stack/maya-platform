import re
from collections import defaultdict

def load(p):
    return [l.rstrip('\n').split('\t') for l in open(p, encoding='utf-8') if l.strip()]

TYPE = {
    'text': 'TEXT',
    'integer': 'INTEGER',
    'jsonb': 'JSONB',
    'boolean': 'BOOLEAN',
    'timestamp without time zone': 'TIMESTAMP(3)',
}

cols_prod = load('PRODS_columns.txt')
diff_cols = load('DIFF_columns_prod_only.txt')
diff_cons = load('DIFF_constraints_prod_only.txt')
diff_idx  = load('DIFF_indexes_prod_only.txt')
# 🔴 pg_indexes включает индексы, которыми ВЛАДЕЮТ ограничения (первичные ключи).
# Создавать их отдельно нельзя: ADD CONSTRAINT ... PRIMARY KEY потом упадёт на
# конфликте имён. Оставляем только самостоятельные индексы.
_cons_names = {r[1] for r in load('PRODS_constraints.txt')}
diff_idx = [r for r in diff_idx if r[1] not in _cons_names]
repo_tables = {r[0] for r in load('REPO_columns.txt')}

by_table = defaultdict(list)
for r in diff_cols:
    by_table[r[0]].append(r)

missing_tables = sorted(t for t in by_table if t not in repo_tables)
altered_tables = sorted(t for t in by_table if t in repo_tables)

def ddl_type(r):
    t = TYPE.get(r[2])
    if not t:
        raise SystemExit('неизвестный тип: ' + r[2])
    return t

def q(s):
    return s.replace("'", "''")

out = []
W = out.append

W("-- Восстановление структуры маркетингового сегмента.")
W("--")
W("-- Три миграции были применены к проду 14.08 и утеряны: файлов нет ни в")
W("-- одной ветке, ни в оборванных объектах git, ни на сервере. Побайтовое")
W("-- восстановление невозможно, поэтому имена НЕ переиспользуются — иначе")
W("-- контрольная сумма разойдётся и каждый выкат начнёт падать.")
W("--")
W("-- 🔴 Ни одного IF NOT EXISTS. Для каждого объекта три исхода:")
W("--   нет           → создать (чистая база);")
W("--   есть и совпал → ноль операций (прод);")
W("--   есть и ОТЛИЧАЕТСЯ → RAISE EXCEPTION, выкат откатывается.")
W("-- Молча пройти мимо расхождения нельзя: ради этого цикл и затеян.")
W("")

# --- недостающие таблицы ---
for t in missing_tables:
    rows = sorted(by_table[t], key=lambda r: r[1])
    W(f'-- ═══ таблица {t} ═══')
    W('DO $$')
    W('DECLARE missing text;')
    W('BEGIN')
    W(f"  IF to_regclass('public.\"{t}\"') IS NULL THEN")
    W(f'    CREATE TABLE "{t}" (')
    defs = []
    for r in rows:
        nn = '' if r[6] == 'YES' else ' NOT NULL'
        dv = f' DEFAULT {r[7]}' if r[7] else ''
        defs.append(f'      "{r[1]}" {ddl_type(r)}{nn}{dv}')
    W(',\n'.join(defs))
    W('    );')
    W('  ELSE')
    W('    -- Таблица уже есть: сверяем состав колонок, а не принимаем на веру.')
    W('    SELECT string_agg(expected.name, \', \') INTO missing')
    W('      FROM (VALUES')
    W(',\n'.join(f"        ('{r[1]}')" for r in rows))
    W('      ) AS expected(name)')
    W('     WHERE NOT EXISTS (')
    W('       SELECT 1 FROM information_schema.columns c')
    W('        WHERE c.table_schema = current_schema()')
    W(f"          AND c.table_name = '{t}'")
    W('          AND c.column_name = expected.name);')
    W('    IF missing IS NOT NULL THEN')
    W(f"      RAISE EXCEPTION 'reconciliation: таблица {t} существует, но в ней нет колонок: %', missing;")
    W('    END IF;')
    W('  END IF;')
    W('END $$;')
    W('')

# --- недостающие колонки у существующих таблиц ---
for t in altered_tables:
    rows = sorted(by_table[t], key=lambda r: r[1])
    W(f'-- ═══ колонки {t} ({len(rows)}) ═══')
    for r in rows:
        col, dt, nullable, default = r[1], ddl_type(r), r[6], r[7]
        nn = '' if nullable == 'YES' else ' NOT NULL'
        dv = f' DEFAULT {default}' if default else ''
        W('DO $$')
        W('DECLARE actual RECORD;')
        W('BEGIN')
        W('  SELECT data_type, is_nullable, coalesce(column_default, \'\') AS column_default')
        W('    INTO actual FROM information_schema.columns')
        W('   WHERE table_schema = current_schema()')
        W(f"     AND table_name = '{t}' AND column_name = '{col}';")
        W('  IF NOT FOUND THEN')
        W(f'    ALTER TABLE "{t}" ADD COLUMN "{col}" {dt}{nn}{dv};')
        W(f"  ELSIF actual.data_type <> '{q(r[2])}'")
        W(f"      OR actual.is_nullable <> '{nullable}'")
        W(f"      OR actual.column_default <> '{q(default)}' THEN")
        W(f"    RAISE EXCEPTION 'reconciliation: {t}.{col} отличается — тип=%, nullable=%, default=%',")
        W("      actual.data_type, actual.is_nullable, coalesce(nullif(actual.column_default, ''), '(нет)');")
        W('  END IF;')
        W('END $$;')
        W('')

# --- ключи, уникальность, проверки (до индексов и до внешних ключей) ---
_keys = [r for r in diff_cons if r[2] in ('p', 'u', 'c')]
_fks  = [r for r in diff_cons if r[2] == 'f']
W(f'-- ═══ ключи и проверки ({len(_keys)}) ═══')
for r in _keys:
    name, definition = r[1], r[3]
    W('DO $$')
    W('DECLARE actual text;')
    W('BEGIN')
    W('  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint')
    W(f"   WHERE conname = '{name}' AND connamespace = current_schema()::regnamespace;")
    W('  IF NOT FOUND THEN')
    W(f'    ALTER TABLE {r[0]} ADD CONSTRAINT "{name}" {definition};')
    W(f"  ELSIF actual <> '{q(definition)}' THEN")
    W(f"    RAISE EXCEPTION 'reconciliation: ограничение {name} отличается — %', actual;")
    W('  END IF;')
    W('END $$;')
    W('')

# --- индексы ---
W(f'-- ═══ индексы ({len(diff_idx)}) ═══')
for r in diff_idx:
    table, name, definition = r[0], r[1], r[2]
    W('DO $$')
    W('DECLARE actual text;')
    W('BEGIN')
    W('  SELECT indexdef INTO actual FROM pg_indexes')
    W(f"   WHERE schemaname = current_schema() AND indexname = '{name}';")
    W('  IF NOT FOUND THEN')
    W(f'    {definition};')
    W(f"  ELSIF actual <> '{q(definition)}' THEN")
    W(f"    RAISE EXCEPTION 'reconciliation: индекс {name} отличается — %', actual;")
    W('  END IF;')
    W('END $$;')
    W('')

# --- ограничения ---
W(f'-- ═══ внешние ключи ({len(_fks)}) ═══')
for r in _fks:
    table, name, ctype, definition = r[0].strip('"'), r[1], r[2], r[3]
    W('DO $$')
    W('DECLARE actual text;')
    W('BEGIN')
    W('  SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint')
    W(f"   WHERE conname = '{name}' AND connamespace = current_schema()::regnamespace;")
    W('  IF NOT FOUND THEN')
    W(f'    ALTER TABLE {r[0]} ADD CONSTRAINT "{name}" {definition};')
    W(f"  ELSIF actual <> '{q(definition)}' THEN")
    W(f"    RAISE EXCEPTION 'reconciliation: ограничение {name} отличается — %', actual;")
    W('  END IF;')
    W('END $$;')
    W('')

open('reconciliation.sql','w').write('\n'.join(out) + '\n')
print('таблиц создаётся:', len(missing_tables))
print('таблиц дополняется:', len(altered_tables), '→', ', '.join(altered_tables))
print('ограничений:', len(diff_cons))
print('индексов:', len(diff_idx))
print('строк SQL:', len(out))
