"""Synthetic PG16 proof of the A22 namespace delta and existing writer guards.
Minimal FK targets + actual R11 guard SQL; not full application qualification.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pg-bin", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    binaries, out = Path(args.pg_bin).resolve(), Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=False)
    migrations = Path(__file__).resolve().parents[1] / "prisma/migrations"
    sources = {key: migrations / name / "migration.sql" for key, name in {
        "r11": "20260908010500_r11_approved_foundation",
        "receipt": "20260908010100_shared_approved_foundation",
        "c9": "20260913160000_chapter9_orchestration_foundation",
        "delta": "20261021170000_a22_customer_facts",
    }.items()}
    source = {key: path.read_text() for key, path in sources.items()}
    sql = """
CREATE TABLE "Tenant" (id TEXT PRIMARY KEY);
CREATE TABLE "User" (id TEXT PRIMARY KEY, status TEXT NOT NULL);
CREATE TABLE "Membership" (id TEXT PRIMARY KEY, "tenantId" TEXT, "userId" TEXT, status TEXT, role TEXT, UNIQUE(id,"tenantId"));
CREATE TABLE "ActionExecution" (id TEXT PRIMARY KEY, "tenantId" TEXT, "actorUserId" TEXT, "actionClass" TEXT,
 state TEXT, "dryRun" BOOLEAN, "policyDecision" TEXT, "reconciliationState" TEXT, UNIQUE(id,"tenantId"));
INSERT INTO "Tenant" VALUES ('synthetic-a'),('synthetic-b');
INSERT INTO "User" VALUES ('synthetic-owner','active'),('synthetic-staff','active');
INSERT INTO "Membership" VALUES
 ('owner-member','synthetic-a','synthetic-owner','active','tenant_owner'),
 ('staff-member','synthetic-a','synthetic-staff','active','staff'),
 ('foreign-member','synthetic-b','synthetic-owner','active','tenant_owner');
INSERT INTO "ActionExecution" VALUES
 ('owner-execution','synthetic-a','synthetic-owner','update_tenant_business_configuration','EXECUTING',false,'ALLOW','NOT_REQUIRED'),
 ('staff-execution','synthetic-a','synthetic-staff','update_tenant_business_configuration','EXECUTING',false,'ALLOW','NOT_REQUIRED'),
 ('dry-execution','synthetic-a','synthetic-owner','update_tenant_business_configuration','EXECUTING',true,'ALLOW','NOT_REQUIRED'),
 ('denied-execution','synthetic-a','synthetic-owner','update_tenant_business_configuration','EXECUTING',false,'DENY','NOT_REQUIRED'),
 ('wrong-action','synthetic-a','synthetic-owner','other_action','EXECUTING',false,'ALLOW','NOT_REQUIRED');
"""
    # Retention is outside this proof: absent authority is represented by deny-only stubs.
    sql += '''
CREATE FUNCTION "RC_payload_claim"(text,text,text,text,timestamptz,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION "RC_execution_set_resolved"(text,text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
'''
    sql += 'CREATE FUNCTION "RC_confirmed_owner_receipt"' + source["receipt"].split('CREATE FUNCTION "RC_confirmed_owner_receipt"')[1].split("COMMIT;")[0]
    sql += source["r11"]
    sql += 'ALTER TABLE "TenantBusinessConfigurationRevision" DROP CONSTRAINT' + source["c9"].split('ALTER TABLE "TenantBusinessConfigurationRevision" DROP CONSTRAINT')[1].split('CREATE TABLE "C9Run"')[0]
    sql += """CREATE TEMP TABLE original_guard AS
 SELECT md5(pg_get_functiondef('"R11_config_guard"()'::regprocedure)) AS digest;
"""
    def insert(key, namespace="customer_facts", revision=1, predecessor="NULL",
               execution="owner-execution", user="synthetic-owner", member="owner-member"):
        return f"""INSERT INTO "TenantBusinessConfigurationRevision"
 (id,"tenantId",namespace,revision,"previousRevisionId","actionExecutionId","actorUserId","actorMembershipId",
 "contractVersion","contentHash","encryptedContent","createdAt")
 VALUES ('{key}','synthetic-a','{namespace}',{revision},{predecessor},'{execution}','{user}','{member}',
 1,repeat('a',64),'synthetic-encrypted',now());"""
    def denied(statement, label):
        return f"""DO $proof$ BEGIN
 BEGIN {statement} RAISE EXCEPTION 'expected refusal: {label}';
 EXCEPTION WHEN check_violation THEN NULL; END;
 END $proof$;
