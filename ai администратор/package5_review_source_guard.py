"""B34 active-root ratchet: retired adapters cannot regain review authority."""
from __future__ import annotations

import ast
from pathlib import Path
import re


RETIRED_SOURCE = '''return {
    "ok": False, "error": "LEGACY_REVIEW_SOURCE_RETIRED", "business_mutations": 0,
    "imported": 0, "new": 0, "new_reviews": [], "sources_ready": 0, "sources": []
}'''
RETURNS = {
    "reputation.py": {
        "retired_review_source": RETIRED_SOURCE,
        **{name: "return retired_review_source()" for name in (
            "import_reviews", "refresh_public_reviews", "fetch_public_source",
            "save_source_snapshot", "refresh_2gis_stats",
        )},
    },
    "database.py": {
        "_external_reviews_ensure": "return None",
        "upsert_external_review": 'return {"ok": False, "error": "LEGACY_REVIEW_SOURCE_RETIRED", "created": False, "business_mutations": 0}',
        "list_external_reviews": "return []",
        "list_unalerted_external_reviews": "return []",
        "mark_external_reviews_alerted": "return 0",
        "mark_external_reviews_alerted_for_source": "return 0",
    },
    "webhook_server.py": {
        "panel_external_reviews_import_handler": "return _cabinet_response(reputation.retired_review_source(), status=410)",
        "panel_reputation_refresh_handler": "return _cabinet_response(reputation.retired_review_source(), status=410)",
        "reputation_monitor_loop": "return None",
        "_notify_owner_reputation": 'return {"delivered": False, "count": 0, "owners": 0, "error": "LEGACY_REVIEW_SOURCE_RETIRED"}',
    },
}
FORBIDDEN_REFS = {
    "upsert_external_review", "mark_external_reviews_alerted",
    "mark_external_reviews_alerted_for_source", "list_unalerted_external_reviews",
    "list_external_reviews", "_external_reviews_ensure", "import_reviews",
    "refresh_public_reviews", "fetch_public_source", "save_source_snapshot",
    "refresh_2gis_stats", "reputation_monitor_loop", "_notify_owner_reputation",
}
# The deployed active root also contains historical deployment backups. They
# are data, not runtime import roots; importing/executing them is rejected below.
ARCHIVE_ROOTS = {"backups", "deploy-backups", ".deploy-backups", ".release-backups"}


def archived(part):
    return part in ARCHIVE_ROOTS or part.startswith(".deploy-")


def statements(node):
    return [x for x in node.body if not (
        isinstance(x, ast.Expr) and isinstance(x.value, ast.Constant)
        and isinstance(x.value.value, str)
    )]


