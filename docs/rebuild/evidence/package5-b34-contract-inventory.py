"""Read-only B34 source inventory. Does not import the application or open a DB.

Run with Python 3 from any directory; JSON is written to stdout.
This is a bounded source audit, not a runtime architectural guard or a proof of
the absence of dynamically constructed SQL/calls. Production anchors are the
separately committed B33/B34 checkpoint evidence, not a live check by this script.
"""

import ast
import hashlib
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[3]
PYTHON = ROOT / "ai администратор"
TERMS = (
    "external_review", "import_reviews", "refresh_public_reviews",
    "reputation_snapshot", "reputation_monitor_loop", "save_source_snapshot",
    "fetch_public_source", "parse_yandex_public_page", "parse_2gis_public_page",
    "_public_page_url", "refresh_2gis_stats",
    "panel_reputation_refresh_handler", "panel_reviews_handler",
    "_notify_owner_reputation",
)
ANCHORS = (
    "maya-saas-backend/prisma/schema.prisma",
    "maya-saas-backend/prisma/migrations/20260814190000_business_content_registry/migration.sql",
    "maya-saas-backend/src/package5-wave4/package5-wave4.service.ts",
    "maya-saas-backend/src/business-content/business-content.controller.ts",
    "maya-saas-backend/src/business-content/business-content.service.ts",
    "maya-saas-backend/src/business-content/dto/business-review.dto.ts",
    "maya-saas-backend/src/auth/jwt.strategy.ts",
    "maya-saas-backend/src/main.ts",
    "maya-saas-backend/src/guards/roles.guard.ts",
    "maya-saas-backend/src/guards/tenant-access.guard.ts",
    "maya-saas-backend/src/package5-wave4/package5-wave4-canonical-cutover.service.spec.ts",
    "maya-saas-backend/src/tenancy/bridge-source.service.ts",
    "maya-saas-backend/src/common/feature-catalog.ts",
    "ai администратор/legacy_client_command_bridge.py",
    "docs/rebuild/CYCLE-06-BLOCKING-PACKAGE-5-WAVE-4-A27-A28-RUNTIME-CONTRACT-GATE.md",
    "docs/rebuild/CYCLE-06-BLOCKING-PACKAGE-5-AUTHORITY-CLASSIFICATION-MINIMUM-SCHEMA-DECISION-GATE.md",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def interesting(value):
    return any(term in value for term in TERMS)


modules = []
functions = []
calls = []
sql = []
for path in sorted(PYTHON.glob("*.py")):
    if path.name.startswith("test_") or path.name.endswith("_test.py"):
        continue
    source = path.read_text()
    tree = ast.parse(source, filename=str(path))
    relative = str(path.relative_to(ROOT))
    modules.append({"path": relative, "sha256": digest(path.read_bytes())})
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and (
            interesting(node.name) or node.name in ("_panel_auth", "_panel_resolve_role")
        ):
            functions.append({
                "path": relative, "name": node.name, "line": node.lineno,
                "endLine": node.end_lineno,
                "sourceSha256": digest(ast.get_source_segment(source, node).encode()),
            })
        if isinstance(node, ast.Call):
            callee = ast.unparse(node.func)
            arguments = [ast.unparse(arg) for arg in node.args]
            if interesting(callee) or any(interesting(arg) for arg in arguments):
                calls.append({"path": relative, "line": node.lineno, "callee": callee})
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            value = node.value
            if "external_reviews" in value and re.search(
                r"\b(INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b", value, re.I
            ):
                sql.append({
                    "path": relative, "line": node.lineno,
                    "literalSha256": digest(value.encode()),
                    "operations": sorted(set(re.findall(
                        r"\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\b", value, re.I
                    ))),
                })

schema = (ROOT / ANCHORS[0]).read_text()
body = re.search(r"model BusinessReview \{(.*?)\n\}", schema, re.S).group(1)
scalars = []
for line in body.splitlines():
    match = re.match(r"\s+(\w+)\s+(String\??|Int|DateTime|Json\??)\b", line)
    if match:
        scalars.append(match.group(1))
assert len(scalars) == 12, scalars
print(json.dumps({
    "audit": "B34 Stage 1 source/contract reconstruction; no remediation",
    "baseCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "canonicalReviewScalarFields": scalars,
    "canonicalKey": ["tenantId", "source", "externalRef"],
    "runtimeImports": 0, "databaseConnections": 0, "productionRequests": 0,
    "pythonRootNonTestModules": len(modules),
    "modules": modules, "functions": functions, "calls": calls,
    "reviewSqlLiteralSites": sql,
    "anchors": [{"path": name, "sha256": digest((ROOT / name).read_bytes())} for name in ANCHORS],
    "limits": [
        "Syntactic call/literal inventory, not an executable closure proof.",
        "No live production freshness claim; use accepted checkpoint anchors separately.",
        "Missing source-binding contract is a documented review conclusion, not a regex proof.",
    ],
}, ensure_ascii=False, indent=2))
