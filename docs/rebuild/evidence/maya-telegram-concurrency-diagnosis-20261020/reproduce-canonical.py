#!/usr/bin/env python3
"""Mac-only synthetic reproduction. No product patch, live credentials or provider access."""
import argparse
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys

CANDIDATE = "36555c5579a9f95e3983c8db8f0a5bbab8329947"
TEST = "maya-saas-backend/test/widgets-live/telegram-client-binding.live-spec.ts"
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, required=True, help="Clean exact-candidate checkout with installed locked dependencies")
parser.add_argument("--output", type=Path, required=True, help="New directory outside source for disposable DB and evidence")
parser.add_argument("--node", type=Path, required=True, help="Node 22 executable")
parser.add_argument("--pg-bin", type=Path, required=True, help="PostgreSQL 16 bin directory")
parser.add_argument("--commit-delay-us", type=int, choices=[0, 20000], default=20000)
args = parser.parse_args()
assert sys.platform == "darwin", "This runner requires macOS sandbox-exec"
source, output = args.source.resolve(), args.output.resolve()
node, pg = args.node.resolve(), args.pg_bin.resolve()
assert not output.exists(), "Use a new diagnostic output directory"
assert source not in output.parents, "Keep diagnostic database outside source"
backend = source / "maya-saas-backend"
def git(*words):
    return subprocess.check_output(["git", *words], cwd=source)
assert git("rev-parse", "HEAD").decode().strip() == CANDIDATE
assert not git("diff", "--name-only", CANDIDATE, "--", "maya-saas-backend/src",
               "maya-saas-backend/prisma", "maya-saas-backend/test",
               "maya-saas-backend/package.json", "maya-saas-backend/package-lock.json",
               ".github/workflows/widgets-live.yml").strip(), "Source changes refused"
canonical_test = git("show", CANDIDATE + ":" + TEST)
assert (source / TEST).read_bytes() == canonical_test
assert not (backend / ".env").exists(), "Private environment file refused"
assert subprocess.check_output([str(node), "--version"]).decode().startswith("v22.")
assert "PostgreSQL) 16." in subprocess.check_output([str(pg / "postgres"), "--version"]).decode()
assert Path("/usr/bin/sandbox-exec").exists()
output.mkdir(mode=0o700)
for name in ["tmp", "logs"]:
    (output / name).mkdir(mode=0o700)
env = {"PATH": str(node.parent) + ":/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
       "TMPDIR": str(output / "tmp"), "LANG": "en_US.UTF-8", "TZ": "UTC", "NODE_ENV": "test"}
parse_env = """const fs=require('fs'),yaml=require('js-yaml');
process.stdout.write(JSON.stringify(yaml.load(fs.readFileSync('../.github/workflows/widgets-live.yml','utf8')).jobs['widgets-live'].env));"""
literals = json.loads(subprocess.check_output([str(node), "-e", parse_env], cwd=backend, env=env))
literals.pop("DATABASE_URL", None)
assert all(isinstance(v, str) and ("$"+"{") not in v for v in literals.values()), "Only committed synthetic literal environment accepted"
env.update(literals)
with socket.socket() as s:
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
db = "maya_widget_gate_proof_tg_concurrency_diagnostic"
env["DATABASE_URL"] = "postgresql://proof@127.0.0.1:" + str(port) + "/" + db + "?schema=public"
fence = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))'
state = {"candidate": CANDIDATE, "diagnosticOnly": True, "commit_delay_us": args.commit_delay_us,
         "commit_siblings": 1, "productChanges": 0, "realEffects": 0, "steps": [],
         "canonicalTestSHA256": hashlib.sha256(canonical_test).hexdigest()}
def save():
    (output / "manifest.json").write_text(json.dumps(state, indent=2) + "\n")
def run(name, command, required=True):
    with (output / "logs" / (name + ".log")).open("w") as log:
        r = subprocess.run(["/usr/bin/sandbox-exec", "-p", fence, *map(str, command)],
                           cwd=backend, env=env, stdout=log, stderr=subprocess.STDOUT)
    state["steps"].append({"name": name, "exit": r.returncode})
    save()
    if required and r.returncode:
        raise RuntimeError("Diagnostic setup failed at " + name)
    return r.returncode
started = False
exit_code = 2
try:
    run("initdb", [pg / "initdb", "-D", output / "pg", "--auth=trust", "--username=proof",
                   "--encoding=UTF8", "--locale=C"])
    options = ("-h 127.0.0.1 -p " + str(port) + " -k '' -c shared_buffers=128MB "
               "-c max_connections=40 -c commit_delay=" + str(args.commit_delay_us) + " -c commit_siblings=1")
    run("pg-start", [pg / "pg_ctl", "-D", output / "pg", "-w", "-t", "30",
                     "-l", output / "postgres.log", "-o", options, "start"])
    started = True
    run("createdb", [pg / "createdb", "-h", "127.0.0.1", "-p", port, "-U", "proof", db])
    run("migrations", [node, "node_modules/prisma/build/index.js", "migrate", "deploy"])
    exit_code = run("concurrency", [node, "node_modules/jest/bin/jest.js", "--config",
        "test/jest-widgets-live.json", "--runInBand", "--runTestsByPath",
        "test/widgets-live/telegram-client-binding.live-spec.ts", "--testNamePattern",
        "gives one initial writer under concurrent valid login contexts", "--json",
        "--cacheDirectory=" + str(output / "jest-cache"), "--outputFile=" + str(output / "jest.json")], False)
    result = json.loads((output / "jest.json").read_text())
    assert result["numPassedTests"] + result["numFailedTests"] == 8, "Unexpected test inventory"
    state.update(passed=result["numPassedTests"], failed=result["numFailedTests"],
                 skipped=result["numPendingTests"], testExit=exit_code,
                 status="diagnostic-complete", certification=False)
finally:
    if started:
        state["pgStopped"] = run("pg-stop", [pg / "pg_ctl", "-D", output / "pg", "-w",
            "-t", "30", "-m", "fast", "stop"], False) == 0
    state["canonicalTestUnchanged"] = (source / TEST).read_bytes() == canonical_test
    save()
print(json.dumps({k: state.get(k) for k in ["candidate", "passed", "failed", "testExit",
                                           "pgStopped", "canonicalTestUnchanged"]}))
sys.exit(exit_code)

