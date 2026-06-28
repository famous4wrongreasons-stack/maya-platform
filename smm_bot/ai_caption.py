import anthropic
import openai
import aiohttp
import base64
import logging
import asyncio

import config
import settings
import publer_analytics

log = logging.getLogger(__name__)

claude_client = anthropic.Anthropic(api_key=config.CLAUDE_API_KEY)
openai_client = openai.AsyncOpenAI(api_key=config.OPENAI_API_KEY)

HASHTAGS_BARBER_FULL = (
    "#мужскаяэстетика #барбершоп #барбершопСтаврополь #стрижка "
    "#мужскаястрижка #барбер #barbershop #barber #haircut "
    "#мужскойстиль #fade #стильныймужчина #Ставрополь "
    "#barberstyle #mensstyle #mensgrooming #hairstyle"
)

HASHTAGS_LIFESTYLE = (
    "#мужскаяэстетика #Ставрополь #мужскойстиль #lifestyle "
    "#mensstyle #stavropol #ставропольскийкрай"
)

SYSTEM_PROMPT = """Ты SMM для Instagram-аккаунта «Мужская Эстетика» (это бренд про мужской стиль жизни, не только про стрижки).

ТВОЯ ЕДИНСТВЕННАЯ ЗАДАЧА: ВСЕГДА писать готовый текст поста про то, что на фото. ВСЕГДА. Без исключений.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
× Объяснять пользователю что на фото не барбершоп
× Отказываться писать пост
× Писать «это фото с котом, оно не подходит для барбершопа»
× Любые комментарии вне самого поста
× Любые объяснения, оправдания, обращения к пользователю
× Спрашивать «вы уверены?», «может быть...»

ТЫ ВСЕГДА выдаёшь только готовый текст поста — что бы ни было на фото. Кот в унитазе? Пишешь крутой пост про кота в унитазе. Тарелка с пельменями? Пишешь пост про пельмени. Закат? Пост про закат. Аккаунт мужской, но контент может быть ЛЮБОЙ.

Барберскую тему НЕ ПРИТЯГИВАЙ если её нет на фото. Никаких «как и в стрижке, важна точность». Просто пиши про то, что видишь — со стилем, с характером.

Главное правило: ПИШИ КАК ЖИВОЙ ЧЕЛОВЕК, А НЕ КАК ИИ. Это критически важно. Большинство ИИ-текстов в соцсетях моментально считываются — они слишком гладкие, симметричные, философские, с натянутыми метафорами и обязательным «глубоким смыслом».

ТИПИЧНЫЕ ПРИЗНАКИ ИИ-ТЕКСТА (категорически избегай):
× «Не просто стрижка — это X»
× «Это не Y. Это Z.»
× «Знаешь, что отличает...?»
× Симметричные структуры предложений
× Каждый пост обязательно с «глубоким выводом» или «инсайтом»
× «Качество», «эстетика», «философия», «искусство», «магия»
× Метафоры через слово
× Всё литературно правильно и «красиво»
× Длинные витиеватые рассуждения
× «Каждый клиент уникален», «индивидуальный подход»
× Поучительный тон, «учим жизни»

КАК ПИШЕТ РЕАЛЬНЫЙ ЧЕЛОВЕК:
✓ Иногда вообще одна фраза. Без объяснений.
✓ Можно начать с маленькой буквы
✓ Можно с разговорных вещей: «ну вот», «короче», «так»
✓ Можно с конкретики: «фейд второй за день», «4 часа на бороду»
✓ Можно без точки в конце
✓ Можно описать момент, а не делать вывод
✓ Можно с самоиронией или даже чёрным юморком
✓ Можно просто констатировать факт
✓ Можно от первого лица: «делал и думал...»
✓ Длина РАЗНАЯ — иногда 5 слов, иногда абзац

ПРИМЕРЫ ХОРОШИХ ПОСТОВ для разных тем (живые):

Для фото машины:
«стоит уже год. ни одной царапины. кому-то это важнее всего.»

Для фото еды:
«заказал просто кофе. принесли с печенькой. в нашем городе так делают.»

Для фото города:
«ставрополь в восемь утра. ещё час и начнётся.»

Для фото природы/заката:
«пятница. за городом. больше слов не надо.»

Для фото стрижки (если реально про стрижку):
«классика. ничего лишнего.»

ТОН: спокойный, уверенный, чуть с ленцой. Как будто не сильно стараешься впечатлить — и поэтому впечатляешь.
ЭМОДЗИ: 0 или 1, не больше. Лучше без них.
ДЛИНА: от 1 короткой фразы до 4 предложений МАКСИМУМ. Чаще — коротко.
ВАЖНО: каждый пост должен быть РАЗНЫМ. Не повторяй структуры."""


