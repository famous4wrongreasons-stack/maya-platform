#!/usr/bin/env python3
"""Run the R-A aggregate gate against an explicitly owned local proof database."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repository", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--node-bin", required=True)
    p.add_argument("--database", required=True)
    args = p.parse_args()
    db = urlparse(args.database)
    assert db.hostname == "127.0.0.1" and db.port == 55507
    assert db.username == "maya_ra" and db.path in {"/maya_ra_replay", "/maya_ra_release"}
    root = Path(args.repository).resolve()
    backend = root / "maya-saas-backend"
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PATH=args.node_bin + ":" + os.environ["PATH"],
               DATABASE_URL=args.database, PYTHONDONTWRITEBYTECODE="1")
    node = str(Path(args.node_bin) / "node")
    jest = [node, "node_modules/jest/bin/jest.js", "--runInBand", "--silent"]
    prisma = [node, "node_modules/prisma/build/index.js"]
    stages = [
        ("architectural-ratchets", jest + ["--testPathPatterns=architecture|boundary|guard", "--json", "--outputFile=" + str(output / "architecture-jest.json")]),
        ("lint", ["npm", "run", "lint"]),
        ("application-typecheck", ["npm", "run", "typecheck"]),
        ("scripts-typecheck", ["npm", "run", "typecheck:scripts"]),
        ("build", ["npm", "run", "build"]),
        ("schema-validate", prisma + ["validate"]),
        ("migration-status", prisma + ["migrate", "status"]),
        ("schema-diff", prisma + ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]),
        ("mandatory-backend", jest + ["--json", "--outputFile=" + str(output / "mandatory-jest.json")]),
    ]

    def fingerprint():
        paths = subprocess.check_output(["git", "-C", str(root), "ls-files", "-c", "-o", "--exclude-standard", "-z"]).decode().split("\0")
        hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                  for name in sorted(set(paths)) if name and (root / name).is_file()}
        return hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()

    initial = fingerprint()
    result = {"wave": "R-A", "status": "RUNNING", "sourceFingerprint": initial,
              "head": subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"]).decode().strip(),
              "oldDatabasesTouched": 0, "productionMutationsMessages": 0,
              "package5FinalGateRun": False, "stages": []}
    for name, command in stages:
        print("START " + name, flush=True)
        started = time.monotonic()
        with (output / (name + ".log")).open("w") as log:
            run = subprocess.run(command, cwd=backend, env=env, stdout=log, stderr=subprocess.STDOUT)
        row = {"stage": name, "exitCode": run.returncode, "seconds": round(time.monotonic() - started, 2)}
        result["stages"].append(row)
        result["status"] = "FAIL" if run.returncode else "RUNNING"
        (output / "gate.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(row), flush=True)
        if run.returncode:
            raise SystemExit(run.returncode)
    result["sourceUnchangedDuringGate"] = fingerprint() == initial
    result["status"] = "PASS" if result["sourceUnchangedDuringGate"] else "FAIL"
    (output / "gate.json").write_text(json.dumps(result, indent=2) + "\n")
    assert result["sourceUnchangedDuringGate"], "source changed during aggregate gate"
    print("WAVE R-A AGGREGATE: PASS", flush=True)


if __name__ == "__main__":
    main()
