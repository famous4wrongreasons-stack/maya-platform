"""Local speech-to-text for MAYA voice messages.

The model is loaded lazily and inference is serialized so a small production VPS
cannot run several memory-heavy Whisper jobs at once.
"""
from __future__ import annotations

import importlib.util
import logging
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

try:
    import config as _cfg
except Exception:  # pragma: no cover
    _cfg = None

logger = logging.getLogger(__name__)

_MODEL: Any = None
_MODEL_SIGNATURE: tuple[Any, ...] | None = None
_MODEL_LOCK = threading.Lock()
_INFERENCE_LOCK = threading.Lock()


def _cfg_value(name: str, default: Any) -> Any:
    env_value = os.getenv(name)
    if env_value not in (None, ""):
        return env_value
    if _cfg is not None and hasattr(_cfg, name):
        return getattr(_cfg, name)
    return default


def _cfg_int(name: str, default: int) -> int:
    try:
        return int(_cfg_value(name, default))
    except (TypeError, ValueError):
        return default


def _cfg_float(name: str, default: float) -> float:
    try:
        return float(_cfg_value(name, default))
    except (TypeError, ValueError):
        return default


def is_available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


def audio_suffix(raw: bytes) -> str:
    if raw[:4] == b"\x1aE\xdf\xa3":
        return ".webm"
    if len(raw) >= 8 and raw[4:8] == b"ftyp":
        return ".mp4"
    if raw[:4] == b"OggS":
        return ".ogg"
    if raw[:4] == b"RIFF":
        return ".wav"
    if raw[:3] == b"ID3" or (
        len(raw) >= 2 and raw[0] == 0xFF and (raw[1] & 0xE0) == 0xE0
    ):
        return ".mp3"
    return ".webm"


def _download_root() -> Path:
    configured = str(_cfg_value("VOICE_STT_LOCAL_CACHE_DIR", "")).strip()
    root = Path(configured).expanduser() if configured else Path(__file__).with_name(".cache") / "faster-whisper"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _get_model() -> Any:
    global _MODEL, _MODEL_SIGNATURE
    model_name = str(_cfg_value("VOICE_STT_LOCAL_MODEL", "base")).strip() or "base"
    cpu_threads = max(1, min(_cfg_int("VOICE_STT_CPU_THREADS", 2), os.cpu_count() or 1))
    compute_type = str(_cfg_value("VOICE_STT_COMPUTE_TYPE", "int8")).strip() or "int8"
    signature = (model_name, cpu_threads, compute_type, str(_download_root()))
    if _MODEL is not None and _MODEL_SIGNATURE == signature:
        return _MODEL

    with _MODEL_LOCK:
        if _MODEL is not None and _MODEL_SIGNATURE == signature:
            return _MODEL
        from faster_whisper import WhisperModel

        started = time.monotonic()
        _MODEL = WhisperModel(
            model_name,
            device="cpu",
            compute_type=compute_type,
            cpu_threads=cpu_threads,
            num_workers=1,
            download_root=str(_download_root()),
        )
        _MODEL_SIGNATURE = signature
        logger.info(
            "local_stt model loaded model=%s compute=%s threads=%s elapsed=%.2fs",
            model_name,
            compute_type,
            cpu_threads,
            time.monotonic() - started,
        )
        return _MODEL


def _probe_duration(path: str) -> float | None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=8,
        )
        return float(result.stdout.strip())
    except (FileNotFoundError, subprocess.SubprocessError, TypeError, ValueError):
        return None


def preload() -> None:
    """Download and initialize the configured model before serving traffic."""
    _get_model()


def transcribe(raw: bytes, *, initial_prompt: str = "") -> str | None:
    if not raw:
        return None
    max_bytes = max(256 * 1024, _cfg_int("VOICE_STT_MAX_BYTES", 8 * 1024 * 1024))
    if len(raw) > max_bytes:
        logger.warning("local_stt rejected audio bytes=%s limit=%s", len(raw), max_bytes)
        return None

    path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=audio_suffix(raw), delete=False) as audio_file:
            audio_file.write(raw)
            path = audio_file.name

        duration = _probe_duration(path)
        max_seconds = max(1.0, _cfg_float("VOICE_STT_MAX_SECONDS", 30.0))
        if duration is not None and duration > max_seconds:
            logger.warning("local_stt rejected duration=%.2fs limit=%.2fs", duration, max_seconds)
            return None

        queue_timeout = max(0.1, _cfg_float("VOICE_STT_QUEUE_TIMEOUT_SECONDS", 25.0))
        if not _INFERENCE_LOCK.acquire(timeout=queue_timeout):
            logger.warning("local_stt queue timeout after %.2fs", queue_timeout)
            return None
        try:
            started = time.monotonic()
            model = _get_model()
            hotwords = str(
                _cfg_value(
                    "VOICE_STT_HOTWORDS",
                    "MAYA Майя YClients запись записаться окошко календарь услуга специалист мастер расписание",
                )
            ).strip()
            if initial_prompt:
                hotwords = f"{hotwords} {initial_prompt}".strip()[:500]
            segments, _ = model.transcribe(
                path,
                language="ru",
                task="transcribe",
                beam_size=max(1, _cfg_int("VOICE_STT_BEAM_SIZE", 5)),
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 400},
                condition_on_previous_text=False,
                initial_prompt=(initial_prompt or "")[:300] or None,
                hotwords=hotwords or None,
            )
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
            logger.info(
                "local_stt completed duration=%s elapsed=%.2fs chars=%s",
                f"{duration:.2f}s" if duration is not None else "unknown",
                time.monotonic() - started,
                len(text),
            )
            return text or None
        finally:
            _INFERENCE_LOCK.release()
    except Exception as exc:
        logger.error("local_stt failed: %s", exc)
        return None
    finally:
        if path:
            try:
                os.remove(path)
            except OSError:
                pass
