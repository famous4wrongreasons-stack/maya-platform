"""
CutMatch — AI-консультант по стрижке + примерка.

Всё на OpenAI, с Claude-страховкой на анализе:
  1) analyze_face()  — gpt-4o vision (как в приложении ChatGPT) со styling-промптом
     подбирает 2–4 стрижки. Claude — авто-фолбэк, если OpenAI редко ловит фильтр
     биометрии (важно: «разбери геометрию черепа» он отвергает, «клиент просит совет
     по стрижке» — выполняет; поэтому промпт для gpt-4o переформулирован).
  2) submit_haircut()/haircut_status() — примерка на gpt-image-2 (та же модель,
     что в приложении ChatGPT) через /v1/images/edits. Запрос синхронный (~30–60с),
     поэтому делаем его в ФОНОВОЙ задаче и отдаём job_id мгновенно, а статус
     опрашиваем по локальному стору _JOBS — фронт-контракт submit/poll не меняется.

Поток: app.html → api-proxy.php → webhook_server → СЮДА → OpenAI.
Авторизацию и лимит «2 консультации/день» навешивает webhook_server (там же БД).

Замена движка (2026-06-06): было Claude vision + fal.ai nano-banana. Стало OpenAI
gpt-4o + gpt-image-2 — клиент видел в приложении ChatGPT качество кратно выше.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid

import httpx
from aiohttp import web

import config

logger = logging.getLogger(__name__)

# ── Модели OpenAI (можно переопределить в config.py) ─────────────────────────
OPENAI_API_KEY = getattr(config, "OPENAI_API_KEY", "")
PROXY_URL = getattr(config, "PROXY_URL", "") or ""
VISION_MODEL = getattr(config, "CUTMATCH_VISION_MODEL", "gpt-5.1")         # анализ лица (gpt-5.1: умнее gpt-4o в геометрии, дешевле $1.25/$10, та же скорость ~3с)
IMAGE_MODEL = getattr(config, "CUTMATCH_IMAGE_MODEL", "gpt-image-2")       # примерка (как в приложении)
IMAGE_QUALITY = getattr(config, "CUTMATCH_IMAGE_QUALITY", "medium")        # low|medium|high — финальное HD (medium ~$0.06, ~50с; high ~$0.25 «как ChatGPT desktop»)
PREVIEW_QUALITY = getattr(config, "CUTMATCH_PREVIEW_QUALITY", "low")        # быстрый превью (~15-20с), показываем сразу, потом подменяем на HD
IMAGE_SIZE = getattr(config, "CUTMATCH_IMAGE_SIZE", "1024x1536")           # портрет — на весь экран телефона (как сканер)

_OPENAI_BASE = "https://api.openai.com/v1"

# ── Примерка: fal.ai nano-banana (быстро ~10-15с, дёшево). Ключ в окружении сервиса. ──
FAL_KEY = getattr(config, "FAL_KEY", "") or os.environ.get("FAL_KEY", "")
FAL_MODEL = "fal-ai/nano-banana/edit"
_FAL_BASE = "https://fal.run"
_FAL_COST_USD = float(getattr(config, "CUTMATCH_FAL_COST_USD", 0.039))


def _proxy_kwargs(timeout: float) -> dict:
    kw: dict = {"timeout": timeout}
    if PROXY_URL:
        kw["proxy"] = PROXY_URL
    return kw


def _b64_to_bytes(s: str) -> bytes:
    """Терпит как чистый base64, так и data-URI."""
    s = (s or "").strip()
    if s.startswith("data:") and "," in s:
        s = s.split(",", 1)[1]
    return base64.b64decode(s)


# Описания стрижек для промпта примерки (англ. — модель точнее понимает).
_HAIRCUT_PROMPTS: dict[str, str] = {
    "French Crop":        "short hair on top about 2-3 cm with a textured choppy finish and a short blunt fringe falling straight forward onto the forehead; sides and back cut short with a skin fade",
    "Slick Back":         "medium-to-long hair on top about 7-8 cm combed straight BACK away from the face and lying flat with a glossy pomade finish; NO part; shorter tapered sides",
    "Side Part":          "medium hair about 4-5 cm on top combed flat to ONE side with a clean hard side parting line; the hair lies DOWN and to the side, it is NOT raised, spiked or brushed up; short tapered/faded sides",
    "Ivy League":         "short-to-medium hair about 3-4 cm on top, brushed slightly up and to the side with a soft natural part, neat conservative classic finish; short tapered sides",
    "Undercut Pompadour": "long voluminous hair on top about 7-9 cm styled UP and back into a tall rounded pompadour with big volume at the front; disconnected undercut with very short shaved sides",
    "Undercut":           "longer hair on top about 6-8 cm kept one length and slicked back, with a sharp DISCONNECTED undercut — sides and back uniformly very short/shaved, strong contrast between top and sides",
    "Skin Fade":          "neat short-to-medium hair on top about 2-4 cm styled tidily; the SIDES and BACK are faded smoothly from short down to BARE SKIN (skin fade) with a clean blended gradient — the defining feature is the very short skin-faded sides",
    "Textured Crop":      "short hair on top about 3-4 cm with a messy spiky textured finish and a short textured fringe forward onto the forehead; short faded sides",
    "Buzz Cut":           "very short uniform buzz cut all over the head, clipper length about 3-6 mm, the SAME short length on top and on the sides, no styling",
    "Faux-Hawk":          "hair kept longer along the central strip from forehead to crown and styled UP into a soft central peak (faux hawk), with shorter faded sides; volume in the centre, tapered edges",
    # ── бороды (примеряются при хорошем росте волос на лице) ──
    "Stubble":            "short even stubble beard, 3-5 day growth, neatly defined cheek line and clean neckline",
    "Short Beard":        "short well-groomed full beard about 1-2 cm, tidy defined cheek line and neckline",
    "Full Beard":         "thick full beard of medium length, well-groomed and shaped, clean defined neckline",
    "Goatee":             "goatee beard — hair on the chin and around the mouth, cheeks clean-shaven, tidy edges",
    "Beard Sculpt":       "sculpted beard, slightly longer on the chin, faded into the sideburns, sharp crisp lineup",
}
# Имена-бороды (для них промпт примерки меняет ТОЛЬКО растительность на лице, не волосы).
_BEARD_NAMES = {"Stubble", "Short Beard", "Full Beard", "Goatee", "Beard Sculpt"}

# Каталог для промпта анализа: en-ключ → русское название (показывается в орбе).
_CATALOG_RU: dict[str, str] = {
    "French Crop": "Французский кроп",
    "Slick Back": "Зачёс назад",
    "Side Part": "Пробор набок",
    "Ivy League": "Айви Лиг",
    "Undercut Pompadour": "Андеркат помпадур",
    "Undercut": "Андеркат",
    "Skin Fade": "Скин Фейд",
    "Textured Crop": "Текстурный кроп",
    "Buzz Cut": "Машинка под ноль",
    "Faux-Hawk": "Фо-хок",
    "Stubble": "Щетина",
    "Short Beard": "Короткая борода",
    "Full Beard": "Полная борода",
    "Goatee": "Козлиная бородка",
    "Beard Sculpt": "Моделированная борода",
}

# Русские названия форм лица (ключи фиксированы — их же знает фронт).
_SHAPES_RU: dict[str, str] = {
    "oval": "Овальное",
    "round": "Круглое",
    "square": "Квадратное",
    "heart": "Сердцевидное",
    "diamond": "Ромбовидное",
    "oblong": "Продолговатое",
}

# ── «Литература» барбера: как читать геометрию черепа и подбирать фасон ───────
_BARBER_SYSTEM = """\
Ты — главный барбер-стилист «Мужской Эстетики» с 15-летним стажем. Тебе показывают фото \
мужчины: ПЕРВОЕ — анфас, ВТОРОЕ (если есть) — профиль. Дай ЧЕСТНУЮ персональную \
КОНСУЛЬТАЦИЮ по образу — стрижка и борода. Главное здесь — сама консультация, а не просто список.

