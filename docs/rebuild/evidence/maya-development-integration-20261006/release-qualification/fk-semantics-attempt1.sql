\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'maya_widget_gate_proof_unified' OR current_user <> 'maya_gate' OR inet_server_port() <> 57463 THEN
  RAISE EXCEPTION 'Owned local proof database required';
 END IF;
END $$;
CREATE TEMP TABLE fk_observation(width integer, action text, scenario text, outcome text);
DO $$
DECLARE width integer; action text; cols text; vals text; state text;
BEGIN
 FOR width IN 1..3 LOOP
  cols := CASE width WHEN 1 THEN 'id' WHEN 2 THEN 'id,tenant_id' ELSE 'id,session_id,tenant_id' END;
  vals := CASE width WHEN 1 THEN '''parent''' WHEN 2 THEN '''parent'',''tenant''' ELSE '''parent'',''session'',''tenant''' END;
  FOREACH action IN ARRAY ARRAY['NO ACTION','RESTRICT'] LOOP
   EXECUTE 'CREATE TEMP TABLE fk_parent (id text NOT NULL,session_id text NOT NULL DEFAULT ''session'',tenant_id text NOT NULL DEFAULT ''tenant'',PRIMARY KEY ('||cols||'))';
   EXECUTE 'CREATE TEMP TABLE fk_child (id text NOT NULL,session_id text NOT NULL DEFAULT ''session'',tenant_id text NOT NULL DEFAULT ''tenant'',FOREIGN KEY ('||cols||') REFERENCES fk_parent ('||cols||') ON DELETE '||action||' ON UPDATE NO ACTION NOT DEFERRABLE)';
   EXECUTE 'INSERT INTO fk_parent ('||cols||') VALUES ('||vals||')';
   EXECUTE 'INSERT INTO fk_child ('||cols||') VALUES ('||vals||')';
   BEGIN
    DELETE FROM fk_parent;
    state := 'ALLOWED';
   EXCEPTION WHEN foreign_key_violation THEN state := SQLSTATE;
   END;
   INSERT INTO fk_observation VALUES (width,action,'referenced parent delete',state);
   IF state <> '23503' THEN RAISE EXCEPTION 'Unexpected orphan allowed'; END IF;
   BEGIN
    EXECUTE 'WITH removed AS (DELETE FROM fk_parent RETURNING '||cols||') INSERT INTO fk_parent ('||cols||') SELECT '||cols||' FROM removed';
    state := 'ALLOWED';
   EXCEPTION WHEN foreign_key_violation THEN state := SQLSTATE;
   END;
   INSERT INTO fk_observation VALUES (width,action,'same-statement parent delete and key reinsertion',state);
   IF state <> CASE action WHEN 'NO ACTION' THEN 'ALLOWED' ELSE '23503' END THEN RAISE EXCEPTION 'Unexpected replacement semantics'; END IF;
   DELETE FROM fk_child;
   DELETE FROM fk_parent;
   INSERT INTO fk_observation VALUES (width,action,'explicit child-first delete','ALLOWED');
   DROP TABLE fk_child;
   DROP TABLE fk_parent;
  END LOOP;
 END LOOP;
END $$;
SELECT * FROM fk_observation ORDER BY width,scenario,action;
ROLLBACK;
