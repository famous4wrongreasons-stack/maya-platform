"""B7 authenticated transport. Request authority never comes from model arguments."""
from __future__ import annotations
import contextvars
import functools
import hashlib
import json
import os
from dataclasses import dataclass
import requests


@dataclass(frozen=True)
class ClientCommandContext:
    proof: str
    intent: str


_current = contextvars.ContextVar("maya_client_command_context", default=None)
_ordinal = contextvars.ContextVar("maya_client_habit_ordinal", default=0)


def request_context(headers, body: dict, message: str, mode: str):
    if mode != "client" or not isinstance(message, str) or not message.strip():
        return None
    from legacy_client_command_bridge import channel_proof
    try:
        proof = channel_proof(headers, body)
    except ValueError:
        return None
    # The request's statement, not an AI-generated tool id, survives HTTP/model retries.
    # Exact Client/link qualification and keyed fingerprints are derived by Maya.
    intent = hashlib.sha256(message.encode("utf-8")).hexdigest()
    return ClientCommandContext(proof, intent)


def authenticated_call(function):
    @functools.wraps(function)
    def wrapped(*args, **kwargs):
        context = kwargs.pop("_client_command_context", None)
        token = _current.set(context if isinstance(context, ClientCommandContext) else None)
        ordinal = _ordinal.set(0)
        try:
            return function(*args, **kwargs)
        finally:
            _ordinal.reset(ordinal)
            _current.reset(token)
    return wrapped


def authenticated_stream(function):
    @functools.wraps(function)
    def wrapped(*args, **kwargs):
        context = kwargs.pop("_client_command_context", None)
        token = _current.set(context if isinstance(context, ClientCommandContext) else None)
        ordinal = _ordinal.set(0)
        try:
            yield from function(*args, **kwargs)
        finally:
            _ordinal.reset(ordinal)
            _current.reset(token)
    return wrapped


def command(operation: str, proof: str, payload: dict) -> dict:
    if operation not in {"read", "add", "binding"}:
        raise ValueError("unsupported_client_habit_operation")
    from config import YCLIENTS_COMPANY_ID
    token = os.getenv("MAYA_LEGACY_APPOINTMENT_BRIDGE_TOKEN", "").strip()
    if not token:
        raise RuntimeError("client_habits_unavailable")
    response = requests.post(
        "http://127.0.0.1:3107/api/internal/legacy/client-habits/" + operation,
        headers={"x-maya-legacy-bridge": token},
        json={"provider": "yclients", "externalCompanyId": str(YCLIENTS_COMPANY_ID),
              "channelProof": proof, "payload": payload}, timeout=8,
    )
    if response.status_code >= 400:
        try:
            error = response.json()
        except ValueError:
            error = {}
        if isinstance(error, dict) and error.get("code") == "CLIENT_PREFERENCES_LIMIT_EXCEEDED":
            raise ValueError("CLIENT_PREFERENCES_LIMIT_EXCEEDED")
        raise ValueError("client_link_required" if response.status_code in (400, 401, 403, 404) else "client_habits_retry_required")
    result = response.json()
    if not isinstance(result, dict):
        raise RuntimeError("invalid_client_habits_response")
    return result


def read_preferences() -> str:
    context = _current.get()
    if context is None:
        return ""
    try:
        result = command("read", context.proof, {})
        preferences = result.get("preferences")
        if not isinstance(preferences, list) or any(not isinstance(x, str) for x in preferences):
            return ""
        import anonymizer
        return anonymizer.redact_pii("\n".join(preferences))
    except (ValueError, RuntimeError, requests.RequestException):
        return ""


def remember_preference(preference: str) -> dict:
    context = _current.get()
    if context is None:
        return {"error": "client_link_required", "saved": False,
                "instruction": "Нужна подтверждённая привязка клиента. Ничего не сохранено."}
    ordinal = _ordinal.get()
    _ordinal.set(ordinal + 1)
    try:
        state = command("read", context.proof, {})
        generation = state.get("expectedGeneration")
        if type(generation) is not int or generation < 0:
            raise ValueError("client_habits_unavailable")
        result = command("add", context.proof, {
            "preference": preference,
            "expectedGeneration": generation,
            "idempotencyKey": "habit:" + context.intent + ":" + str(ordinal),
        })
        return {"saved": True, "outcome": result.get("outcome"),
                "instruction": "Подтверди сохранение только этого явно сказанного предпочтения."}
    except (ValueError, RuntimeError, requests.RequestException) as error:
        limit = str(error) == "CLIENT_PREFERENCES_LIMIT_EXCEEDED"
        return {"saved": False,
                "error": "CLIENT_PREFERENCES_LIMIT_EXCEEDED" if limit else "client_link_or_retry_required",
                "instruction": ("Лимит предпочтений превышен. Прежние записи сохранены без изменений. "
                                "Не сокращай, не удаляй и не суммаризируй их автоматически.") if limit else
                               "Предпочтение не сохранено. Нужна проверенная привязка или повтор исходной команды."}
