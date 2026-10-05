import json, os, pathlib, re, subprocess, time

here = pathlib.Path(__file__).resolve().parent
backend = here.parent / "maya-controlled-integration" / "maya-saas-backend"
source = (backend / "test/widgets-live/support/environment.ts").read_text()
blocks = [source.split(name, 1)[1].split("Object.freeze({", 1)[1].split("});", 1)[0]
          for name in ["export const PLATFORM_CI_TEST_LITERALS", "export const WIDGETS_LIVE_EXTRA_LITERALS"]]
env = {k: os.environ[k] for k in ["PATH", "HOME", "TMPDIR", "LANG"] if k in os.environ}
for block in blocks:
    env.update(dict(re.findall(r"([A-Z][A-Z0-9_]+):\s*'([^']*)'", block)))
assert env["NODE_ENV"] == "test" and len(env) > 20
env.update(DATABASE_URL="[REDACTED DATABASE URL]",
           HTTP_SMOKE_PORT="55801", SEED_DEFAULT_TENANT_SLUG="profile-proof-seed",
           SEED_DEFAULT_TENANT_NAME="Synthetic profile seed")
assert not any(k in env for k in ["SMS_RU_API_ID", "YCLIENTS_PARTNER_TOKEN", "YCLIENTS_USER_TOKEN", "OPENAI_API_KEY"])
assert not (backend / ".env").exists() and not (backend / ".env.local").exists()
steps = [
    ("smoke-create-database", ["/opt/homebrew/opt/postgresql@16/bin/createdb", "-h", "127.0.0.1", "-p", "55729", "-U", "widgetproof", "maya_gates_smoke_profile_20260930"]),
    ("smoke-existing-migrations", ["node", "node_modules/.bin/prisma", "migrate", "deploy"]),
    ("smoke-fixture-seed", ["npm", "run", "prisma:seed"]),
    ("final-http-smoke", ["npm", "run", "test:http"]),
]
receipts = []
for name, command in steps:
    start = time.time()
    with (here / (name + ".log")).open("w") as log:
        result = subprocess.run(command, cwd=backend, env=env, stdout=log, stderr=subprocess.STDOUT)
    receipts.append(dict(name=name, exitCode=result.returncode, seconds=round(time.time()-start, 3)))
    (here / "final-http-smoke-steps.json").write_text(json.dumps(receipts, indent=2)+"\n")
    if result.returncode:
        raise SystemExit(result.returncode)
