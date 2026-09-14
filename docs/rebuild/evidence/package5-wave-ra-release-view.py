#!/usr/bin/env python3
"""Build an auditable clean R-A release view without shipping B36 runtime WIP.

The canonical checkout and commit history are never modified. Only the exact
runtime delta of the accepted B36 WIP checkpoint is excluded from a new release
tree, including its matching schema-proof constructor adjustment. The already
applied B36 schema, compatible d779 schema proof, and all R-A commits remain.
Any merge conflict or schema difference is a hard stop, not an automatic repair.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

WIP = "7201f7bdfc3ed8784994536d86522031ca87b16c"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--evidence", required=True)
    args = parser.parse_args()
    repo = Path(args.repository).resolve()
    dest = Path(args.directory).absolute()
    assert not dest.exists(), "release view path already exists"

    def git(*cmd, data=None, env=None):
        return subprocess.check_output(["git", "-C", str(repo), *cmd], input=data, env=env)

    source = git("rev-parse", args.source + "^{commit}").decode().strip()
    git("merge-base", "--is-ancestor", WIP, source)
    paths = git("diff-tree", "--no-commit-id", "--name-only", "-r", "-z", WIP).decode().split("\0")
    paths = [p for p in paths if p and (
        p.startswith("ai администратор/") or
        p.startswith("maya-saas-backend/src/") or
        p.startswith("maya-saas-backend/scripts/"))]
    assert len(paths) == 21, ("unexpected B36 WIP runtime/proof path set", paths)
    assert not any("/prisma/" in p for p in paths)
    patch = git("diff", "--binary", WIP + "^", WIP, "--", *paths)
    with tempfile.TemporaryDirectory(prefix="maya-ra-release-index-") as temporary:
        env = dict(os.environ, GIT_INDEX_FILE=str(Path(temporary) / "index"))
        git("read-tree", source, env=env)
        git("apply", "--cached", "--3way", "--reverse", "--whitespace=nowarn", data=patch, env=env)
        assert not git("ls-files", "--unmerged", env=env), "release projection conflict"
        tree = git("write-tree", env=env).decode().strip()
        changed = [p for p in git("diff", "--name-only", "-z", source, tree).decode().split("\0") if p]
        assert set(changed) == set(paths), "release view changed paths outside exact B36 WIP delta"
        assert not git("diff", source, tree, "--", "maya-saas-backend/prisma"), "schema changed"
        message = ("release(wave-ra): preserve B35 report runtime while shipping R-A\n\n"
                   f"Canonical source: {source}\n"
                   f"Excluded runtime WIP delta: {WIP}\n"
                   "B36 schema and compatible d779 schema proof retained; canonical history unchanged.\n")
        commit = git("commit-tree", tree, "-p", source, data=message.encode()).decode().strip()
    git("worktree", "add", "-b", args.branch, str(dest), commit)
    assert not subprocess.check_output(["git", "-C", str(dest), "status", "--porcelain"])
    evidence = {"canonicalSource": source, "releaseCommit": commit, "releaseTree": tree,
                "excludedWip": WIP, "excludedRuntimePaths": paths,
                "excludedDeltaSha256": hashlib.sha256(patch).hexdigest(),
                "schemaDifference": "NONE", "schemaProofRetained": True,
                "schemaProofCompatibilityRevision": "d7794b3101020d42fca16afd25f0972255a2a498",
                "canonicalCheckoutModified": False, "directory": str(dest),
                "branch": args.branch, "clean": True}
    Path(args.evidence).write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