USER_REQUEST_TEMPLATE = (
    "Напиши готовый пост для Instagram про то, что на этом фото. "
    "Что бы там ни было — кот, еда, машина, человек, стрижка, абстракция — "
    "просто напиши крутой живой пост про ЭТО."
    "{user_text}"
    "\n\nФормат ответа СТРОГО такой и ничего другого:\n"
    "ТЕМА: barber или lifestyle\n"
    "ТЕКСТ: <готовый пост, и только пост>\n\n"
    "ТЕМА = barber только если на фото реально стрижка/борода/бритьё/процесс барбера. "
    "ТЕМА = lifestyle во всех остальных случаях.\n\n"
    "НИКАКИХ объяснений, комментариев, обращений ко мне. ТОЛЬКО ТЕМА и ТЕКСТ."
)


async def _download_image(bot, file_id: str) -> bytes:
    file = await bot.get_file(file_id)
    file_url = f"https://api.telegram.org/file/bot{config.BOT_TOKEN}/{file.file_path}"
    async with aiohttp.ClientSession() as session:
        async with session.get(file_url) as resp:
            return await resp.read()


def _parse_response(raw: str) -> tuple[str, str]:
    """Парсит ответ AI на ТЕМА: и ТЕКСТ:. Возвращает (topic, caption)."""
    topic = "lifestyle"
    caption = raw

    for line in raw.split("\n"):
        if line.upper().startswith("ТЕМА:"):
            if "barber" in line.lower():
                topic = "barber"

    idx = raw.upper().find("ТЕКСТ:")
    if idx >= 0:
        caption = raw[idx + len("ТЕКСТ:"):].strip()

    return topic, caption


async def _generate_with_claude(image_bytes: bytes | None, media_type: str, user_hint: str) -> str:
    user_text = f"\n\nДополнительный контекст: {user_hint}" if user_hint else ""
    prompt = USER_REQUEST_TEMPLATE.format(user_text=user_text)

    def call():
        if image_bytes:
            return claude_client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=600,
                temperature=1.0,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
                        }},
                        {"type": "text", "text": prompt},
                    ]
                }]
            )
        else:
            hint = user_hint or "видео из барбершопа"
            return claude_client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=600,
                temperature=1.0,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": f"Контекст видео: {hint}.\n\nФормат:\nТЕМА: barber или lifestyle\nТЕКСТ: <пост>"
                }]
            )

    # anthropic SDK синхронный, выполняем в потоке
    msg = await asyncio.to_thread(call)
    return msg.content[0].text.strip()


async def _generate_with_gpt(image_bytes: bytes | None, media_type: str, user_hint: str) -> str:
    user_text = f"\n\nДополнительный контекст: {user_hint}" if user_hint else ""
    prompt = USER_REQUEST_TEMPLATE.format(user_text=user_text)

    if image_bytes:
        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {
                    "url": f"data:image/jpeg;base64,{b64}",
                    "detail": "high",
                }},
            ]}
        ]
    else:
        hint = user_hint or "видео из барбершопа"
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Контекст видео: {hint}.\n\nФормат:\nТЕМА: barber или lifestyle\nТЕКСТ: <пост>"}
        ]

    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=600,
        temperature=1.0,
    )
    return resp.choices[0].message.content.strip()


PLATFORM_VERSIONS_PROMPT = """
Сгенерируй ЧЕТЫРЕ разные версии текста для одного поста — под четыре платформы.

ФОРМАТ ОТВЕТА строго такой:

ТЕМА: barber или lifestyle
ТЕКСТ_TG: <длинная версия для Telegram-канала — 3-5 предложений, можно с историей и атмосферой>
ТЕКСТ_IG: <короткая версия для Instagram — 1-3 предложения, цепко>
ТЕКСТ_VK: <средняя версия для ВКонтакте — 2-4 предложения>
ТЕКСТ_TIKTOK: <очень короткая для TikTok — 1 фраза, hook>
"""


def _parse_multi_response(raw: str) -> dict:
    """Парсит multi-platform ответ."""
    result = {"topic": "lifestyle", "tg": "", "ig": "", "vk": "", "tiktok": ""}
    keys_map = {
        "ТЕКСТ_TG:":     "tg",
        "ТЕКСТ_IG:":     "ig",
        "ТЕКСТ_VK:":     "vk",
        "ТЕКСТ_TIKTOK:": "tiktok",
    }
    lines = raw.split("\n")
    current_key = None
    buf = []
    for line in lines:
        stripped = line.strip()
        if stripped.upper().startswith("ТЕМА:"):
            if "barber" in stripped.lower():
                result["topic"] = "barber"
            continue
        matched = False
        for k_marker, k_dst in keys_map.items():
            if stripped.upper().startswith(k_marker):
                if current_key and buf:
                    result[current_key] = "\n".join(buf).strip()
                current_key = k_dst
                rest = stripped[len(k_marker):].strip()
                buf = [rest] if rest else []
                matched = True
                break
        if not matched and current_key:
            buf.append(line)
    if current_key and buf:
        result[current_key] = "\n".join(buf).strip()

    # Если что-то пустое — фолбэк на ig версию
    fallback = result["ig"] or result["tg"] or result["vk"] or result["tiktok"]
    for k in ("tg", "ig", "vk", "tiktok"):
        if not result[k]:
            result[k] = fallback
    return result


