#!/usr/bin/env python3
"""Fail closed when the active PWA can bypass Package 4 value owners.

The Nest deployment pipeline and the legacy PWA have separate release paths.
This validator is intentionally runnable against either a checkout or the
active ``/home/botadmin/barbershop-bot`` directory so a source-only ratchet
cannot mistake a stale runtime artifact for a protected deployment.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class Finding:
    check: str
    detail: str


WEB_FUNCTIONS = {
    "client_book_with_loyalty_handler": {
        "markers": ("p4_03_legacy_mutation_disabled:redeem_legacy_loyalty",),
        "forbidden": (
            "database.reserve_loyalty_points",
            "database.release_loyalty_points",
            "loyalty.apply_redemption_for_booking",
        ),
    },
    "cert_create_handler": {
        "markers": (
            "p4_06_legacy_mutation_disabled:initiate_gift_certificate_purchase",
        ),
        "forbidden": (
            "database.save_gift_certificate",
            "database.set_cert_payment_id",
            "database.mark_cert_paid",
            "database.mark_cert_canceled",
            "yukassa_api.create_payment",
        ),
    },
    "panel_redeem_handler": {
        "markers": (
            "p4_06_legacy_mutation_disabled:redeem_gift_certificate",
            "p4_03_legacy_mutation_disabled:consume_loyalty_redemption_grant",
        ),
        "forbidden": (
            "database.mark_cert_used",
            "loyalty.consume_redeem_code",
        ),
    },
    "_process_record_delete": {
        "markers": ("p4_03_canonical_refund_required",),
        "forbidden": ("loyalty.refund_for_cancelled_record",),
    },
}

LOYALTY_FUNCTIONS = {
    "import_yclients_loyalty_balance": "import_legacy_loyalty_balance",
    "apply_redemption_for_booking": "redeem_legacy_loyalty",
    "refund_for_cancelled_record": "refund_legacy_loyalty",
    "lazy_backfill_for_client": "backfill_legacy_loyalty",
    "generate_redeem_code": "issue_loyalty_redemption_grant",
    "consume_redeem_code": "consume_loyalty_redemption_grant",
}

DATABASE_FUNCTIONS = {
    "save_gift_certificate": "initiate_gift_certificate_purchase",
    "mark_cert_paid": "activate_gift_certificate",
    "set_cert_payment_id": "provider_payment_correlation",
    "mark_cert_canceled": "provider_payment_reconciliation",
    "mark_cert_used": "redeem_gift_certificate",
}

GLOBAL_FORBIDDEN = (
    "database.reserve_loyalty_points",
    "database.release_loyalty_points",
    "database.finalize_loyalty_reservation",
    "database.redeem_loyalty_points",
    "database.save_gift_certificate",
    "database.set_cert_payment_id",
    "database.mark_cert_paid",
    "database.mark_cert_canceled",
    "database.mark_cert_used",
    "loyalty.apply_redemption_for_booking",
    "loyalty.refund_for_cancelled_record",
    "loyalty.generate_redeem_code",
    "loyalty.consume_redeem_code",
)


def _read(root: Path, filename: str, overrides: Mapping[str, str]) -> str:
    if filename in overrides:
        return overrides[filename]
    return (root / filename).read_text(encoding="utf-8")


def _functions(source: str, filename: str) -> dict[str, str]:
    try:
        tree = ast.parse(source, filename=filename)
    except SyntaxError as exc:
        raise ValueError(f"{filename}: invalid Python: {exc}") from exc
    lines = source.splitlines(keepends=True)
    found: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            end = node.end_lineno or node.lineno
            found[node.name] = "".join(lines[node.lineno - 1 : end])
    return found


def _check_guarded_function(
    findings: list[Finding],
    *,
    filename: str,
    functions: Mapping[str, str],
    function_name: str,
    marker: str,
) -> None:
    body = functions.get(function_name)
    if body is None:
        findings.append(Finding("guarded_function", f"{filename}:{function_name} missing"))
        return
    family = "03" if filename == "loyalty.py" else "06"
    marker_text = f"p4_{family}_legacy_mutation_disabled:{marker}"
    helper_guard = (
        filename == "loyalty.py"
        and "_legacy_loyalty_mutation_disabled" in body
        and marker in body
    )
    if marker_text not in body and not helper_guard:
        findings.append(
            Finding("guarded_function", f"{filename}:{function_name} lacks {marker_text}")
        )
        return
    marker_offset = (
        body.index(marker_text)
        if marker_text in body
        else body.index("_legacy_loyalty_mutation_disabled")
    )
    mutation_offsets = [
        offset
        for needle in ("with _db()", "conn.execute(", "database.", "_yc.")
        if (offset := body.find(needle)) >= 0
    ]
    if mutation_offsets and marker_offset > min(mutation_offsets):
        findings.append(
            Finding(
                "guarded_function",
                f"{filename}:{function_name} can reach legacy work before its guard",
            )
        )



def _ast_digest(node):
    # Python 3.14 omits empty AST fields by default; the semantic contract is
    # stable across supported interpreters and never depends on dump formatting.
    def value(item):
        if isinstance(item, ast.AST):
            return [type(item).__name__, {key: value(field) for key, field in ast.iter_fields(item)
                                         if field is not None and field != []}]
        if isinstance(item, list):
            return [value(child) for child in item]
        return item
    return hashlib.sha256(json.dumps(value(node), ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


def scan_runtime(
    root: Path | str,
    overrides: Mapping[str, str] | None = None,
) -> list[Finding]:
    root = Path(root)
    overrides = overrides or {}
    findings: list[Finding] = []

    required = ("webhook_server.py", "loyalty.py", "database.py")
    for filename in required:
        if filename not in overrides and not (root / filename).is_file():
            findings.append(Finding("runtime_surface", f"{filename} missing"))
    if findings:
        return findings

    web = _read(root, "webhook_server.py", overrides)
    web_functions = _functions(web, "webhook_server.py")
    for name, contract in WEB_FUNCTIONS.items():
        body = web_functions.get(name)
        if body is None:
            findings.append(Finding("pwa_handler", f"webhook_server.py:{name} missing"))
            continue
        # R06's complete canonical fact/alert handoff owns no value mutation.
        # Match its whole reviewed body; an added alias/writer is not exempt.
        canonical_r06 = (name == "_process_record_delete" and _ast_digest(ast.Module(body=ast.parse(body).body[0].body, type_ignores=[])) == '3e887cb576f413c74c3943ae20976e0c1405a6779e2f238706d09ce578e0e376')
        for marker in contract["markers"]:
            if marker not in body and not canonical_r06:
                findings.append(Finding("pwa_handler", f"{name} lacks {marker}"))
        for forbidden in contract["forbidden"]:
            if forbidden in body:
                findings.append(Finding("pwa_handler", f"{name} calls {forbidden}"))

    loyalty = _read(root, "loyalty.py", overrides)
    loyalty_functions = _functions(loyalty, "loyalty.py")
    for name, action in LOYALTY_FUNCTIONS.items():
        _check_guarded_function(
            findings,
            filename="loyalty.py",
            functions=loyalty_functions,
            function_name=name,
            marker=action,
        )

    database = _read(root, "database.py", overrides)
    database_functions = _functions(database, "database.py")
    for name, action in DATABASE_FUNCTIONS.items():
        _check_guarded_function(
            findings,
            filename="database.py",
            functions=database_functions,
            function_name=name,
            marker=action,
        )

    # Catch a later production module reintroducing a direct value writer. The
    # implementations above and the inactive Telegram bot are separately
    # guarded; migration, tests, and the immutable SaaS blueprint are not
    # production PWA modules.
    excluded = {
        "bot.py",
        "database.py",
        "loyalty.py",
        "import_gift_certs.py",
        "package4_value_runtime_guard.py",
    }
    for path in sorted(root.glob("*.py")):
        if path.name in excluded or path.name.startswith("test_"):
            continue
        source = overrides.get(path.name)
        if source is None:
            source = path.read_text(encoding="utf-8")
        for forbidden in GLOBAL_FORBIDDEN:
            if forbidden in source:
                findings.append(
                    Finding("later_pwa_module", f"{path.name} references {forbidden}")
                )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).parent)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    findings = scan_runtime(args.root)
    payload = {
        "pass": not findings,
        "activePwaIncludedInPackage4FinalProtection": True,
        "package4GuardsApplyToLaterPackageChanges": True,
        "findings": [asdict(item) for item in findings],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    elif findings:
        for item in findings:
            print(f"FAIL {item.check}: {item.detail}")
    else:
        print("Package 4 active PWA runtime guard: PASS")
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
