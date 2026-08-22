#!/usr/bin/env python3
"""Passive, PII-safe observer for organic legacy appointment shadow traffic.

The process reads one systemd journal unit, accepts only the dedicated MAYA
shadow-observation contract, and writes a minimal local SQLite audit. It has no
application imports, network client, CRM credential, or execution capability.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


OBSERVATION_PREFIX = "MAYA_LEGACY_APPOINTMENT_SHADOW_OBSERVATION "
OBSERVATION_CONTRACT = "maya.legacy-appointment-shadow-observation/1"
SUMMARY_CONTRACT = "maya.organic-appointment-shadow-verification/1"

ACTION_CLASSES = {
    "create_appointment": {
        "preview_action": "create_appointment",
        "capability": "crm.appointment.create.v1",
        "executor": "crm.appointment.create",
    },
    "reschedule_appointment": {
        "preview_action": "reschedule_appointment",
        "capability": "crm.appointment.reschedule.v1",
        "executor": "crm.appointment.reschedule",
    },
    "cancel_appointment": {
        "preview_action": "cancel_appointment",
        "capability": "crm.appointment.cancel.v1",
        "executor": "crm.appointment.cancel",
    },
}

AUTHORIZATION_CONTEXT = {
    "transport_authentication": "bridge_secret",
    "integration_binding": "verified",
    "origin_action_policy": "allowed",
    "tenant_scope": "system_tenant",
}

HEX_64 = re.compile(r"^[a-f0-9]{64}$")
STOP_REQUESTED = False
FOLLOW_PROCESS: subprocess.Popen[str] | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def atomic_json_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=True, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def safe_string(value: Any, *, limit: int = 160) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > limit:
        return None
    return normalized


def safe_integer(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def safe_hex_64(value: Any) -> str | None:
    normalized = safe_string(value, limit=64)
    if normalized is None or HEX_64.fullmatch(normalized) is None:
        return None
    return normalized


def zero_side_effect(value: Any) -> int | None:
    parsed = safe_integer(value)
    return parsed if parsed is not None and parsed >= 0 else None


def sanitize_observation(raw: dict[str, Any]) -> dict[str, Any]:
    """Return the only fields permitted at rest; unknown/raw fields are dropped."""
    authorization = raw.get("authorization_context")
    if not isinstance(authorization, dict):
        authorization = {}
    legacy_outcome = raw.get("legacy_outcome")
    if not isinstance(legacy_outcome, dict):
        legacy_outcome = {}
    shadow_side_effects = raw.get("shadow_side_effects")
    if not isinstance(shadow_side_effects, dict):
        shadow_side_effects = {}

    return {
        "event": safe_string(raw.get("event")),
        "contract": safe_string(raw.get("contract")),
        "mode": safe_string(raw.get("mode")),
        "tenant_ref": safe_hex_64(raw.get("tenant_ref")),
        "tenant_resolution": safe_string(raw.get("tenant_resolution")),
        "origin": safe_string(raw.get("origin")),
        "authorization_context": {
            key: safe_string(authorization.get(key))
            for key in AUTHORIZATION_CONTEXT
        },
        "legacy_action_class": safe_string(raw.get("legacy_action_class")),
        "preview_action_class": safe_string(raw.get("preview_action_class")),
        "capability": safe_string(raw.get("capability")),
        "capability_version": safe_integer(raw.get("capability_version")),
        "target_kind": safe_string(raw.get("target_kind")),
        "target_ref_hash": safe_hex_64(raw.get("target_ref_hash")),
        "normalized_input_hash": safe_hex_64(raw.get("normalized_input_hash")),
        "identity_fingerprint": safe_hex_64(raw.get("identity_fingerprint")),
        "request_idempotency_key_hash": safe_hex_64(
            raw.get("request_idempotency_key_hash")
        ),
        "policy_key": safe_string(raw.get("policy_key")),
        "policy_version": safe_integer(raw.get("policy_version")),
        "policy_decision": safe_string(raw.get("policy_decision")),
        "autonomy_level": safe_string(raw.get("autonomy_level")),
        "approval_requirement": safe_string(raw.get("approval_requirement")),
        "executor_key": safe_string(raw.get("executor_key")),
        "executor_version": safe_integer(raw.get("executor_version")),
        "legacy_outcome": {
            "success": (
                legacy_outcome.get("success")
                if isinstance(legacy_outcome.get("success"), bool)
                else None
            ),
            "code": safe_string(legacy_outcome.get("code"), limit=80),
            "http_status": safe_integer(legacy_outcome.get("http_status")),
            "unknown": (
                legacy_outcome.get("unknown")
                if isinstance(legacy_outcome.get("unknown"), bool)
                else None
            ),
        },
        "preview_external_side_effects": zero_side_effect(
            raw.get("preview_external_side_effects")
        ),
        "bridge_external_side_effects": zero_side_effect(
            raw.get("bridge_external_side_effects")
        ),
        "shadow_side_effects": {
            "crm_writes": zero_side_effect(shadow_side_effects.get("crm_writes")),
            "messages": zero_side_effect(shadow_side_effects.get("messages")),
            "campaigns": zero_side_effect(shadow_side_effects.get("campaigns")),
        },
    }


def evaluate_observation(observation: dict[str, Any]) -> tuple[str, list[str]]:
    reasons: list[str] = []
    action_class = observation.get("legacy_action_class")
    expected = ACTION_CLASSES.get(str(action_class))
    if expected is None:
        return "IGNORED", ["unsupported_or_excluded_action_class"]

    required_equalities = {
        "event": "legacy_appointment_shadow_observation",
        "contract": OBSERVATION_CONTRACT,
        "mode": "shadow",
        "tenant_resolution": "integration",
        "preview_action_class": expected["preview_action"],
        "capability": expected["capability"],
        "capability_version": 1,
        "target_kind": "appointment",
        "executor_key": expected["executor"],
        "executor_version": 1,
    }
    for field, expected_value in required_equalities.items():
        if observation.get(field) != expected_value:
            reasons.append(f"{field}_mismatch")

    for field in (
        "origin",
        "policy_key",
        "policy_decision",
        "autonomy_level",
        "approval_requirement",
    ):
        if safe_string(observation.get(field)) is None:
            reasons.append(f"{field}_missing")

    for field in (
        "tenant_ref",
        "target_ref_hash",
        "normalized_input_hash",
        "identity_fingerprint",
        "request_idempotency_key_hash",
    ):
        if safe_hex_64(observation.get(field)) is None:
            reasons.append(f"{field}_invalid")
    if safe_integer(observation.get("policy_version")) is None:
        reasons.append("policy_version_missing")
    if observation.get("approval_requirement") not in {"NONE", "REQUIRED"}:
        reasons.append("approval_requirement_invalid")

    authorization = observation.get("authorization_context")
    if not isinstance(authorization, dict):
        reasons.append("authorization_context_missing")
    else:
        for field, expected_value in AUTHORIZATION_CONTEXT.items():
            if authorization.get(field) != expected_value:
                reasons.append(f"authorization_{field}_mismatch")

    legacy_outcome = observation.get("legacy_outcome")
    if not isinstance(legacy_outcome, dict) or not isinstance(
        legacy_outcome.get("success"), bool
    ):
        reasons.append("legacy_outcome_missing")

    side_effect_fields = {
        "preview_external_side_effects": observation.get(
            "preview_external_side_effects"
        ),
        "bridge_external_side_effects": observation.get(
            "bridge_external_side_effects"
        ),
    }
    shadow_side_effects = observation.get("shadow_side_effects")
    if isinstance(shadow_side_effects, dict):
        side_effect_fields.update(
            {
                "shadow_crm_writes": shadow_side_effects.get("crm_writes"),
                "shadow_messages": shadow_side_effects.get("messages"),
                "shadow_campaigns": shadow_side_effects.get("campaigns"),
            }
        )
    else:
        reasons.append("shadow_side_effects_missing")
    for field, value in side_effect_fields.items():
        if value != 0:
            reasons.append(f"{field}_not_zero")

    return ("EQUIVALENT", []) if not reasons else ("DIVERGENT", sorted(set(reasons)))


class ObserverStore:
    def __init__(self, database_path: Path, summary_path: Path, source_unit: str):
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self.database_path = database_path
        self.summary_path = summary_path
        self.source_unit = source_unit
        self.connection = sqlite3.connect(database_path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        self._initialize()

    def close(self) -> None:
        self.connection.close()

    def _initialize(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS observer_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shadow_deliveries (
              journal_cursor TEXT PRIMARY KEY,
              journal_realtime_usec TEXT,
              received_at TEXT NOT NULL,
              action_class TEXT NOT NULL,
              tenant_ref TEXT NOT NULL,
              identity_fingerprint TEXT NOT NULL,
              request_idempotency_key_hash TEXT,
              verdict TEXT NOT NULL CHECK (verdict IN ('EQUIVALENT', 'DIVERGENT')),
              reason_codes_json TEXT NOT NULL,
              observation_json TEXT NOT NULL,
              preview_external_side_effects INTEGER,
              bridge_external_side_effects INTEGER,
              shadow_crm_writes INTEGER,
              shadow_messages INTEGER,
              shadow_campaigns INTEGER
            );

            CREATE TABLE IF NOT EXISTS logical_actions (
              tenant_ref TEXT NOT NULL,
              action_class TEXT NOT NULL,
              identity_fingerprint TEXT NOT NULL,
              first_cursor TEXT NOT NULL,
              last_cursor TEXT NOT NULL,
              deliveries INTEGER NOT NULL DEFAULT 1,
              verdict TEXT NOT NULL CHECK (verdict IN ('EQUIVALENT', 'DIVERGENT')),
              PRIMARY KEY (tenant_ref, action_class, identity_fingerprint)
            );
            """
        )
        if self.metadata("window_started_at") is None:
            self.set_metadata("window_started_at", utc_now())
        if self.metadata("parser_errors") is None:
            self.set_metadata("parser_errors", "0")
        if self.metadata("ignored_events") is None:
            self.set_metadata("ignored_events", "0")
        self.connection.commit()
        self.write_summary()

    def metadata(self, key: str) -> str | None:
        row = self.connection.execute(
            "SELECT value FROM observer_metadata WHERE key = ?", (key,)
        ).fetchone()
        return str(row["value"]) if row else None

    def set_metadata(self, key: str, value: str) -> None:
        self.connection.execute(
            """
            INSERT INTO observer_metadata(key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )

    def increment_metadata(self, key: str) -> None:
        current = int(self.metadata(key) or "0")
        self.set_metadata(key, str(current + 1))

    def set_baseline_cursor(self, cursor: str) -> None:
        self.set_metadata("journal_cursor", cursor)
        self.set_metadata("baseline_cursor_at", utc_now())
        self.connection.commit()
        self.write_summary()

    def process_journal_record(self, record: dict[str, Any]) -> bool:
        cursor = safe_string(record.get("__CURSOR"), limit=1024)
        if cursor is None:
            self.increment_metadata("parser_errors")
            self.connection.commit()
            self.write_summary()
            return False

        message = record.get("MESSAGE")
        observed = False
        with self.connection:
            marker_offset = (
                message.find(OBSERVATION_PREFIX) if isinstance(message, str) else -1
            )
            if marker_offset >= 0:
                encoded = message[marker_offset + len(OBSERVATION_PREFIX) :].lstrip()
                try:
                    raw, _suffix_offset = json.JSONDecoder().raw_decode(encoded)
                except (TypeError, ValueError):
                    raw = None
                if not isinstance(raw, dict):
                    self.increment_metadata("parser_errors")
                else:
                    observation = sanitize_observation(raw)
                    verdict, reasons = evaluate_observation(observation)
                    if verdict == "IGNORED":
                        self.increment_metadata("ignored_events")
                    else:
                        observed = self._record_delivery(
                            cursor=cursor,
                            journal_realtime_usec=safe_string(
                                record.get("__REALTIME_TIMESTAMP"), limit=64
                            ),
                            observation=observation,
                            verdict=verdict,
                            reasons=reasons,
                        )
            self.set_metadata("journal_cursor", cursor)
            timestamp = safe_string(record.get("__REALTIME_TIMESTAMP"), limit=64)
            if timestamp:
                self.set_metadata("journal_realtime_usec", timestamp)
            self.set_metadata("last_record_at", utc_now())
        self.write_summary()
        return observed

    def _record_delivery(
        self,
        *,
        cursor: str,
        journal_realtime_usec: str | None,
        observation: dict[str, Any],
        verdict: str,
        reasons: list[str],
    ) -> bool:
        action_class = str(observation["legacy_action_class"])
        tenant_ref = str(observation.get("tenant_ref") or "invalid")
        identity = str(observation.get("identity_fingerprint") or "invalid")
        shadow_effects = observation.get("shadow_side_effects")
        if not isinstance(shadow_effects, dict):
            shadow_effects = {}
        try:
            self.connection.execute(
                """
                INSERT INTO shadow_deliveries(
                  journal_cursor, journal_realtime_usec, received_at,
                  action_class, tenant_ref, identity_fingerprint,
                  request_idempotency_key_hash, verdict, reason_codes_json,
                  observation_json, preview_external_side_effects,
                  bridge_external_side_effects, shadow_crm_writes,
                  shadow_messages, shadow_campaigns
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    cursor,
                    journal_realtime_usec,
                    utc_now(),
                    action_class,
                    tenant_ref,
                    identity,
                    observation.get("request_idempotency_key_hash"),
                    verdict,
                    json.dumps(reasons, ensure_ascii=True, separators=(",", ":")),
                    json.dumps(
                        observation, ensure_ascii=True, sort_keys=True, separators=(",", ":")
                    ),
                    observation.get("preview_external_side_effects"),
                    observation.get("bridge_external_side_effects"),
                    shadow_effects.get("crm_writes"),
                    shadow_effects.get("messages"),
                    shadow_effects.get("campaigns"),
                ),
            )
        except sqlite3.IntegrityError:
            return False

        existing = self.connection.execute(
            """
            SELECT verdict FROM logical_actions
            WHERE tenant_ref = ? AND action_class = ? AND identity_fingerprint = ?
            """,
            (tenant_ref, action_class, identity),
        ).fetchone()
        if existing:
            aggregate_verdict = (
                "DIVERGENT"
                if verdict == "DIVERGENT" or existing["verdict"] == "DIVERGENT"
                else "EQUIVALENT"
            )
            self.connection.execute(
                """
                UPDATE logical_actions
                SET last_cursor = ?, deliveries = deliveries + 1, verdict = ?
                WHERE tenant_ref = ? AND action_class = ? AND identity_fingerprint = ?
                """,
                (cursor, aggregate_verdict, tenant_ref, action_class, identity),
            )
        else:
            self.connection.execute(
                """
                INSERT INTO logical_actions(
                  tenant_ref, action_class, identity_fingerprint,
                  first_cursor, last_cursor, deliveries, verdict
                ) VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (tenant_ref, action_class, identity, cursor, cursor, verdict),
            )
        return True

    def summary(self) -> dict[str, Any]:
        action_summary: dict[str, Any] = {}
        total_deliveries = 0
        total_unique = 0
        total_divergent = 0
        for action_class in ACTION_CLASSES:
            deliveries = int(
                self.connection.execute(
                    "SELECT COUNT(*) AS count FROM shadow_deliveries WHERE action_class = ?",
                    (action_class,),
                ).fetchone()["count"]
            )
            unique_actions = int(
                self.connection.execute(
                    "SELECT COUNT(*) AS count FROM logical_actions WHERE action_class = ?",
                    (action_class,),
                ).fetchone()["count"]
            )
            divergent = int(
                self.connection.execute(
                    """
                    SELECT COUNT(*) AS count FROM shadow_deliveries
                    WHERE action_class = ? AND verdict = 'DIVERGENT'
                    """,
                    (action_class,),
                ).fetchone()["count"]
            )
            verdict = (
                "DIVERGENT"
                if divergent > 0
                else "EQUIVALENT"
                if deliveries > 0
                else "NOT OBSERVED IN PRODUCTION"
            )
            action_summary[action_class] = {
                "verdict": verdict,
                "deliveries": deliveries,
                "unique_logical_actions": unique_actions,
                "duplicates_collapsed": max(0, deliveries - unique_actions),
                "divergent_deliveries": divergent,
            }
            total_deliveries += deliveries
            total_unique += unique_actions
            total_divergent += divergent

        effect_row = self.connection.execute(
            """
            SELECT
              COALESCE(SUM(preview_external_side_effects), 0) AS preview_effects,
              COALESCE(SUM(bridge_external_side_effects), 0) AS bridge_effects,
              COALESCE(SUM(shadow_crm_writes), 0) AS crm_writes,
              COALESCE(SUM(shadow_messages), 0) AS messages,
              COALESCE(SUM(shadow_campaigns), 0) AS campaigns,
              SUM(CASE WHEN preview_external_side_effects IS NULL
                        OR bridge_external_side_effects IS NULL
                        OR shadow_crm_writes IS NULL
                        OR shadow_messages IS NULL
                        OR shadow_campaigns IS NULL
                       THEN 1 ELSE 0 END) AS incomplete
            FROM shadow_deliveries
            """
        ).fetchone()
        parser_errors = int(self.metadata("parser_errors") or "0")
        ignored_events = int(self.metadata("ignored_events") or "0")
        all_observed = all(
            value["deliveries"] > 0 for value in action_summary.values()
        )
        overall_verdict = (
            "DIVERGENT"
            if total_divergent > 0 or parser_errors > 0
            else "EQUIVALENT"
            if all_observed
            else "OBSERVING"
        )
        return {
            "contract": SUMMARY_CONTRACT,
            "generated_at": utc_now(),
            "window_started_at": self.metadata("window_started_at"),
            "source_unit": self.source_unit,
            "mode": "passive_read_only",
            "cutover_performed": False,
            "attendance_in_scope": False,
            "action_classes": action_summary,
            "totals": {
                "deliveries": total_deliveries,
                "unique_logical_actions": total_unique,
                "duplicates_collapsed": max(0, total_deliveries - total_unique),
                "divergent_deliveries": total_divergent,
            },
            "shadow_side_effect_proof": {
                "preview_external_side_effects": int(effect_row["preview_effects"]),
                "bridge_external_side_effects": int(effect_row["bridge_effects"]),
                "bridge_crm_writes": int(effect_row["crm_writes"]),
                "bridge_messages": int(effect_row["messages"]),
                "bridge_campaigns": int(effect_row["campaigns"]),
                "incomplete_observations": int(effect_row["incomplete"] or 0),
                "external_actions_executed": 0,
            },
            "observer_health": {
                "parser_errors": parser_errors,
                "ignored_events": ignored_events,
                "last_record_at": self.metadata("last_record_at"),
                "baseline_cursor_at": self.metadata("baseline_cursor_at"),
                "journal_cursor_present": self.metadata("journal_cursor") is not None,
            },
            "overall_verdict": overall_verdict,
            "automatic_cutover_allowed": False,
        }

    def write_summary(self) -> None:
        atomic_json_write(self.summary_path, self.summary())


def current_journal_cursor(unit: str) -> str:
    result = subprocess.run(
        [
            "/usr/bin/journalctl",
            "--unit",
            unit,
            "--lines=0",
            "--show-cursor",
            "--no-pager",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    for line in reversed(result.stdout.splitlines()):
        marker = "-- cursor: "
        if line.startswith(marker):
            cursor = line[len(marker) :].strip()
            if cursor:
                return cursor
    raise RuntimeError("journal_baseline_cursor_unavailable")


def follow_journal(store: ObserverStore) -> int:
    global FOLLOW_PROCESS

    cursor = store.metadata("journal_cursor")
    if cursor is None:
        cursor = current_journal_cursor(store.source_unit)
        store.set_baseline_cursor(cursor)
        print("organic shadow observer baseline established", flush=True)

    command = [
        "/usr/bin/journalctl",
        "--unit",
        store.source_unit,
        "--follow",
        "--output=json",
        "--no-pager",
        f"--after-cursor={cursor}",
    ]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    FOLLOW_PROCESS = process
    assert process.stdout is not None
    for line in process.stdout:
        if STOP_REQUESTED:
            process.terminate()
            break
        try:
            record = json.loads(line)
        except ValueError:
            store.increment_metadata("parser_errors")
            store.connection.commit()
            store.write_summary()
            continue
        if isinstance(record, dict):
            store.process_journal_record(record)
    result = process.wait(timeout=10)
    FOLLOW_PROCESS = None
    return result


def request_stop(_signum: int, _frame: Any) -> None:
    global STOP_REQUESTED
    STOP_REQUESTED = True
    if FOLLOW_PROCESS is not None and FOLLOW_PROCESS.poll() is None:
        FOLLOW_PROCESS.terminate()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("/var/lib/maya-shadow-observer/observer.sqlite3"),
    )
    parser.add_argument(
        "--summary",
        type=Path,
        default=Path("/var/lib/maya-shadow-observer/summary.json"),
    )
    parser.add_argument("--unit", default="maya-saas.service")
    parser.add_argument("--status", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    store = ObserverStore(args.database, args.summary, args.unit)
    try:
        if args.status:
            print(json.dumps(store.summary(), ensure_ascii=False, indent=2))
            return 0
        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)
        result = follow_journal(store)
        return 0 if STOP_REQUESTED else result or 1
    finally:
        store.close()


if __name__ == "__main__":
    sys.exit(main())