def literal(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return literal(node.left) + literal(node.right)
    if isinstance(node, ast.JoinedStr):
        return "".join(literal(x) for x in node.values)
    return ""


def scan_review_sources(root, overrides=None):
    root = Path(root)
    overrides = overrides or {}
    findings = []
    trees = {}
    # Includes jobs, background modules and new package submodules, not just routes.
    paths = {str(p.relative_to(root)) for p in root.rglob("*.py") if not archived(p.relative_to(root).parts[0]) and not any(
        x in {".venv", "venv", "__pycache__", "node_modules", ".git"}
        for x in p.relative_to(root).parts
    )} | set(overrides)
    for name in sorted(paths):
        if Path(name).name.startswith("test_") or Path(name).name in {
            "package5_review_source_guard.py", "package5_control_plane_runtime_guard.py",
        }:
            continue
        try:
            trees[name] = ast.parse(overrides[name] if name in overrides else (root / name).read_text(), filename=name)
        except (OSError, SyntaxError) as error:
            findings.append(f"{name}: unavailable/unparseable {type(error).__name__}")
    for name, functions in RETURNS.items():
        tree = trees.get(name)
        if tree is None:
            findings.append(f"{name}: required review boundary missing")
            continue
        for function, expected in functions.items():
            nodes = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == function]
            want = ast.dump(ast.parse(expected).body[0])
            if len(nodes) != 1 or len(statements(nodes[0])) != 1 or ast.dump(statements(nodes[0])[0]) != want:
                findings.append(f"{name}:{function}: retired boundary changed")
    rep = trees.get("reputation.py")
    if rep:
        snapshots = [n for n in ast.walk(rep) if isinstance(n, ast.FunctionDef) and n.name == "reputation_snapshot"]
        if len(snapshots) != 1:
            findings.append("reputation_snapshot: unavailable projection missing")
        else:
            node = snapshots[0]
            body = statements(node)
            calls = [n for n in ast.walk(node) if isinstance(n, ast.Call)]
            if len(body) != 1 or not isinstance(body[0], ast.Return) or len(calls) != 1 or ast.unparse(calls[0]) != "retired_review_source()":
                findings.append("reputation_snapshot: live legacy source restored")
            try:
                fields = body[0].value
                values = {k.value: ast.literal_eval(v) for k, v in zip(fields.keys, fields.values) if isinstance(k, ast.Constant)}
                if values.get("canonical_review_authority") is not False or values.get("status") != "unavailable" or values.get("summary", {}).get("overall_rating") is not None:
                    raise ValueError("projection is not unavailable")
            except (AttributeError, ValueError, TypeError):
                findings.append("reputation_snapshot: unverified evidence projection")
        for node in ast.walk(rep):
            if isinstance(node, ast.Import) and any(x.name not in {"ast", "json", "re", "warnings"} for x in node.names):
                findings.append("reputation.py: source/state transport import")
            if isinstance(node, ast.ImportFrom) and node.module not in {"__future__", "datetime", "html.parser"}:
                findings.append("reputation.py: source/state transport import")
    for name, tree in trees.items():
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                protected = {key for group in RETURNS.values() for key in group} | {"reputation_snapshot"}
                for target in targets:
                    if any((isinstance(x, ast.Name) and x.id in protected) or (isinstance(x, ast.Attribute) and x.attr in protected) for x in ast.walk(target)):
                        findings.append(f"{name}:{node.lineno}: retired boundary rebound")
            ref = node.attr if isinstance(node, ast.Attribute) else node.id if isinstance(node, ast.Name) else None
            if ref in FORBIDDEN_REFS:
                findings.append(f"{name}:{node.lineno}: legacy review reference {ref}")
            if isinstance(node, ast.ImportFrom) and any(x.name in FORBIDDEN_REFS for x in node.names):
                findings.append(f"{name}:{node.lineno}: aliased legacy review import")
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                modules = [x.name for x in node.names] if isinstance(node, ast.Import) else [node.module or ""]
                if any(archived(x.split('.')[0]) for x in modules):
                    findings.append(f"{name}:{node.lineno}: archived source imported into active runtime")
            if isinstance(node, ast.Call):
                callee = ast.unparse(node.func)
                if any(x in callee for x in ("import_module", "run_path", "exec", "Popen", "subprocess", "sys.path")) and any(any(archived(part) for part in literal(arg).split('/')) for arg in node.args):
                    findings.append(f"{name}:{node.lineno}: archived source execution")
            value = literal(node)
            if value:
                normalized = re.sub(r'[\s`"\[\]]+', ' ', value).upper()
                if re.search(r"\b(EXTERNAL_REVIEWS|BUSINESSREVIEW)\b", normalized) and re.search(r"\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|TRUNCATE)\b", normalized):
                    findings.append(f"{name}:{node.lineno}: direct review SQL outside AC4")
                if "/api/business-content/reviews" in value or "reputation.new_review" in value:
                    findings.append(f"{name}:{node.lineno}: unverified review ingress/delivery")
    web = trees.get("webhook_server.py")
    if web:
        for route, handler in (
            ("/api/panel/external_reviews/import", "panel_external_reviews_import_handler"),
            ("/api/panel/reputation/refresh", "panel_reputation_refresh_handler"),
        ):
            sites = [n for n in ast.walk(web) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr != "add_options" and any(isinstance(a, ast.Constant) and a.value == route for a in n.args)]
            if len(sites) != 1 or len(sites[0].args) != 2 or ast.unparse(sites[0].args[1]) != handler:
                findings.append(f"{route}: retired route binding changed")
    return sorted(set(findings))
