"""
web_auth.py — вход в веб-приложение БЕЗ Telegram (и, значит, без VPN).

Два способа, оба сводятся к номеру телефона как ключу к YClients:
  • Телефон + код  — SMS.ru: сначала звонок-пароль (flash-call, код = последние
                     цифры входящего номера), при неудаче — обычная SMS.
  • VK ID          — Authorization Code Flow: фронт получает code, сервер меняет
                     его на токен по защищённому ключу, узнаёт пользователя.
  • Yandex ID      — Authorization Code Flow: фронт просит у сервера auth_url,
                     сервер меняет code на токен и узнаёт Yandex-профиль.

Сетевые вызовы (SMS.ru, VK, Yandex) идут НАПРЯМУЮ — это российские сервисы, доступные
с РФ-сервера без прокси (в отличие от Telegram и Claude).

В Claude/модель отсюда ничего не уходит — только телефон/VK/Yandex для идентификации.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import urllib.parse

import httpx

import config
import database
import pii_crypto

logger = logging.getLogger(__name__)

# ─── Параметры ──────────────────────────────────────────────────────────
CODE_TTL_MINUTES = 5          # код подтверждения живёт 5 минут
SESSION_TTL_DAYS = 30         # сессия в браузере — 30 дней
SMS_CODE_DIGITS = 4           # длина кода для SMS-фолбэка

_SMSRU_BASE = "https://sms.ru"
_YC_BASE = getattr(config, "YCLIENTS_BASE_URL", "https://api.yclients.com/api/v1")
def _yc_headers() -> dict:
    return {
        "Authorization": f"Bearer {config.YCLIENTS_PARTNER_TOKEN}, User {config.YCLIENTS_USER_TOKEN}",
        "Accept": "application/vnd.yclients.v2+json",
        "Content-Type": "application/json",
    }
# Классический VK OAuth (тип приложения «Веб-сайт», обмен по client_secret).
# Если VK потребует новый VK ID/PKCE — поменяем только эти два адреса.
# VK ID (OAuth 2.1 + PKCE) — id.vk.com. Старый oauth.vk.com VK отключает,
# и он не видит redirect, заданный в новом VK ID-кабинете. Поэтому id.vk.com.
_VKID_TOKEN_URL = "https://id.vk.com/oauth2/auth"
_VKID_USERINFO_URL = "https://id.vk.com/oauth2/user_info"
_YANDEX_AUTH_URL = "https://oauth.yandex.com/authorize"
_YANDEX_TOKEN_URL = "https://oauth.yandex.com/token"
_YANDEX_USERINFO_URL = "https://login.yandex.ru/info"


# ─── Утилиты ────────────────────────────────────────────────────────────
def _hash_code(phone_hash: str, code: str) -> str:
    """Детерминированный хеш кода, привязанный к телефону (phone_hash —
    уже секретный HMAC, поэтому его и используем как соль)."""
    return hashlib.sha256(f"{phone_hash}:{code}".encode()).hexdigest()


def _digits(phone: str) -> str:
    return "".join(c for c in str(phone or "") if c.isdigit())


def normalize_phone(phone: str) -> str | None:
    """Приводит телефон к формату 7XXXXXXXXXX (11 цифр). None — если мусор."""
    d = _digits(phone)
    if len(d) < 10:
        return None
    d = d[-10:]                       # последние 10 — национальный номер
    return "7" + d


def mask_phone(phone: str) -> str:
    d = _digits(phone)
    if len(d) < 4:
        return "•••"
    return f"+7 ••• ••• •• {d[-2:]}"


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _enabled_bool(name: str, default: bool = False) -> bool:
    value = getattr(config, name, default)
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


# ─── Телефонный вход ────────────────────────────────────────────────────
async def start_phone_login(phone: str, client_ip: str = "-1") -> dict:
    """Отправляет SMS-код через YClients (book_code). Код генерит и шлёт сам
    YClients; проверка — в verify_phone_login через /user/auth. SMS.ru не нужен."""
    norm = normalize_phone(phone)
    if not norm:
        return {"ok": False, "error": "bad_phone"}
    cid = getattr(config, "YCLIENTS_COMPANY_ID", 0)
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.post(f"{_YC_BASE}/book_code/{cid}",
                               headers=_yc_headers(), json={"phone": norm})
        data = r.json()
        if data.get("success"):
            logger.info("web_auth: YClients SMS-код отправлен на %s", mask_phone(norm))
            return {"ok": True, "channel": "sms", "mask": mask_phone(norm)}
        logger.error("web_auth: YClients book_code отказ: %s", data)
        return {"ok": False, "error": "sms_send_failed"}
    except Exception as e:
        logger.error("web_auth: YClients book_code ошибка: %s", e)
        return {"ok": False, "error": "sms_send_failed"}


async def verify_phone_login(phone: str, code: str) -> dict:
    """Проверяет SMS-код через YClients (/user/auth). При успехе выдаёт сессию
    (привязка по телефону; если клиент уже есть в боте — и к его chat_id)."""
    norm = normalize_phone(phone)
    code = "".join(c for c in str(code or "") if c.isdigit())
    if not norm or not code:
        return {"ok": False, "error": "bad_input"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.post(f"{_YC_BASE}/user/auth",
                               headers=_yc_headers(), json={"phone": norm, "code": code})
        data = r.json()
    except Exception as e:
        logger.error("web_auth: YClients user/auth ошибка: %s", e)
        return {"ok": False, "error": "verify_failed"}
    if not data.get("success"):
        return {"ok": False, "error": "wrong_code"}
    name = ((data.get("data") or {}).get("name") or "").strip()
    return _issue_session(phone=norm, vk_user_id=None, yandex_user_id=None, name=name)


async def verify_phone_evidence(phone: str, code: str) -> dict:
    """B8 possession evidence only: no session, Client lookup or contact write."""
    norm = normalize_phone(phone)
    if not norm or not isinstance(code, str) or not code.isascii() or not code.isdigit() or not 4 <= len(code) <= 8:
        return {"ok": False, "error": "bad_input"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            response = await cli.post(f"{_YC_BASE}/user/auth", headers=_yc_headers(),
                                      json={"phone": norm, "code": code})
        data = response.json()
        if response.status_code >= 400 or not isinstance(data, dict) or not data.get("success"):
            return {"ok": False, "error": "wrong_code"}
        return {"ok": True, "phone_evidence_only": True}
    except Exception:
        return {"ok": False, "error": "verify_failed"}


# ─── VK ID ──────────────────────────────────────────────────────────────
async def exchange_vk_code(code: str, redirect_uri: str | None = None,
                           code_verifier: str = "", device_id: str = "") -> dict:
    """
    VK ID (OAuth 2.1 + PKCE): меняет code на access_token и узнаёт пользователя.
    Нужны code_verifier (PKCE, вместо client_secret) и device_id (его VK ID
    возвращает на redirect вместе с code). Телефон приходит в user_info, только
    если выдан scope `phone` — тогда привяжем к YClients; иначе спросим отдельно.
    Возвращает {"ok": bool, "vk_user_id": int?, "name": str?, "phone": str?, "error": str?}.
    """
    if not code:
        return {"ok": False, "error": "no_code"}
    if not code_verifier or not device_id:
        return {"ok": False, "error": "vk_missing_pkce"}
    app_id = getattr(config, "VK_APP_ID", 0)
    redirect = redirect_uri or getattr(config, "VK_REDIRECT_URI", "") or ""
    if not app_id:
        return {"ok": False, "error": "vk_not_configured"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.post(_VKID_TOKEN_URL, data={
                "grant_type": "authorization_code",
                "code": code,
                "code_verifier": code_verifier,
                "client_id": str(app_id),
                "device_id": device_id,
                "redirect_uri": redirect,
            })
        tok = r.json()
        access_token = tok.get("access_token")
        # vk_user_id берём из ответа token-endpoint VK (server-to-server, привязан к
        # выданному токену) — он же уйдёт в staff-эскалацию _issue_session. Это
        # доверенный источник; присланный клиентом id здесь вообще не участвует.
        vk_user_id = tok.get("user_id")
        if not access_token or not vk_user_id:
            logger.error("web_auth: VK ID обмен кода не удался: %s", tok)
            return {"ok": False, "error": tok.get("error_description")
                    or tok.get("error") or "vk_exchange_failed"}

        # Профиль: имя + телефон (телефон — только при scope phone).
        name, phone = "", None
        try:
            async with httpx.AsyncClient(timeout=15.0) as cli:
                ur = await cli.post(_VKID_USERINFO_URL, data={
                    "client_id": str(app_id), "access_token": access_token,
                })
            u = (ur.json() or {}).get("user") or {}
            name = ((u.get("first_name") or "") + " " + (u.get("last_name") or "")).strip()
            phone = u.get("phone")
        except Exception as e:
            logger.warning("web_auth: VK ID user_info ошибка: %s", e)

        return {"ok": True, "vk_user_id": int(vk_user_id), "name": name,
                "phone": phone}
    except Exception as e:
        logger.error("web_auth: VK ID обмен ошибка: %s", e)
        return {"ok": False, "error": "vk_exchange_failed"}


def issue_vk_session(vk_user_id: int, name: str = "", phone: str | None = None) -> dict:
    """Выдаёт сессию для VK-пользователя. Если телефон известен — привязываем к
    YClients; если нет — сессия «без телефона», фронт попросит номер отдельно."""
    return _issue_session(phone=phone, vk_user_id=vk_user_id, yandex_user_id=None, name=name)


async def vk_session_from_token(access_token: str, vk_user_id, name: str = "") -> dict:
    """Сессия из готового access_token, полученного VK ID SDK (exchangeCode на клиенте,
    виджет OAuthList — «Войти через приложение ВК»). Узнаём имя/телефон через user_info
    и выдаём ту же веб-сессию, что и issue_vk_session.

    БЕЗОПАСНОСТЬ: личность (vk_user_id) берётся ТОЛЬКО из ответа VK user_info на этот
    токен — то есть криптографически привязана к access_token. Присланный клиентом
    user_id служит лишь для сверки; при расхождении запрос отклоняется. Иначе знание
    чужого числового VK-id позволило бы выписать staff-сессию через VK_STAFF_CHAT_MAP
    (см. _issue_session), не владея аккаунтом этого сотрудника."""
    # Заявленный клиентом id — недоверенный вход; держим отдельно от проверенного.
    try:
        claimed_id = int(vk_user_id)
    except (TypeError, ValueError):
        claimed_id = None

    app_id = getattr(config, "VK_APP_ID", 0)
    if not access_token or not app_id:
        # Без действительного токена доверять присланному user_id нельзя — отказ.
        return {"ok": False, "error": "vk_token_required"}

    # Единственный источник истины о личности — ответ VK на этот access_token.
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            ur = await cli.post(_VKID_USERINFO_URL, data={
                "client_id": str(app_id), "access_token": access_token,
            })
        u = (ur.json() or {}).get("user") or {}
    except Exception as e:
        logger.warning("web_auth: VK SDK user_info ошибка: %s", e)
        return {"ok": False, "error": "vk_userinfo_failed"}

    # VK ID отдаёт идентификатор в user.user_id (строкой); legacy-API — в user.id.
    try:
        verified_id = int(u.get("user_id") or u.get("id"))
    except (TypeError, ValueError):
        verified_id = None
    if not verified_id:
        logger.warning("web_auth: VK SDK user_info без user_id: %s", u)
        return {"ok": False, "error": "vk_userinfo_failed"}

    # Клиент не вправе подставлять чужой user_id: сверяем с тем, что вернул VK.
    if claimed_id is not None and claimed_id != verified_id:
        logger.warning("web_auth: VK SDK user_id mismatch — заявлен %s, токен принадлежит %s",
                       claimed_id, verified_id)
        return {"ok": False, "error": "vk_user_id_mismatch"}

    nm = (name or "") or ((u.get("first_name") or "") + " " + (u.get("last_name") or "")).strip()
    phone = u.get("phone")
    return issue_vk_session(verified_id, name=nm, phone=phone)


# ─── Yandex ID ─────────────────────────────────────────────────────────
def build_yandex_auth_url(state: str, redirect_uri: str | None = None) -> dict:
    """Готовит URL для Yandex ID OAuth. Секреты остаются на сервере."""
    client_id = str(getattr(config, "YANDEX_CLIENT_ID", "") or "").strip()
    redirect = redirect_uri or getattr(config, "YANDEX_REDIRECT_URI", "") or ""
    if not _enabled_bool("YANDEX_LOGIN_ENABLED") or not client_id:
        return {"ok": False, "error": "yandex_not_configured"}
    if not state:
        return {"ok": False, "error": "bad_state"}
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect,
        "state": state,
        "scope": "login:info login:email login:avatar",
        "optional_scope": "login:default_phone",
    }
    return {"ok": True, "auth_url": _YANDEX_AUTH_URL + "?" + urllib.parse.urlencode(params)}


async def exchange_yandex_code(code: str, redirect_uri: str | None = None) -> dict:
    """Меняет code Yandex ID на профиль пользователя."""
    if not code:
        return {"ok": False, "error": "no_code"}
    client_id = str(getattr(config, "YANDEX_CLIENT_ID", "") or "").strip()
    client_secret = str(getattr(config, "YANDEX_CLIENT_SECRET", "") or "").strip()
    if not _enabled_bool("YANDEX_LOGIN_ENABLED") or not client_id or not client_secret:
        return {"ok": False, "error": "yandex_not_configured"}

    try:
        token_payload = {
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
        }
        redirect = str(redirect_uri or "").strip()
        if redirect:
            token_payload["redirect_uri"] = redirect
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.post(_YANDEX_TOKEN_URL, data=token_payload)
            tok = r.json()
            access_token = tok.get("access_token")
            if not access_token:
                logger.error("web_auth: Yandex ID обмен кода не удался: %s", tok)
                return {"ok": False, "error": tok.get("error_description")
                        or tok.get("error") or "yandex_exchange_failed"}
            ur = await cli.get(
                _YANDEX_USERINFO_URL,
                params={"format": "json"},
                headers={"Authorization": f"OAuth {access_token}", "Accept": "application/json"},
            )
            user = ur.json() or {}
    except Exception as e:
        logger.error("web_auth: Yandex ID обмен ошибка: %s", e)
        return {"ok": False, "error": "yandex_exchange_failed"}

    yandex_user_id = str(user.get("id") or user.get("uid") or "").strip()
    if not yandex_user_id:
        logger.error("web_auth: Yandex ID user_info без id: %s", user)
        return {"ok": False, "error": "yandex_userinfo_failed"}

    email = (user.get("default_email") or user.get("email") or "").strip()
    if not email:
        emails = user.get("emails") or []
        if isinstance(emails, list) and emails:
            email = str(emails[0] or "").strip()
    name = (
        (user.get("real_name") or "").strip()
        or (user.get("display_name") or "").strip()
        or ((user.get("first_name") or "") + " " + (user.get("last_name") or "")).strip()
        or email
        or (user.get("login") or "").strip()
    )
    raw_phone = user.get("default_phone")
    if isinstance(raw_phone, dict):
        raw_phone = raw_phone.get("number")
    phone = normalize_phone(raw_phone or "")
    avatar = ""
    if user.get("default_avatar_id") and not user.get("is_avatar_empty"):
        avatar = f"https://avatars.yandex.net/get-yapic/{user.get('default_avatar_id')}/islands-200"
    return {
        "ok": True,
        "yandex_user_id": yandex_user_id,
        "name": name,
        "email": email,
        "phone": phone,
        "avatar_url": avatar,
    }


def issue_yandex_session(yandex_user_id: str, name: str = "",
                         phone: str | None = None, email: str = "",
                         avatar_url: str = "") -> dict:
    """Выдаёт сессию для Yandex ID. Staff можно сматчить по user_id или email."""
    return _issue_session(
        phone=phone,
        vk_user_id=None,
        yandex_user_id=str(yandex_user_id or ""),
        name=name,
        email=email,
        avatar_url=avatar_url,
    )


# ─── Сессии ─────────────────────────────────────────────────────────────
def _issue_session(*, phone: str | None, vk_user_id: int | None,
                   yandex_user_id: str | None,
                   name: str, email: str = "", avatar_url: str = "") -> dict:
    """Общая выдача сессии. Если телефон сматчился с Telegram-клиентом —
    подставляем его chat_id, и кабинет работает как в Telegram."""
    phone_hash = pii_crypto.hash_phone(phone) if phone else None
    chat_id = None
    display = name or ""
    if phone:
        client = database.find_client_by_phone(phone)
        if client:
            chat_id = client.get("telegram_chat_id") or client.get("chat_id")
            display = display or client.get("name", "")

    # Известные сотрудники по VK-id (вход через ВК телефон не отдаёт) → их Telegram
    # chat_id. Тогда владелец/мастер видит панель и кабинет, заходя через ВК без VPN.
    #
    # БЕЗОПАСНОСТЬ: vk_user_id, попадающий сюда, ОБЯЗАН быть уже сверен с VK на стороне
    # сервера — token-endpoint в exchange_vk_code либо user_info в vk_session_from_token.
    # Иначе знание чужого числового id давало бы staff-сессию. Дополнительно эскалацию
    # до staff включаем только при VK_LOGIN_ENABLED: пока VK-вход выключен, карта может
    # быть заполнена «на будущее», а путь /api/auth/vk-sdk уже задеплоен и открыт.
    if (not chat_id and vk_user_id
            and _enabled_bool("VK_LOGIN_ENABLED")):
        staff_map = getattr(config, "VK_STAFF_CHAT_MAP", {}) or {}
        mapped = staff_map.get(int(vk_user_id)) or staff_map.get(str(vk_user_id))
        if mapped:
            chat_id = int(mapped)

    if (not chat_id and yandex_user_id
            and _enabled_bool("YANDEX_LOGIN_ENABLED")):
        staff_map = getattr(config, "YANDEX_STAFF_CHAT_MAP", {}) or {}
        mapped = (staff_map.get(str(yandex_user_id))
                  or staff_map.get((email or "").strip().lower()))
        if mapped:
            chat_id = int(mapped)

    subject_kind = "client"
    if chat_id:
        try:
            if database.is_admin(int(chat_id)) or database.get_master_by_chat_id(int(chat_id)):
                subject_kind = "staff"
        except Exception:
            subject_kind = "client"

    token = _new_token()
    database.create_web_session(
        token,
        phone_hash=phone_hash,
        chat_id=int(chat_id) if chat_id else None,
        vk_user_id=int(vk_user_id) if vk_user_id else None,
        yandex_user_id=str(yandex_user_id) if yandex_user_id else None,
        display_name=display,
        tg_photo_url=avatar_url or "",
        subject_kind=subject_kind,
        ttl_days=SESSION_TTL_DAYS,
    )
    return {
        "ok": True,
        "token": token,
        "identity": {
            "has_phone": bool(phone),
            "known_client": bool(chat_id),
            "subject_kind": subject_kind,
            "is_staff": subject_kind == "staff",
            "name": display,
            "email": email or "",
        },
    }


def resolve_session(token: str) -> dict | None:
    """По токену из браузера → личность для эндпоинтов кабинета/панели.
    Возвращает dict сессии (token, chat_id, phone_hash, vk_user_id, ...) или None."""
    return database.get_web_session(token)