Внимательно оцени по фото ТРИ вещи:

1) ФОРМА ЛИЦА (для баланса пропорций) — oval / round / square / heart / diamond / oblong. \
Будь честен: НЕ выдавай всем подряд «ромбовидное».

2) СОСТОЯНИЕ ВОЛОС НА ГОЛОВЕ — это КЛЮЧЕВОЕ. Оцени густоту, линию роста, ЗАЛЫСИНЫ и зоны \
АЛОПЕЦИИ/поредения (отступающие виски, поредевшая макушка, диффузное поредение, просвечивает \
кожа). БУДЬ ЧЕСТЕН: если человек заметно лысеет или волос мало — крутая объёмная стильная \
стрижка НЕ получится, для неё нужны густые волосы, которых нет. НЕ предлагай лысеющему \
помпадур, зачёс назад, длинный/объёмный верх. Предлагай то, что РЕАЛЬНО хорошо смотрится \
при поредении: короткий crop, buzz cut, аккуратный скин-фейд, короткая чёткая форма. Прямо, \
но тактично объясни это в консультации — без ложных обещаний.

3) РОСТ ВОЛОС НА ЛИЦЕ — если щетина/борода растёт густо и ровно, ОБЯЗАТЕЛЬНО предложи \
оформить БОРОДУ в нескольких вариантах (особенно если на голове волос меньше — борода \
компенсирует и усиливает образ). Если рост слабый/пятнами — бороду НЕ предлагай.

