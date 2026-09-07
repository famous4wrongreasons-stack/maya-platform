"""Compatibility refusal; only the existing reviewed B35 campaign may send.

An R02 staff session, a scheduler tick and a legacy subscription row are not
campaign approval. This module performs no IO and never resolves an audience.
"""


def retention_owner_required(job: str) -> dict:
    if job not in {"reactivation", "cycle", "subscriptions"}:
        raise ValueError("Unsupported retention entry")
    return {
        "ok": False,
        "job": job,
        "status": "not_executed",
        "error": "B35_CANONICAL_OWNER_REQUIRED",
        "disabled": "canonical_action_engine_required",
        "canonical_owner": "B35",
        "requires_review": True,
        "sent": 0,
        "renew_pushed": 0,
        "synced": 0,
        "expired": 0,
        "candidates": 0,
        "blocked": 0,
        "errors": 0,
        "delivery_attempts": 0,
        "business_mutations": 0,
        "message": (
            "Рассылка не отправлена. Откройте раздел рассылок в Панели MAYA "
            "и подтвердите аудиторию и текст. Автоматическая отправка и "
            "подтверждение через эту команду недоступны."
        ),
    }
