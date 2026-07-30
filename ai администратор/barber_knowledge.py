"""
barber_knowledge.py — база знаний по стрижкам/технике для роли MAYA-«наставник».

Зачем: LLM из коробки уверенно выдумывает детали стрижек. Чтобы наставник
давал ФАКТЫ, а не галлюцинации, MAYA отвечает мастеру по технике ТОЛЬКО из
курируемой базы (файл barber_knowledge.md) — простой retrieval по секциям.
Если в базе нет ответа — честно говорит, что точного раздела пока нет, без
советов идти за уточнением к владельцу или другому человеку.

Контент в barber_knowledge.md — ЧЕРНОВИК (общая барбер-практика). Стас правит и
дополняет его стандартами салона; код трогать не нужно — он читает .md как есть.

Зависимостей нет (без эмбеддингов): база маленькая, хватает overlap по словам.
Если база сильно вырастет — заменить retrieve() на векторный поиск.
"""
from __future__ import annotations

import os
import re
from urllib.parse import quote

KB_PATH = os.path.join(os.path.dirname(__file__), "barber_knowledge.md")
KB_IMPORTED_PATH = os.path.join(os.path.dirname(__file__), "barber_knowledge_imported.md")
KB_IMAGE_BASE_URL = os.getenv(
    "BARBER_KNOWLEDGE_IMAGE_BASE_URL",
    "https://malesthetic.pro/app/media/knowledge",
).rstrip("/")
_SECTIONS_CACHE = {"stamp": None, "sections": []}
_IMAGE_RE = re.compile(r"\bIMG_\d{4,}\b", re.IGNORECASE)
_TECH_QUERY_RE = re.compile(
    r"("
    r"стрич|стриж|техник|насад|гайдлайн|фейд|fade|бород|ус|контур|окантов|"
    r"кроп|crop|сайд|side|part|парт|андеркат|undercut|помпадур|pompadour|"
    r"квифф|quiff|шторк|curtains|crew|флик|тушев|секци|пробор|градуиров|слои|форма|"
    # темы-схемы из теоретического блока книги (перерисованы в стиль приложения):
    r"зон|голов|лиц|череп|анатом|квадрат|овал|кругл|треуголь|проекц|радиальн|"
    r"макушк|темен|затыл|виск|диагонал|вертикал|горизонтал|лини"
    r")",
    re.IGNORECASE,
)

_STOP = {
    "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то",
    "все", "она", "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за",
    "бы", "по", "только", "ее", "мне", "было", "вот", "от", "меня", "о", "из",
    "ему", "теперь", "для", "ли", "если", "или", "ну", "под", "при", "до",
    "это", "этот", "эта", "как", "какой", "какая", "какие", "чем", "про",
}


def _tokenize(text: str) -> list[str]:
    # Лёгкий стемминг: режем слово до префикса в 5 символов, чтобы падежи
    # совпадали («борода»/«бороду»/«бороды»→«бород»; «насадка»/«насадку»→
    # «насад»). Грубо, но для русской морфологии заметно поднимает recall
    # без внешних либ. Если база вырастет — заменить на векторный поиск.
    out = []
    for w in re.findall(r"[а-яёa-z0-9]+", (text or "").lower()):
        if len(w) > 2 and w not in _STOP:
            out.append(w[:5])
    return out


def _expand_query_text(text: str) -> str:
    low = (text or "").lower().replace("ё", "е")
    extra: list[str] = []
    if "сайд" in low or "парт" in low:
        extra.extend(["side", "part", "side part", "пробор"])
    if "кроп" in low:
        extra.append("crop")
    if "фейд" in low:
        extra.append("fade")
    if "андеркат" in low:
        extra.append("undercut")
    if "помпадур" in low:
        extra.append("pompadour")
    if "квифф" in low:
        extra.append("quiff")
    if "штор" in low:
        extra.append("curtains")
    return (text or "") + (" " + " ".join(extra) if extra else "")