ПРОФИЛЬ помогает оценить объём черепа, линию роста и залысины — учитывай его в оценке волос.

КАТАЛОГ (name СТРОГО из списка, ничего не выдумывай):
СТРИЖКИ: French Crop, Slick Back, Side Part, Ivy League, Undercut Pompadour, Undercut, \
Skin Fade, Textured Crop, Buzz Cut, Faux-Hawk.
БОРОДА: Stubble, Short Beard, Full Beard, Goatee, Beard Sculpt.

Подбери 3–4 рекомендации (стрижки и/или борода), которые РЕАЛЬНО подойдут с учётом формы \
лица, состояния волос и роста бороды. Для каждой — короткое (до 90 знаков) объяснение на «ты».

Верни ТОЛЬКО валидный JSON без markdown, строго такой:
{"face_shape":"<oval|round|square|heart|diamond|oblong>",
 "reasoning":"<честная консультация на 'ты', 3-5 предложений: форма лица + СОСТОЯНИЕ ВОЛОС/залысины (без обмана) + про бороду, если рост хороший>",
 "recommendations":[{"name":"<en из каталога>","why":"<почему подойдёт именно тебе, по-русски>"}]}
"""

# Тот же смысл, но рамка «КЛИЕНТ САМ просит совет по образу» (а НЕ «разбери геометрию
# черепа») — иначе OpenAI ловит фильтр биометрии и отвечает «не могу помочь». Для gpt-4o.
_BARBER_SYSTEM_OPENAI = """\
Ты — опытный дружелюбный барбер-стилист «Мужской Эстетики». Клиент САМ прислал своё фото \
(первое — анфас, второе, если есть — профиль) и просит ЧЕСТНУЮ консультацию по образу: какая \
стрижка и борода ему подойдут. Это обычная консультация стилиста — помоги по-человечески и честно.

Главное — сама КОНСУЛЬТАЦИЯ. Оцени по фото три вещи:

1) ФОРМА лица (oval/round/square/heart/diamond/oblong) — для баланса пропорций. Не выдавай всем «ромбовидное».

2) ВОЛОСЫ на голове (ключевое): густота, линия роста, залысины и зоны поредения (виски, \
макушка, диффузное поредение, просвечивает кожа). Будь ЧЕСТЕН: если волос мало или есть \
залысины — объёмные «стильные» укладки (помпадур, зачёс, длинный верх) НЕ получатся, для них \
нужны густые волосы. Тогда предлагай то, что реально хорошо смотрится при поредении: короткий \
crop, buzz, аккуратный скин-фейд, короткая чёткая форма. Тактично, но честно скажи об этом — без ложных обещаний.

3) РОСТ ВОЛОС НА ЛИЦЕ: если щетина/борода растёт густо и ровно — обязательно предложи оформить \
БОРОДУ в нескольких вариантах (особенно если волос на голове меньше — борода усиливает образ). \
Слабый/пятнистый рост — бороду не предлагай.

Каталог (name строго отсюда):
СТРИЖКИ: French Crop, Slick Back, Side Part, Ivy League, Undercut Pompadour, Undercut, Skin Fade, Textured Crop, Buzz Cut, Faux-Hawk.
БОРОДА: Stubble, Short Beard, Full Beard, Goatee, Beard Sculpt.

Подбери 3–4 рекомендации (стрижки и/или борода) с учётом формы лица, состояния волос и роста \
бороды. Для каждой — короткое (до 90 знаков) дружелюбное объяснение на «ты», ПО-РУССКИ.

Верни ТОЛЬКО валидный JSON без markdown:
{"face_shape":"<oval|round|square|heart|diamond|oblong>",
 "reasoning":"<честная консультация на 'ты', 3-5 предложений: форма лица + состояние волос/залысины (без обмана) + про бороду, если рост хороший>",
 "recommendations":[{"name":"<en из каталога>","why":"<почему подойдёт именно тебе, по-русски>"}]}
