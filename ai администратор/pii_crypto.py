"""
Шифрование персональных данных в локальной БД.

Зачем: защита at rest. Если кто-то получит копию barbershop.db (украл файл,
бэкап утёк, и т.п.) — без ключа шифрования из config.py имя и телефон
клиента не прочитать.

Алгоритм:
  • Fernet — симметричное шифрование (AES-128-CBC + HMAC-SHA256). Стандартное,
    проверенное, библиотека cryptography. Каждое значение получает свой
    nonce + timestamp, поэтому одно и то же имя шифруется разными байтами.

  • Для телефона дополнительно храним HMAC-SHA256 от 10 последних цифр
    («phone_hash»). Это позволяет быстро искать клиента по телефону без
    расшифровки всех записей. HMAC детерминированный — один телефон даёт
    одинаковый хеш всегда, но обратной операции нет (без перебора).

Что НЕ защищает:
  • Атаку с доступом и к БД, и к config.py (ключ-то рядом). Это «приличный
    стандарт», а не НSM-уровень. Для нашего профиля рисков достаточно.
  • Содержание AI-промптов и логов — там действует анонимайзер отдельно.
"""
from __future__ import annotations

import hashlib
import hmac
import logging

from cryptography.fernet import Fernet, InvalidToken

from config import PII_ENCRYPTION_KEY

logger = logging.getLogger(__name__)

_fernet = Fernet(PII_ENCRYPTION_KEY.encode() if isinstance(PII_ENCRYPTION_KEY, str) else PII_ENCRYPTION_KEY)


def encrypt(plain: str | None) -> str | None:
    """Шифрует строку. Пустая/None → None (чтобы NULL в БД остался NULL)."""
    if plain is None or plain == "":
        return None
    if not isinstance(plain, str):
        plain = str(plain)
    return _fernet.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt(token: str | None) -> str | None:
    """
    Расшифровывает Fernet-токен. None / пусто → None.
    Если токен битый или зашифрован другим ключом — возвращает None и логирует.
    """
    if not token:
        return None
    try:
        return _fernet.decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.error("Не удалось расшифровать PII-токен — возможно, ключ сменился")
        return None
    except Exception as e:
        logger.error(f"PII decrypt error: {e}")
        return None


def hash_phone(phone: str | None) -> str | None:
    """
    Детерминированный HMAC-SHA256 от нормализованного телефона.
    Используется для поиска клиента по телефону без расшифровки.
    Берём последние 10 цифр — чтобы +7 / 8 / без префикса давали одинаковый хеш.
    """
    if not phone:
        return None
    digits = "".join(c for c in str(phone) if c.isdigit())
    if not digits:
        return None
    canonical = digits[-10:]  # последние 10 — отбрасываем код страны
    if not canonical:
        return None
    key_bytes = (
        PII_ENCRYPTION_KEY.encode()
        if isinstance(PII_ENCRYPTION_KEY, str)
        else PII_ENCRYPTION_KEY
    )
    return hmac.new(key_bytes, canonical.encode(), hashlib.sha256).hexdigest()