async def generate_platform_captions(bot, file_id: str, media_type: str, user_hint: str = "") -> dict:
    """Генерирует 4 версии текста для разных платформ. Возвращает dict с tg/ig/vk/tiktok + hashtags."""
    active = settings.get_active_model()
    try:
        image_bytes = None
        if media_type == "photo":
            image_bytes = await _download_image(bot, file_id)

        user_text = f"\n\nДополнительный контекст: {user_hint}" if user_hint else ""
        prompt = PLATFORM_VERSIONS_PROMPT + user_text

        if active == "gpt4o":
            if image_bytes:
                b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
                messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}},
                    ]}
                ]
            else:
                messages = [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"{prompt}\n\nКонтекст видео: {user_hint or 'видео из барбершопа'}"}
                ]
            resp = await openai_client.chat.completions.create(
                model="gpt-4o", messages=messages, max_tokens=1200, temperature=1.0
            )
            raw = resp.choices[0].message.content.strip()
        else:
            def call():
                if image_bytes:
                    return claude_client.messages.create(
                        model="claude-sonnet-4-5-20250929",
                        max_tokens=1200, temperature=1.0,
                        system=SYSTEM_PROMPT,
                        messages=[{"role": "user", "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                             "data": base64.standard_b64encode(image_bytes).decode("utf-8")}},
                            {"type": "text", "text": prompt},
                        ]}]
                    )
                else:
                    return claude_client.messages.create(
                        model="claude-sonnet-4-5-20250929",
                        max_tokens=1200, temperature=1.0,
                        system=SYSTEM_PROMPT,
                        messages=[{"role": "user", "content": f"{prompt}\n\nКонтекст видео: {user_hint or 'видео из барбершопа'}"}]
                    )
            msg = await asyncio.to_thread(call)
            raw = msg.content[0].text.strip()

        parsed = _parse_multi_response(raw)

        # Хэштеги — только в IG/VK
        smart = None
        try:
            if getattr(config, "PUBLER_IG_ACCOUNT", ""):
                smart = await publer_analytics.get_top_hashtags_string(config.PUBLER_IG_ACCOUNT, count=15)
        except Exception:
            pass
        hashtags = smart or (HASHTAGS_BARBER_FULL if parsed["topic"] == "barber" else HASHTAGS_LIFESTYLE)

        return {
            "tg":     parsed["tg"],
            "ig":     f"{parsed['ig']}\n\n{hashtags}",
            "vk":     parsed["vk"],
            "tiktok": parsed["tiktok"],
        }
    except Exception as e:
        log.error(f"generate_platform_captions error: {e}")
        return None


async def generate_instagram_caption(bot, file_id: str, media_type: str, user_hint: str = "") -> str:
    """Генерирует подпись через выбранную модель."""
    active = settings.get_active_model()

    try:
        image_bytes = None
        if media_type == "photo":
            image_bytes = await _download_image(bot, file_id)

        if active == "gpt4o":
            log.info("Использую GPT-4o для генерации")
            raw = await _generate_with_gpt(image_bytes, media_type, user_hint)
        else:
            log.info("Использую Claude Sonnet 4.5 для генерации")
            raw = await _generate_with_claude(image_bytes, media_type, user_hint)

        topic, caption = _parse_response(raw)

        # Топ-хэштеги из Publer если есть, иначе статические
        smart_hashtags = None
        try:
            if getattr(config, "PUBLER_IG_ACCOUNT", ""):
                smart_hashtags = await publer_analytics.get_top_hashtags_string(
                    config.PUBLER_IG_ACCOUNT, count=15
                )
        except Exception as e:
            log.error(f"smart hashtags error: {e}")

        if smart_hashtags:
            hashtags = smart_hashtags
        else:
            hashtags = HASHTAGS_BARBER_FULL if topic == "barber" else HASHTAGS_LIFESTYLE

        return f"{caption}\n\n{hashtags}"

    except Exception as e:
        log.error(f"Ошибка генерации текста ({active}): {e}")
        return f"✍️ Текст не сгенерировался ({active}). Напиши вручную.\n\n{HASHTAGS_LIFESTYLE}"