"""


def _resp(data: dict, status: int = 200) -> web.Response:
    """JSON + CORS-заголовки (идентично _cabinet_response в webhook_server)."""
    resp = web.json_response(data, status=status)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Telegram-InitData, X-Session-Token"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


def _extract_json(text: str) -> dict:
    """Достаём первый JSON-объект из ответа модели (на случай обрамления)."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


# ════════════════════════════════════════════════════════════════════════════
#  МОЗГ 1: ИИ-анализ лица (OpenAI gpt-4o vision)
# ════════════════════════════════════════════════════════════════════════════

def _analyze_openai(front_b64: str, profile_b64: str | None) -> dict:
    """gpt-4o vision со styling-промптом → распарсенный JSON. Бросает при отказе/невалидном."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY не задан")
    user_hint = ("Вот моё фото (анфас и профиль). Какая стрижка мне пойдёт? Верни JSON."
                 if profile_b64 else "Вот моё фото. Какая стрижка мне пойдёт? Верни JSON.")
    content: list[dict] = [
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + front_b64, "detail": "high"}},
    ]
    if profile_b64:
        content.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + profile_b64, "detail": "high"}})
    content.append({"type": "text", "text": user_hint})
    # gpt-5.x — reasoning-модели: требуют max_completion_tokens (НЕ max_tokens) и
    # ОТВЕРГАЮТ temperature. max_completion_tokens щедрый — внутри ещё reasoning-токены.
    # (gpt-4o тоже принимает max_completion_tokens, так что тело универсально.)
    body = {
        "model": VISION_MODEL, "max_completion_tokens": 2000,
        "messages": [
            {"role": "system", "content": _BARBER_SYSTEM_OPENAI},
            {"role": "user", "content": content},
        ],
    }
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    r = httpx.post(_OPENAI_BASE + "/chat/completions", headers=headers, json=body, **_proxy_kwargs(45.0))
    r.raise_for_status()
    resp = r.json()
    try:  # учёт расхода gpt-5.1 (раньше логировался только Claude-фолбэк)
        import ai_billing
        ai_billing.log_openai_usage("cutmatch_analyze", VISION_MODEL, resp)
    except Exception:
        pass
    raw = (((resp.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
    low = raw.lower()
    if "{" not in raw and ("не могу" in low or "cannot" in low or "i'm sorry" in low or "извин" in low):
        raise RuntimeError("openai отказал в анализе (фильтр)")
    return _extract_json(raw)


def _analyze_claude(front_b64: str, profile_b64: str | None) -> dict:
    """Claude vision → распарсенный JSON. Надёжный фолбэк (не ловит фильтр биометрии)."""
    import claude_ai  # ленивый импорт: клиент Anthropic уже создан в модуле
    from config import CLAUDE_MODEL

    client = getattr(claude_ai, "client", None)
    if client is None:
        raise RuntimeError("Anthropic-клиент недоступен")
    content: list[dict] = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": front_b64}},
    ]
    if profile_b64:
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": profile_b64}})
        user_hint = "Первое фото — анфас, второе — профиль этого же человека. Проанализируй и верни JSON."
    else:
        user_hint = "Фото анфас. Проанализируй и верни JSON."
    content.append({"type": "text", "text": user_hint})
    msg = client.messages.create(
        model=CLAUDE_MODEL, max_tokens=900, system=_BARBER_SYSTEM,
        messages=[{"role": "user", "content": content}],
    )
    try:
        import ai_billing
        ai_billing.log_anthropic_usage("cutmatch_analyze", CLAUDE_MODEL, msg)
    except Exception:
        pass
    raw = "".join(getattr(b, "text", "") for b in msg.content if getattr(b, "type", "") == "text")
    return _extract_json(raw)


def analyze_face(front_b64: str, profile_b64: str | None) -> dict:
    """Подбор стрижек по фото. gpt-4o (как в приложении ChatGPT) основным, Claude —
    авто-фолбэк на случай редкого отказа OpenAI по фильтру биометрии. Возвращает
    {face_shape, shape_ru, reasoning, recommendations:[{name,ru,why}]}.
    Синхронная (webhook_server зовёт через asyncio.to_thread)."""
    data = None
    try:
        data = _analyze_openai(front_b64, profile_b64)
    except Exception as e:
        logger.info("cutmatch analyze: gpt-4o не дал результат (%s) → фолбэк Claude", e)
    if not isinstance(data, dict) or not (data.get("recommendations") or data.get("face_shape")):
        data = _analyze_claude(front_b64, profile_b64)

    shape = str(data.get("face_shape", "oval")).strip().lower()
    if shape not in _SHAPES_RU:
        shape = "oval"
    recs_in = data.get("recommendations") or []
    recs_out: list[dict] = []
    seen: set[str] = set()
    for r_item in recs_in:
        name = str((r_item or {}).get("name", "")).strip()
        match = next((k for k in _HAIRCUT_PROMPTS if k.lower() == name.lower()), None)
        if not match or match in seen:
            continue
        seen.add(match)
        recs_out.append({
            "name": match,
            "ru": _CATALOG_RU.get(match, match),
            "why": str((r_item or {}).get("why", "")).strip()[:140] or "Хорошо ляжет на твою форму головы.",
        })
    if not recs_out:
        for fallback in ("Textured Crop", "Side Part", "Skin Fade"):
            recs_out.append({"name": fallback, "ru": _CATALOG_RU[fallback],
                             "why": "Универсальный вариант, который идёт большинству."})

    return {
        "face_shape": shape,
        "shape_ru": _SHAPES_RU[shape],
        "reasoning": str(data.get("reasoning", "")).strip()[:600],
        "recommendations": recs_out[:4],
    }


# ════════════════════════════════════════════════════════════════════════════
#  МОЗГ 2: примерка через OpenAI gpt-image-2 (edit) в фоновой задаче
# ════════════════════════════════════════════════════════════════════════════

# Локальный стор задач примерки: job_id → {status, image_url|message, ts}.
# Живёт в памяти процесса; рестарт бота теряет задачи (клиент просто перезапускает).
_JOBS: dict[str, dict] = {}
_JOB_TTL = 900  # сек — старые задачи подчищаем


def _prune_jobs() -> None:
    now = time.time()
    for k in [k for k, v in _JOBS.items() if now - v.get("ts", now) > _JOB_TTL]:
        _JOBS.pop(k, None)


def _build_prompt(haircut_name: str) -> str:
    desc = _HAIRCUT_PROMPTS.get(haircut_name, f"man with {haircut_name}")
    if haircut_name in _BEARD_NAMES:
        return (
            f"Add and neatly style facial hair on this man: {desc}. "
            "Keep his existing HAIRSTYLE, face, identity, facial features, bone structure, skin tone, "
            "eyes, nose, mouth, head pose, lighting and background completely unchanged. "
            "Change ONLY the facial hair / beard. Photorealistic result, same person."
        )
    return (
        f"Restyle the man's hair to EXACTLY this men's haircut: {desc}. "
        "This is a COMPLETE hair restyle: clearly change the LENGTH, SHAPE and STYLING of the hair "
        "on top AND on the sides and back so it fully matches the description above — even if that looks "
        "very different from his current hair. Do not just keep the existing hair. "
        "Keep the exact same face, identity, facial features, bone structure, skin tone, eyes, nose, "
        "mouth, eyebrows, existing beard, head pose, lighting and background completely unchanged. "
        "Photorealistic result, same person."
    )


def _blocking_edit(photo_b64: str, haircut_name: str) -> str:
    """Синхронный вызов fal.ai nano-banana edit. Возвращает URL картинки (хостится на fal).
    Быстро (~10-15с), дёшево. Фото шлём data-URI прямо в image_urls."""
    if not FAL_KEY:
        raise RuntimeError("FAL_KEY не задан")
    raw = (photo_b64 or "").strip()
    data_uri = raw if raw.startswith("data:") else "data:image/jpeg;base64," + raw
    body = {
        "prompt": _build_prompt(haircut_name),
        "image_urls": [data_uri],
        "num_images": 1,
        "output_format": "jpeg",
        "aspect_ratio": "auto",  # сохраняем портретную пропорцию входного фото
    }
    headers = {"Authorization": f"Key {FAL_KEY}", "Content-Type": "application/json"}
    r = httpx.post(f"{_FAL_BASE}/{FAL_MODEL}", headers=headers, json=body, **_proxy_kwargs(120.0))
    if r.status_code != 200:
        logger.error("cutmatch fal %s: %s", r.status_code, r.text[:300])
        raise RuntimeError(f"fal nano-banana {r.status_code}")
    imgs = (r.json().get("images") or [])
    url = (imgs[0].get("url") if imgs and isinstance(imgs[0], dict) else "") or ""
    if not url:
        raise RuntimeError("fal не вернул изображение")
    return url


def _log_image_cost() -> None:
    """Стоимость одной примерки на fal nano-banana (фикс. цена за изображение)."""
    try:
        import database
        database.log_ai_usage(feature="cutmatch", model=FAL_MODEL,
                              input_tokens=0, output_tokens=0, cost_usd=_FAL_COST_USD)
    except Exception:
        pass


async def _run_edit(job_id: str, photo_b64: str, haircut_name: str) -> None:
    """Одноступенчатая примерка на fal nano-banana (~10-15с) в фоновой задаче."""
    loop = asyncio.get_event_loop()
    try:
        url = await loop.run_in_executor(None, _blocking_edit, photo_b64, haircut_name)
        _JOBS[job_id] = {"status": "done", "image_url": url, "ts": time.time()}
        _log_image_cost()
    except Exception as exc:
        logger.error("cutmatch fal job %s failed: %s", job_id, exc)
        _JOBS[job_id] = {"status": "error",
                         "message": "Не удалось сгенерировать примерку. Попробуйте ещё раз.",
                         "ts": time.time()}


# Держим ссылки на фоновые задачи: event loop хранит лишь СЛАБУЮ ссылку, и GC может
# вырезать _run_edit посреди await run_in_executor → job навсегда застрянет в 'pending'.
_BG_TASKS: set = set()


async def submit_haircut(photo_b64: str, haircut_name: str) -> str:
    """Ставит задачу примерки и сразу возвращает job_id (контракт как у fal request_id)."""
    _prune_jobs()
    job_id = uuid.uuid4().hex
    _JOBS[job_id] = {"status": "pending", "ts": time.time()}
    t = asyncio.create_task(_run_edit(job_id, photo_b64, haircut_name))
    _BG_TASKS.add(t)
    t.add_done_callback(_BG_TASKS.discard)
    return job_id


async def haircut_status(job_id: str) -> dict:
    """Опрос статуса:
      {status:'pending'}                          — ещё считается
      {status:'done', image_url, hd:true}         — готов результат
      {status:'error', message}                   — ошибка
    Текущий воркер _run_edit одноступенчатый (fal nano-banana): отдаёт сразу 'done',
    статус 'preview' он НЕ выставляет. Ветка 'preview' ниже — спящий forward-compat
    хук на случай возврата двухступенчатой схемы (быстрый low-превью → подмена на HD);
    фронт её поддерживает. image_url — URL/data-URI, фронт просто подменяет картинку."""
    job = _JOBS.get(job_id)
    if not job:
        # неизвестный/потерянный id — пусть фронт ещё поопрашивает (у него свой лимит попыток)
        return {"status": "pending"}
    st = job.get("status")
    if st == "done":
        return {"status": "done", "image_url": job.get("image_url"), "hd": True}
    if st == "preview":
        # forward-compat: текущий одноступенчатый воркер сюда не попадает (см. докстринг)
        return {"status": "preview", "image_url": job.get("preview_url"), "hd": False}
    if st == "error":
        return {"status": "error", "message": job.get("message", "Ошибка генерации.")}
    return {"status": "pending"}


# ── HTTP-обёртки для примерки (без авторизации; авторизацию/лимит на анализе) ──

async def submit_haircut_handler(request: web.Request) -> web.Response:
    """POST /api/try-haircut {photo,haircut} → {ok:true, request_id}."""
    try:
        body = await request.json()
    except Exception:
        return _resp({"error": "invalid_json"}, status=400)
    photo_b64 = (body.get("photo") or "").strip()
    haircut = (body.get("haircut") or "").strip()
    if not photo_b64:
        return _resp({"error": "missing_photo", "message": "Нет фото"}, status=400)
    if not haircut:
        return _resp({"error": "missing_haircut", "message": "Не выбрана стрижка"}, status=400)
    try:
        request_id = await submit_haircut(photo_b64, haircut)
        return _resp({"ok": True, "request_id": request_id})
    except Exception as exc:
        logger.error("submit_haircut failed: %s", exc, exc_info=True)
        return _resp({"error": "submit_failed", "message": str(exc)}, status=502)


async def haircut_status_handler(request: web.Request) -> web.Response:
    """POST /api/haircut-status {request_id} → {status:...}."""
    try:
        body = await request.json()
    except Exception:
        return _resp({"error": "invalid_json"}, status=400)
    rid = (body.get("request_id") or "").strip()
    if not rid:
        return _resp({"error": "missing_request_id"}, status=400)
    out = await haircut_status(rid)
    return _resp(out)