"""
    sql += denied(insert("before-delta"), "unlisted namespace before migration") + source["delta"]
    sql += """DO $proof$ BEGIN
 IF (SELECT digest FROM original_guard) <> md5(pg_get_functiondef('"R11_config_guard"()'::regprocedure)) THEN
 RAISE EXCEPTION 'writer guard changed'; END IF;
 END $proof$;
"""
    for statement, label in [
        (insert("staff", execution="staff-execution", user="synthetic-staff", member="staff-member"), "staff self-publication"),
        (insert("foreign", member="foreign-member"), "foreign membership"),
        (insert("dry", execution="dry-execution"), "dry run"),
        (insert("denied", execution="denied-execution"), "denied policy"),
        (insert("wrong", execution="wrong-action"), "wrong action"),
        (insert("unknown", namespace="public_arbitrary"), "unlisted namespace"),
        (insert("unsettled") + "SET CONSTRAINTS ALL IMMEDIATE;", "unsettled receipt"),
    ]:
        sql += denied(statement, label)
    sql += "BEGIN;\n" + insert("public-one") + """
UPDATE "ActionExecution" SET state='SUCCEEDED' WHERE id='owner-execution';
COMMIT;
INSERT INTO "ActionExecution" VALUES
 ('second-execution','synthetic-a','synthetic-owner','update_tenant_business_configuration','EXECUTING',false,'ALLOW','NOT_REQUIRED');
"""
    sql += denied(insert("stale", execution="second-execution"), "stale predecessor")
    sql += "BEGIN;\n" + insert("public-two", revision=2, predecessor="'public-one'", execution="second-execution") + """
UPDATE "ActionExecution" SET state='SUCCEEDED' WHERE id='second-execution';
COMMIT;
"""
    sql += denied("""UPDATE "TenantBusinessConfigurationRevision" SET namespace='business_rules' WHERE id='public-one';""", "append-only namespace")
    sql += denied("""DELETE FROM "TenantBusinessConfigurationRevision" WHERE id='public-one';""", "append-only revision")
    sql += """DO $proof$ BEGIN
 IF (SELECT count(*) FROM "TenantBusinessConfigurationRevision") <> 2 THEN RAISE EXCEPTION 'unexpected rows'; END IF;
 IF (SELECT max(revision) FROM "TenantBusinessConfigurationRevision" WHERE "tenantId"='synthetic-a' AND namespace='customer_facts') <> 2 THEN RAISE EXCEPTION 'missing revision'; END IF;
 END $proof$;
SELECT 'PASS: namespace, owner, tenant, policy, receipt, CAS and append-only guards' AS result;
"""
    (out / "proof.sql").write_text(sql)
    result = {"contract": "maya.customer-facts.schema-proof/1", "status": "RUNNING",
              "fixture": "minimal synthetic FK targets, actual R11 guard and delta SQL; deny-only retention helper stubs, retention exception not qualified",
              "sources": {key: {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for key, path in sources.items()}}
    with tempfile.TemporaryDirectory(prefix="maya-customer-facts-") as scratch:
        owned, started = Path(scratch), False
        data = owned / "data"
        env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
        env.update(PGHOST=str(owned), PGPORT="55439", PGDATABASE="postgres")
        try:
            with (out / "process.log").open("w") as log:
                def run(tool, *arguments):
                    subprocess.run([str(binaries / tool), *arguments], env=env, check=True, stdin=subprocess.DEVNULL,
                                   stdout=log, stderr=subprocess.STDOUT, timeout=90)
                run("initdb", "-D", str(data), "-A", "trust", "--no-locale", "--encoding=UTF8")
                run("pg_ctl", "-D", str(data), "-l", str(out / "postgres.log"), "-w", "start",
                    "-o", f"-h '' -k {owned} -p 55439 -c shared_buffers=16MB -c max_connections=10")
                started = True
                run("psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", str(out / "proof.sql"))
                result["status"] = "PASS"
        finally:
            if started:
                subprocess.run([str(binaries / "pg_ctl"), "-D", str(data), "-w", "stop", "-m", "fast"],
                               check=True, stdout=subprocess.DEVNULL, timeout=30)
            result["ownedPostgresStopped"] = not (data / "postmaster.pid").exists()
            if result["status"] == "RUNNING":
                result["status"] = "FAIL"
            (out / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "ownedPostgresStopped": result["ownedPostgresStopped"]}))

if __name__ == "__main__":
    main()