def looks_like_technical_query(text: str) -> bool:
    """True when text is likely a barber technique / haircut knowledge request."""
    return bool(_TECH_QUERY_RE.search(_expand_query_text(text or "")))


def _section_image_name(title: str) -> str:
    m = _IMAGE_RE.search(title or "")
    return (m.group(0).upper() + ".jpg") if m else ""


def _kb_stamp() -> tuple:
    stamp = []
    for path in (KB_PATH, KB_IMPORTED_PATH):
        try:
            st = os.stat(path)
            stamp.append((path, st.st_mtime, st.st_size))
        except Exception:
            stamp.append((path, 0, 0))
    return tuple(stamp)


def _read_sections(path: str) -> list[dict]:
    """Читает один .md и режет на секции по заголовкам '## '."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
    except Exception:
        return []
    sections = []
    cur_title, cur_lines = None, []

    def _flush():
        if cur_title is not None:
            body = "\n".join(cur_lines).strip()
            source = os.path.basename(path)
            sections.append({
                "title": cur_title,
                "body": body,
                "source": source,
                "image": _section_image_name(cur_title),
                "tokens": set(_tokenize(cur_title + " " + body)),
            })

    for line in raw.splitlines():
        if line.startswith("## "):
            _flush()
            cur_title, cur_lines = line[3:].strip(), []
        elif cur_title is not None:
            cur_lines.append(line)
    _flush()
    return sections


def _load_sections() -> list[dict]:
    """Возвращает секции основной и импортированной базы с лёгким mtime-кэшем."""
    stamp = _kb_stamp()
    if _SECTIONS_CACHE["stamp"] == stamp:
        return list(_SECTIONS_CACHE["sections"])
    sections = []
    for path in (KB_PATH, KB_IMPORTED_PATH):
        sections.extend(_read_sections(path))
    _SECTIONS_CACHE.update(stamp=stamp, sections=sections)
    return list(sections)


def retrieve(query: str, top_k: int = 2) -> list[dict]:
    """Топ-секций по совпадению слов запроса. [{title, body, score}]."""
    q = set(_tokenize(_expand_query_text(query)))
    if not q:
        return []
    scored = []
    for s in _load_sections():
        score = len(q & s["tokens"])
        if score:
            scored.append({
                "title": s["title"],
                "body": s["body"],
                "source": s.get("source") or "",
                "image": s.get("image") or "",
                "score": score,
            })
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


def _image_url(name: str) -> str:
    safe = os.path.basename(name or "")
    if not re.fullmatch(r"IMG_\d{4,}\.(?:jpg|jpeg|png|webp)", safe, re.IGNORECASE):
        return ""
    return f"{KB_IMAGE_BASE_URL}/{quote(safe)}"


def _preferred_image_names(query: str) -> list[str]:
    low = (query or "").lower().replace("ё", "е")
    if "сайд" in low or "side" in low or "парт" in low:
        return ["IMG_8127.jpg", "IMG_8120.jpg", "IMG_8121.jpg", "IMG_8122.jpg", "IMG_8126.jpg"]
    if "кроп" in low or "crop" in low:
        return ["IMG_8145.jpg", "IMG_8146.jpg", "IMG_8147.jpg", "IMG_8148.jpg", "IMG_8152.jpg"]
    if "бород" in low or "усы" in low or "контур" in low:
        return ["IMG_8086.jpg", "IMG_8087.jpg", "IMG_8088.jpg", "IMG_8089.jpg", "IMG_8090.jpg"]
    if "фейд" in low or "fade" in low:
        return ["IMG_8077.jpg", "IMG_8078.jpg", "IMG_8079.jpg", "IMG_8082.jpg", "IMG_8083.jpg"]
    if "андеркат" in low or "undercut" in low:
        return ["IMG_8109.jpg", "IMG_8110.jpg", "IMG_8112.jpg"]
    # Теоретические схемы книги, перерисованные в стиль приложения (2026-07-05).
    # Отдаём стилизованную схему первой, чтобы мастер видел именно её.
    if "кругл" in low:
        return ["IMG_8049.jpg"]
    if "квадрат" in low:
        return ["IMG_8051.jpg"]
    if "треуголь" in low:
        return ["IMG_8053.jpg"]
    if "овал" in low:
        return ["IMG_8055.jpg"]
    if "лиц" in low:                       # «форма лица», «какое лицо» — обзор всех форм
        return ["IMG_8049.jpg", "IMG_8051.jpg", "IMG_8053.jpg", "IMG_8055.jpg"]
    if "череп" in low or "анатом" in low:
        return ["IMG_8029.jpg"]
    if "зон" in low or "макушк" in low or "затыл" in low or "темен" in low or "висок" in low or "виск" in low:
        return ["IMG_8027.jpg", "IMG_8033.jpg"]
    if "градуиров" in low:
        return ["IMG_8044.jpg"]
    if "слои" in low or "слоя" in low or "слоев" in low:
        return ["IMG_8046.jpg"]
    if "радиальн" in low:
        return ["IMG_8040.jpg"]
    if "секци" in low:
        return ["IMG_8038.jpg", "IMG_8040.jpg"]
    if "лини" in low:
        return ["IMG_8042.jpg"]
    if "техник" in low:
        return ["IMG_8041.jpg"]
    return []


# 🔴 ТОЛЬКО эти страницы перерисованы в чистые схемы в стиле приложения
# (2026-07-05). Всё остальное в базе — СЫРЫЕ ФОТО СТРАНИЦ КНИГИ; их НЕЛЬЗЯ слать
# в чат (книжку не скидываем — текст держим в памяти, картинки шлём только
# стилизованные). images_for отдаёт исключительно имена из этого набора.
_STYLED_SCHEMES = {
    "IMG_8027", "IMG_8029", "IMG_8033", "IMG_8038", "IMG_8040", "IMG_8041",
    "IMG_8042", "IMG_8044", "IMG_8046", "IMG_8049", "IMG_8051", "IMG_8053",
    "IMG_8055", "IMG_8057", "IMG_8058", "IMG_8077", "IMG_8078", "IMG_8143",
}


def images_for(query: str, hits: list[dict] | None = None, limit: int = 3) -> list[dict]:
    """Публичные ссылки на СТИЛИЗОВАННЫЕ схемы по запросу.

    Отдаёт ТОЛЬКО перерисованные схемы (_STYLED_SCHEMES) — сырые фото страниц
    книги не шлём никогда. Если под запрос нет чистой схемы — вернём пусто
    (текст ответа мастер всё равно получит из разделов базы)."""
    if not looks_like_technical_query(query):
        return []
    hits = hits if hits is not None else retrieve(query, top_k=5)
    names: list[str] = []
    names.extend(_preferred_image_names(query))
    for h in hits or []:
        img = h.get("image") or _section_image_name(h.get("title") or "")
        if img:
            names.append(img)

    out: list[dict] = []
    seen = set()
    title_by_image = {h.get("image"): h.get("title") for h in hits or [] if h.get("image")}
    for name in names:
        clean = os.path.basename(name or "")
        if not clean or clean in seen:
            continue
        if clean.rsplit(".", 1)[0].upper() not in _STYLED_SCHEMES:
            continue                          # сырую страницу книги не отдаём
        url = _image_url(clean)
        if not url:
            continue
        seen.add(clean)
        out.append({
            "id": clean.rsplit(".", 1)[0],
            "name": clean,
            "title": title_by_image.get(clean) or "Схема из базы знаний",
            "url": url,
        })
        if len(out) >= limit:
            break
    return out


def answer(query: str) -> dict:
    """Готовый ответ для инструмента. Возвращает найденные секции либо
    флаг not_found, чтобы MAYA честно сказала «в базе нет»."""
    hits = retrieve(query, top_k=2)
    if not hits:
        return {
            "found": False,
            "note": ("В базе знаний салона нет точного раздела по этому вопросу. "
                     "Не выдумывай технику: скажи, что точной схемы пока нет в базе, "
                     "и попроси уточнить название стрижки или техники."),
            "images": [],
        }
    return {
        "found": True,
        "sections": [{"title": h["title"], "text": h["body"], "source": h.get("source") or "",
                      "image": h.get("image") or ""} for h in hits],
        "images": images_for(query, hits, limit=3),
        "note": ("Отвечай мастеру ТОЛЬКО на основе этих разделов базы салона. "
                 "Если инструмент вернул images, скажи коротко, что прикрепляешь "
                 "схему из базы; URL картинок не переписывай текстом. "
                 "Если деталей не хватает — скажи прямо, не домысливай и не "
                 "отправляй к владельцу или другому человеку за уточнением."),
    }


_TEAM_MAYA_RE = re.compile(
    r"^\s*(?:/maya|/майя|/kb|/база|@maya|maya|майя|мая)\b[\s,:;—–-]*(.*)$",
    re.IGNORECASE,
)


def extract_team_query(text: str) -> str:
    """Возвращает вопрос к MAYA из team chat, только если её явно позвали."""
    raw = (text or "").strip()
    if not raw:
        return ""
    m = _TEAM_MAYA_RE.match(raw)
    if not m:
        return ""
    query = (m.group(1) or "").strip()
    return query or raw


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\n{3,}", "\n\n", (text or "").strip())
    if len(text) <= limit:
        return text
    cut = text.rfind(" ", 0, max(1, limit - 1))
    if cut < limit * 0.55:
        cut = limit - 1
    return text[:cut].rstrip() + "…"


def _has_any(text: str, words: tuple[str, ...]) -> bool:
    low = (text or "").lower().replace("ё", "е")
    return any(w in low for w in words)


def _extract_steps(hits: list[dict], limit: int = 5) -> list[str]:
    steps: list[str] = []
    for hit in hits:
        body = hit.get("body") or ""
        matches = re.findall(
            r"(Шаг\s*(?:N[º°]?\s*)?\d+[\s\S]{0,260}?)(?=\nШаг\s*(?:N[º°]?\s*)?\d+|\Z)",
            body,
            flags=re.IGNORECASE,
        )
        for raw in matches:
            clean = re.sub(r"\s+", " ", raw).strip()
            if clean and clean not in steps:
                steps.append(_clip(clean, 180))
            if len(steps) >= limit:
                return steps
    return steps


def _schema_for(query: str, hits: list[dict]) -> str:
    """Short visual-ish work map for staff chat. It is text, not voice/audio."""
    combined = query + "\n" + "\n".join((h.get("title", "") + "\n" + h.get("body", "")) for h in hits[:3])
    steps = _extract_steps(hits)

    query_low = (query or "").lower().replace("ё", "е")
    explicit_side = _has_any(query_low, ("сайд", "side", "парт"))
    explicit_crop = _has_any(query_low, ("кроп", "crop", "френч", "french"))
    explicit_beard = _has_any(query_low, ("бород", "усы", "окантов", "контур", "шей"))
    explicit_fade = _has_any(query_low, ("фейд", "fade", "градиент", "переход", "taper"))

    if explicit_side or (not (explicit_crop or explicit_beard or explicit_fade) and _has_any(combined, ("side part", "side", "сайд", "парт"))):
        lines = [
            "Схема side part",
            "[ПРОБОР] разделить фронтально-теменную зону на большую и меньшую стороны",
            "[ПОДКОВА] выделить топ через макушку, высушить по направлению распада",
            "[БОКА/ЗАТЫЛОК] выбрать базу и высоту фейда под силуэт; гайдлайн по круглому рисунку",
            "[МЕНЬШАЯ СТОРОНА] вести к углу проекции, контролировать накопление массы",
            "[БОЛЬШАЯ СТОРОНА] квадратный слой/дисконнекция по задаче, затем укладка по пробору",
        ]
    elif explicit_crop or (not (explicit_beard or explicit_fade) and _has_any(combined, ("кроп", "crop", "френч", "french"))):
        lines = [
            "Схема кропа",
            "[ФРОНТ/ЧЁЛКА ↓] короткая чёлка лежит по естественному распаду вниз",
            "[ВЕРХ/ПОДКОВА] отделить фронтально-теменную зону, дать подвижную текстуру",
            "[БОКА/ЗАТЫЛОК] fast/mid fade; база около 3 мм, гайдлайн машинкой",
            "[СВЕДЕНИЕ] флик + 1.5/середина ножа, дочистить серую зону",
            "[ФИНИШ] окантовка висков, проверка симметрии, лёгкий стайлинг",
        ]
    elif explicit_beard or (not explicit_fade and _has_any(combined, ("бород", "усы", "окантов", "контур", "шей"))):
        lines = [
            "Схема бороды",
            "[ФОРМА ЛИЦА] выбрать силуэт: вытянуть, смягчить или добавить массив",
            "[ЩЁКИ] естественная линия, слегка подчистить без завышения",
            "[ШЕЯ] ориентир — около двух пальцев над кадыком, не поднимать слишком высоко",
            "[ВИСКИ] свести бороду с висками через плавный переход",
            "[ФИНИШ] контур триммером/шаветтом, симметрия, укладка бороды",
        ]
    elif explicit_fade or _has_any(combined, ("фейд", "fade", "градиент", "переход", "fast fade")):
        lines = [
            "Схема фейда",
            "[ВЕРХ] отделить массу, не залезать в форму верха",
            "[НИЗ] задать самую короткую базу/нулевую зону",
            "[ГАЙДЛАЙН] ставить мягко, машинкой или триммером по задаче",
            "[РАСТУШЁВКА] флик, рычаг, 0.5 → 1 → 1.5 → 2 без резких линий",
            "[КОНТРОЛЬ] проверить впадины черепа, симметрию висков и затылок против света",
        ]
    else:
        lines = [
            "Схема работы",
            "[1] Диагностика: форма головы, рост волос, вихры, плотность",
            "[2] Разделение зон: верх / виски / затылок / краевая линия",
            "[3] База длины: выбрать насадки и гайдлайны",
            "[4] Сведение: флик, рычаг, работа по расчёске",
            "[5] Финиш: текстура, окантовка, симметрия, стайлинг",
        ]

    if steps:
        lines.append("Шаги из базы:")
        lines.extend(f"- {s}" for s in steps[:4])
    return "\n".join(lines)


def answer_text(query: str, max_chars: int = 1900) -> str:
    """Compact staff-chat answer from the curated barber knowledge base."""
    query = (query or "").strip()
    if not query:
        return "MAYA · база мастера\n\nНапишите вопрос после обращения: «Майя, как сделать фейд?»"
    hits = retrieve(query, top_k=3)
    if not hits:
        return (
            "MAYA · база мастера\n\n"
            "В базе знаний салона пока нет ответа на этот вопрос. "
            "Не буду выдумывать технику: напишите название стрижки или техники чуть точнее."
        )

    schema = _schema_for(query, hits)
    parts = ["MAYA · база мастера", schema]
    budget = max(420, max_chars - len("\n\n".join(parts)) - 80)
    per_hit = max(180, budget // len(hits))
    for h in hits:
        title = _clip(h.get("title") or "Раздел базы", 120)
        body = _clip(h.get("body") or "", per_hit)
        if body:
            parts.append(f"{title}\n{body}")
    reply = "\n\n".join(parts)
    if len(reply) > max_chars:
        reply = _clip(reply, max_chars)
    return reply


def answer_payload(query: str, max_chars: int = 1900) -> dict:
    hits = retrieve(query, top_k=3)
    return {
        "text": answer_text(query, max_chars=max_chars),
        "images": images_for(query, hits, limit=3),
    }
