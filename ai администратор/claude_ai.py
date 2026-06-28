import difflib
import json
import logging
from datetime import datetime

import anthropic
import httpx

import ai_billing
import database
from config import CLAUDE_API_KEY, CLAUDE_MODEL, PROXY_URL
# Быстрая модель для голосового помощника (≈2.5× быстрее Sonnet через прокси).
# Точность держится на инструментах (реальные цены/слоты), а не на модели.
try:
    from config import VOICE_CLAUDE_MODEL
except ImportError:
    VOICE_CLAUDE_MODEL = "claude-haiku-4-5"
from memory import build_context
from prompts import SYSTEM_PROMPT
from yclients import YClientsAPI, get_schedule_from_file, get_day_hours

logger = logging.getLogger(__name__)

yclients = YClientsAPI()

# На сервере в РФ Claude API геоблокирует российские IP — ходим через прокси.
# В модель уходят только обезличенные данные, поэтому гнать их через прокси безопасно.
if PROXY_URL:
    client = anthropic.Anthropic(
        api_key=CLAUDE_API_KEY,
        http_client=httpx.Client(proxy=PROXY_URL, timeout=60.0),
    )
else:
    client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

# ─── Инструменты (tools) для AI ─────────────────────────────────────────────
#
# ВАЖНО: ни один инструмент не принимает и не возвращает персональные данные
# (имя, телефон, email, идентификатор клиента). Имя и телефон собираются
# отдельным детерминированным шагом на backend и в модель не передаются.

TOOLS = [
    {
        "name": "get_services",
        "description": "Получить список услуг барбершопа с ценами и длительностью. Если клиент уже выбрал мастера — ОБЯЗАТЕЛЬНО передай staff_name, чтобы получить его личный прайс. Без staff_name вернётся общий диапазон цен.",
        "input_schema": {
            "type": "object",
            "properties": {
                "staff_name": {
                    "type": "string",
                    "description": "Имя мастера для получения его личного прайса, например 'Александр Киянский' (необязательно)",
                }
            },
        },
    },
    {
        "name": "get_masters",
        "description": "Получить список мастеров барбершопа",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_master_schedule",
        "description": "Получить график работы ОДНОГО мастера на ближайшие 14 дней — какие дни он работает и в какое время (реальные данные из YClients). Используй когда клиент спрашивает про КОНКРЕТНОГО мастера: 'когда работает Стас', 'какой график у Ильи', 'работает ли Саша в субботу'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "staff_name": {"type": "string", "description": "Имя мастера, например 'Стас Мосин'"},
                "days_ahead": {"type": "integer", "description": "Сколько дней вперёд смотреть (по умолчанию 14)"},
            },
            "required": ["staff_name"],
        },
    },
    {
        "name": "who_works",
        "description": "Узнать, КТО из мастеров работает в конкретный день, и в какие часы (реальный график из YClients). Используй когда клиент спрашивает: 'кто завтра работает', 'кто сегодня в смене', 'какие мастера работают в субботу', 'кто принимает 5 июня'. ВСЕГДА передавай конкретную дату.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Дата в формате YYYY-MM-DD, например 2026-06-01. Переводи 'сегодня'/'завтра'/'в субботу' в конкретную дату сам.",
                },
            },
            "required": ["date"],
        },
    },
    {
        "name": "get_available_slots",
        "description": "Получить свободные слоты для записи у конкретного мастера на дату. ВАЖНО: если клиент выбрал услуги — передай ВСЕ их в service_names. Тогда система учтёт суммарное время комплекса и покажет только те слоты, которые успеют завершиться до закрытия.",
        "input_schema": {
            "type": "object",
            "properties": {
                "staff_name": {"type": "string", "description": "Имя мастера, например 'Стас Мосин'"},
                "date": {
                    "type": "string",
                    "description": "Дата в формате YYYY-MM-DD, например 2026-06-15",
                },
                "service_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Список всех выбранных услуг — передавай все, чтобы учесть полное время записи (необязательно)",
                },
            },
            "required": ["staff_name", "date"],
        },
    },
    {
        "name": "find_nearest_slots",
        "description": "Найти ближайшее свободное время у мастера на ближайшие дни. Используй когда клиент говорит 'ближайшее время', 'скорее', 'когда есть', 'сегодня-завтра', 'на этой неделе' и т.п. Если клиент выбрал услуги — передай ВСЕ их в service_names, чтобы учесть суммарное время комплекса.",
        "input_schema": {
            "type": "object",
            "properties": {
                "staff_name": {"type": "string", "description": "Имя мастера, например 'Стас Мосин'"},
                "service_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Список всех выбранных услуг (необязательно)",
                },
                "days_ahead": {"type": "integer", "description": "Сколько дней вперёд искать (по умолчанию 7)"},
            },
            "required": ["staff_name"],
        },
    },
    {
        "name": "request_booking",
        "description": "Передать запись на оформление, когда клиент подтвердил услугу, мастера, дату и время. Имя и телефон НЕ передавай и НЕ спрашивай — их соберёт система отдельно. Вызывай только после явного согласия клиента.",
        "input_schema": {
            "type": "object",
            "properties": {
                "staff_name": {"type": "string", "description": "Имя мастера, например 'Стас Мосин'"},
                "service_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Список всех выбранных услуг",
                },
                "datetime_str": {
                    "type": "string",
                    "description": "Дата и время в ISO формате, например 2026-06-15T14:00:00",
                },
                "pay_with_points": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Массив с РОВНО ОДНИМ названием услуги-ухода, которую "
                        "клиент согласился оплатить баллами лояльности. За один "
                        "визит баллами можно списать только ОДНУ услугу — не "
                        "передавай несколько. Если клиент не предлагал оплатить "
                        "или отказался — НЕ передавай этот параметр. Услуга "
                        "должна быть из списка уходов: Spa для лица, "
                        "Скраб+Черная маска, Уход за кожей головы, Восковая "
                        "эпиляция (нос + уши), Массаж, Патчи."
                    ),
                },
            },
            "required": ["staff_name", "service_names", "datetime_str"],
        },
    },
    {
        "name": "remember_wanted_slot",
        "description": (
            "Запомнить, что клиент хотел КОНКРЕТНОЕ время записи, которого сейчас нет "
            "среди свободных (оно занято). Тогда, если это время освободится (кто-то "
            "отменит), мы напишем ЕМУ ПЕРВЫМ с предложением занять место. Вызывай, когда "
            "клиент явно назвал день и время у конкретного мастера, а свободного слота на "
            "него нет. После вызова обязательно предложи ближайшее свободное время как альтернативу."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "staff_name": {"type": "string", "description": "Имя мастера, например 'Стас Мосин'"},
                "datetime_str": {"type": "string", "description": "Желаемые дата и время в ISO, например 2026-06-15T18:00:00"},
            },
            "required": ["staff_name", "datetime_str"],
        },
    },
    {
        "name": "check_loyalty_balance",
        "description": (
            "Проверить баланс баллов клиента и какие услуги-уходы можно ими "
            "оплатить. Вызывай ПЕРЕД request_booking, ПОСЛЕ того как клиент "
            "выбрал услуги — но ТОЛЬКО если в выбранных услугах есть услуга-"
            "уход (Spa, Массаж, Скраб+Маска, Патчи, Эпиляция, Уход кожи "
            "головы). Если в текущем заказе нет уходов — НЕ вызывай этот "
            "инструмент. Если в ответе can_redeem=true и есть affordable — "
            "ОДИН РАЗ предложи клиенту: «У тебя X баллов, оплатить <услуга> "
            "(<цена>₽) баллами в эту запись?». Клиент согласился — передай "
            "название услуги в pay_with_points у request_booking. Отказался "
            "— не настаивай."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "current_service_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Список услуг, которые клиент сейчас выбрал",
                },
            },
            "required": ["current_service_names"],
        },
    },
    {
        "name": "get_my_bookings",
        "description": "Показать записи текущего клиента. Аргументы не нужны — система сама определит клиента. Телефон у клиента НЕ спрашивай.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "request_client_contact",
        "description": (
            "Запросить у клиента контакт защищённой кнопкой Telegram «Поделиться "
            "контактом» — Telegram сам передаст имя и телефон в зашифрованном виде, "
            "тебе их вводить или спрашивать текстом НЕ нужно. Вызывай, когда тебе "
            "нужно УЗНАТЬ клиента, чтобы помочь, а телефона у тебя нет: найти его "
            "записи, проверить что запись его, начислить баллы за историю визитов "
            "или дозаполнить имя/телефон в карточке. После вызова система покажет "
            "кнопку сама. НИКОГДА не проси имя/телефон текстом и НИКОГДА не отправляй "
            "клиента звонить администратору, чтобы добавить или исправить имя/"
            "телефон — для этого есть ровно этот инструмент."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_my_work_records",
        "description": (
            "РАБОЧИЕ записи самого мастера-сотрудника на конкретный день: кто к нему "
            "записан, во сколько, на какие услуги. Вызывай ТОЛЬКО когда боту пишет сам "
            "мастер/сотрудник и спрашивает про СВОИ записи/клиентов/услуги/загрузку "
            "('сколько у меня записей', 'во сколько какая запись', 'кто ко мне придёт', "
            "'какие услуги в пятницу'). Это НЕ запись клиента и НЕ get_my_bookings. "
            "ВСЕГДА передавай дату. Телефоны клиентов инструмент не возвращает — только имена."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Дата в формате YYYY-MM-DD. Сам переводи «сегодня»/«завтра»/«в пятницу»/«5 июня» в дату по календарю из системного промпта.",
                },
            },
            "required": ["date"],
        },
    },
    {
        "name": "get_my_tips",
        "description": (
            "Чаевые самого мастера-сотрудника: сколько ему оставили чаевых и на какую сумму "
            "(точные данные из YClients). Вызывай ТОЛЬКО когда боту пишет сам мастер и "
            "спрашивает про СВОИ чаевые ('сколько у меня чаевых', 'сколько мне начаевили', "
            "'мои чаевые', 'сколько чаевых за месяц'). По умолчанию — за всё время; "
            "можно указать период датами."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from_date": {"type": "string", "description": "Начало периода YYYY-MM-DD (необязательно — без него за всё время)"},
                "to_date": {"type": "string", "description": "Конец периода YYYY-MM-DD (необязательно)"},
            },
        },
    },
    {
        "name": "start_gift_cert_purchase",
        "description": "Запустить покупку подарочного сертификата выбранного номинала. Вызывай, когда клиент в разговоре про сертификаты определился с суммой (2000, 3000 или 5000 ₽). Система сама покажет клиенту кнопки выбора способа покупки (физический в шопе / цифровой через оплату). Имя и телефон получателя НЕ спрашивай — это соберёт система отдельно. НЕ предлагай клиенту позвонить или приехать — кнопки сами всё это закроют.",
        "input_schema": {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "integer",
                    "description": "Номинал сертификата в рублях. Допустимы ТОЛЬКО 2000, 3000 или 5000.",
                },
            },
            "required": ["amount"],
        },
    },
    {
        "name": "show_subscription_plans",
        "description": "Показать клиенту каталог абонементов (месячные подписки со скидкой). Вызывай, когда клиент хочет купить/оформить абонемент, спрашивает про абонементы или подписки. Система сама покажет тарифы, уровни (Старший/Топ) и кнопки покупки — НЕ перечисляй цены и тарифы словами, НЕ предлагай позвонить. Это НЕ запись на услугу.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "check_birthday_promo",
        "description": (
            "Проверить, есть ли у клиента активный ДР-промокод от барбершопа "
            "(скидка 20%). Вызывай ОДИН РАЗ при первом обращении клиента в "
            "диалоге, чтобы знать, нужно ли напомнить про промокод при записи. "
            "Если в ответе active=true — мягко упомяни: «Кстати, у тебя ещё "
            "действует промокод BDAY-XXXXXX на -20%, не забудь сказать мастеру». "
            "Не упоминай повторно в этом же диалоге."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "suggest_upsell",
        "description": (
            "Получить рекомендации по апсейлу ПЕРЕД оформлением записи. Возвращает: "
            "(1) suggestions — допуслуги, которые клиент брал на прошлых визитах "
            "(персонально, «как в прошлый раз»); (2) menu_addons — подходящие допуслуги "
            "из меню салона с ценами (оформление/тонирование бороды, укладка, тонирование "
            "головы, уход, spa и т.п.) — их можно предлагать ЛЮБОМУ клиенту, даже новому. "
            "Вызывай ПОСЛЕ того как клиент назвал услуги и ПЕРЕД request_booking. ВАЖНО: "
            "прочитай поле instruction в ответе и следуй ему — мягко, одной короткой "
            "дружелюбной фразой предложи 1–2 уместные допуслуги: сначала из suggestions "
            "(если есть), иначе из menu_addons (обязательно с ценой). «Да» — добавь в заказ. "
            "«Нет» — не настаивай. Только если И suggestions, И menu_addons пустые — ничего "
            "не предлагай, продолжай оформление."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "current_service_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Услуги, которые клиент уже выбрал на этот визит — чтобы не предлагать их повторно",
                },
            },
            "required": ["current_service_names"],
        },
    },
    {
        "name": "reschedule_booking",
        "description": "Перенести запись на другое время. Используй когда клиент хочет изменить дату/время существующей записи. Инструмент сам освобождает старый слот перед поиском нового, поэтому текущее время клиента не будет мешать.",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id":      {"type": "integer", "description": "ID текущей записи (из get_my_bookings)"},
                "new_datetime_str": {"type": "string",  "description": "Новые дата и время ISO, например 2026-06-15T14:00:00"},
                "service_names":  {
                    "type": "array", "items": {"type": "string"},
                    "description": "Новый список услуг (если нужно изменить). Если не меняется — не передавай."
                },
                "staff_name":     {"type": "string", "description": "Имя мастера (нужно для поиска ID услуг если меняются)"},
            },
            "required": ["record_id", "new_datetime_str"],
        },
    },
    {
        "name": "update_booking",
        "description": "Добавить услугу к существующей записи клиента. Используй когда клиент хочет дополнить запись новой услугой.",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id": {"type": "integer", "description": "ID записи (из get_my_bookings)"},
                "service_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Полный список услуг (существующие + новые), например ['Мужская стрижка', 'Моделирование бороды', 'Окантовка']"
                },
                "staff_name": {"type": "string", "description": "Имя мастера для поиска ID услуг"},
            },
            "required": ["record_id", "service_names", "staff_name"],
        },
    },
    {
        "name": "cancel_booking",
        "description": "Отменить запись клиента",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id": {"type": "integer", "description": "ID записи для отмены (из get_my_bookings)"}
            },
            "required": ["record_id"],
        },
    },
    {
        "name": "get_business_report",
        "description": (
            "ТОЛЬКО для владельца/админа. Сводка по бизнесу за период: выручка "
            "(наличные/карта/итого), число визитов, средний чек и зарплаты мастеров "
            "(валовая × процент, владелец 100%). Вызывай, когда владелец спрашивает "
            "«как дела / как неделя / сколько заработали / какая касса / сколько "
            "выплатить мастерам / кто сколько сделал / средний чек за месяц». "
            "Для вопросов о ДИНАМИКЕ и самочувствии бизнеса («как чувствует себя "
            "бизнес / лучше или хуже / растём или падаем / динамика») ставь "
            "compare=true — добавится сравнение с предыдущим периодом и сигнал "
            "рост/спад. Для «что лучше продаётся / топ услуг / на чём зарабатываем» "
            "ставь top_services=true. Это аналитика ТОЛЬКО ДЛЯ ЧТЕНИЯ — ничего не "
            "меняет и не трогает кассу."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["today", "yesterday", "week", "last_week", "month", "last_30"],
                    "description": "Готовый период: today=сегодня, yesterday=вчера, week=эта неделя (с понедельника), last_week=прошлая неделя, month=этот месяц, last_30=последние 30 дней.",
                },
                "date_from": {"type": "string", "description": "Начало произвольного диапазона YYYY-MM-DD (вместо period)."},
                "date_to": {"type": "string", "description": "Конец произвольного диапазона YYYY-MM-DD, включительно."},
                "compare": {"type": "boolean", "description": "Сравнить с предыдущим аналогичным периодом (динамика рост/спад). Для вопросов «как чувствует себя бизнес / лучше-хуже / динамика»."},
                "top_services": {"type": "boolean", "description": "Включить топ услуг по выручке за период (что чаще берут и на какую сумму)."},
            },
            "required": [],
        },
    },
    {
        "name": "get_client_dossier",
        "description": (
            "ТОЛЬКО для мастера/владельца. Досье о клиенте перед визитом по имени "
            "или телефону: история стрижек (что брал, как часто, любимые услуги, "
            "средний цикл), и привычки/предпочтения, которые MAYA запомнила («любит "
            "фейд», «не любит болтать»). Вызывай, когда сотрудник спрашивает «что за "
            "клиент придёт», «расскажи про <имя>», «что обычно делает этот клиент», "
            "«что ему предложить». ТОЛЬКО ЧТЕНИЕ. Телефон клиента НЕ показывай — только имя."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Имя клиента (≥3 букв) или телефон (≥4 цифр) для поиска."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "remember_client_preference",
        "description": (
            "Сохранить ОДНО предпочтение/привычку текущего клиента, которое он сам "
            "сообщил в разговоре: «любит фейд», «не любит разговоры в кресле», «кофе "
            "без сахара», «стрижётся раз в 3 недели», «чувствительная кожа». Вызывай "
            "только когда клиент это явно сказал. НЕ сохраняй имя, телефон, адрес и "
            "прочие персональные данные — только короткую привычку/предпочтение. "
            "Это сделает сервис персональным и поможет мастеру."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "preference": {"type": "string", "description": "Короткая формулировка привычки/предпочтения, без ПД. Пример: «предпочитает фейд», «не любит болтать»."},
            },
            "required": ["preference"],
        },
    },
    {
        "name": "barber_knowledge",
        "description": (
            "База знаний салона по технике стрижек и бороды (для мастеров и "
            "владельца). Вызывай, когда сотрудник спрашивает КАК что-то стричь/делать: "
            "«как сделать фейд», «какая насадка», «как растушевать переход», «что идёт "
            "круглому лицу», «как смоделировать бороду», «частые ошибки». Отвечай ТОЛЬКО "
            "по тому, что вернёт инструмент. Если found=false — честно скажи, что в базе "
            "салона этого пока нет, и предложи уточнить у Стаса. НЕ выдумывай технику от себя."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Вопрос мастера по технике стрижки/бороды."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "remember_business_rule",
        "description": (
            "ТОЛЬКО для владельца. Сохранить операционное ПРАВИЛО салона, которое "
            "владелец задаёт словами, чтобы ты соблюдала его дальше в работе со всеми: "
            "«новым клиентам всегда предлагай комплекс стрижка+борода», «по субботам "
            "не записывай позже 20:00», «парковка бесплатная во дворе», «при отмене "
            "предлагай перенос». Вызывай, когда владелец явно формулирует такое "
            "правило/распоряжение. Коротко и по делу, без персональных данных. "
            "После сохранения подтверди владельцу одной фразой."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "rule": {"type": "string", "description": "Короткая формулировка правила салона, без ПД."},
            },
            "required": ["rule"],
        },
    },
    {
        "name": "forget_business_rule",
        "description": (
            "ТОЛЬКО для владельца. Отменить ранее заданное правило салона по его номеру "
            "(id из списка «Правила салона» в твоём контексте). Вызывай, когда владелец "
            "просит «убери/отмени правило N» или «больше так не делай»."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "rule_id": {"type": "integer", "description": "Номер правила (id) из списка действующих правил салона."},
            },
            "required": ["rule_id"],
        },
    },
]

# Маркер cache_control на последнем инструменте говорит Anthropic кешировать
# весь массив tools — он статичен и одинаков для всех вызовов. Повторные
# запросы получают эту часть со скидкой 90%.
TOOLS_CACHED = TOOLS[:-1] + [{**TOOLS[-1], "cache_control": {"type": "ephemeral"}}]


# ─── RBAC: роль решает, какие инструменты вообще уходят в модель ─────────────
#
# Принципы (OWASP LLM01/06): авторизация ДЕТЕРМИНИРОВАННАЯ и на сервере.
#   • роль берём из user_id (сессия), НИКОГДА из аргументов модели → нет IDOR;
#   • модель не получает «лишних» инструментов (срез tools= по роли);
#   • _authorize() — второй рубеж между tool_use и хендлером (defense-in-depth);
#   • «любая тема по допуску» решается ОТДЕЛЬНО в промпте (topic-scope ≠ data-scope):
#     основателю снимаем тематический ограничитель, но доступ к данным/деньгам
#     по-прежнему режется инструментами и гейтом.
#
# Наборы строим ПО ИСКЛЮЧЕНИЮ: клиент видит всё, кроме привилегированного —
# так нельзя случайно потерять клиентский инструмент и сломать запись.

# Основатель (Стас, GOD-режим): любая тема + полный доступ.
FOUNDER_IDS = {948205934}

# Инструменты роли мастера: свои записи/чаевые + досье клиента + база знаний.
_MASTER_ONLY = {"get_my_work_records", "get_my_tips", "get_client_dossier", "barber_knowledge"}
# Инструменты роли владельца: аналитика бизнеса + правила салона (procedural-память).
_OWNER_ONLY = {"get_business_report", "remember_business_rule", "forget_business_rule"}
_PRIVILEGED = _MASTER_ONLY | _OWNER_ONLY

_ALL_TOOL_NAMES = {t["name"] for t in TOOLS}
_CLIENT_TOOLS = _ALL_TOOL_NAMES - _PRIVILEGED          # справка + запись на себя + лояльность
_MASTER_TOOLS = _CLIENT_TOOLS | _MASTER_ONLY           # + кабинет мастера
_OWNER_TOOLS = set(_ALL_TOOL_NAMES)                    # владелец видит всё

ROLE_TOOLS = {
    "client": _CLIENT_TOOLS,
    "master": _MASTER_TOOLS,
    "owner": _OWNER_TOOLS,
    "founder": _OWNER_TOOLS,  # отличие основателя — тема, а не инструменты
}

_ROLE_TOOLS_CACHED = {}


def _resolve_role(user_id) -> str:
    """Серверная роль по user_id (из сессии, не из аргументов модели)."""
    if not user_id:
        return "client"
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return "client"
    if uid in FOUNDER_IDS:
        return "founder"
    try:
        if database.is_admin(uid):
            return "owner"
        if database.get_master_by_chat_id(uid):
            return "master"
    except Exception:
        pass
    return "client"


def _tools_for_role(role: str) -> list:
    """Срез TOOLS по роли. Порядок наследуется от TOOLS → у каждой роли свой
    стабильный префикс, prompt-cache не ломается. cache_control на последнем."""
    if role not in _ROLE_TOOLS_CACHED:
        allowed = ROLE_TOOLS.get(role, _CLIENT_TOOLS)
        tools = [t for t in TOOLS if t["name"] in allowed]
        _ROLE_TOOLS_CACHED[role] = (
            tools[:-1] + [{**tools[-1], "cache_control": {"type": "ephemeral"}}]
            if tools else TOOLS_CACHED
        )
    return _ROLE_TOOLS_CACHED[role]


def _authorize(role: str, tool_name: str) -> bool:
    """Второй рубеж: вправе ли роль вызвать инструмент. Детерминированно."""
    return tool_name in ROLE_TOOLS.get(role, _CLIENT_TOOLS)


# ─── Risk-tiering + human-in-the-loop (HITL) ─────────────────────────────────
#
# Каждый инструмент имеет тир риска: read (чтение) / write (нейтральная запись) /
# money (деньги/разрушающее → нужен ручной контур владельца). Это каркас для
# безопасной операционной автономии: когда добавим write-инструменты с деньгами,
# они по умолчанию НЕ исполнятся автономно (см. _HITL_TOOLS). Все вызовы пишутся
# в аудит (database.log_tool_call) — наблюдаемость + 152-ФЗ + GOD-режим «Здоровье».
_WRITE_TOOLS = {
    "request_booking", "remember_wanted_slot", "request_client_contact",
    "reschedule_booking", "update_booking", "cancel_booking",
    "remember_client_preference", "start_gift_cert_purchase",
    "remember_business_rule", "forget_business_rule",
}
# Денежные/разрушающие инструменты, требующие подтверждения владельца.
# Сейчас ПУСТО: оплата визита идёт ручным админ-путём (panel_journal_pay), а НЕ
# через модель — поэтому автономных денежных инструментов у LLM нет. Набор —
# безопасный дефолт на будущее: добавишь money-инструмент → он сам собой попадёт
# под ручной контур, пока в tool_input не придёт _owner_confirmed=True.
_HITL_TOOLS: set = set()


def _tool_risk(tool_name: str) -> str:
    if tool_name in _HITL_TOOLS:
        return "money"
    if tool_name in _WRITE_TOOLS:
        return "write"
    return "read"


def _resolve_staff_id(name: str) -> int | None:
    """Находит ID мастера по имени (полному или частичному)."""
    masters = yclients.get_masters()
    name_lower = name.lower().strip()
    for m in masters:
        if name_lower in m["name"].lower() or m["name"].lower() in name_lower:
            return m["id"]
    return None


def _resolve_service_id(name: str, staff_id: int = None) -> int | None:
    """
    Находит ID услуги по названию. Терпим к неточным формулировкам:
    точное → подстрока → совпадение по словам → нечёткое совпадение.
    """
    services = [s for s in yclients.get_services(staff_id)
                if isinstance(s, dict) and s.get("title")]
    if not services:
        return None
    name_lower = name.lower().strip()

    def _ratio(a: str, b: str) -> float:
        return difflib.SequenceMatcher(None, a, b).ratio()

    # 1. Точное совпадение названия
    for s in services:
        if s["title"].lower().strip() == name_lower:
            return s["id"]

    # 2. Вхождение подстрокой; при нескольких кандидатах — самый похожий
    substr = [s for s in services
              if name_lower in s["title"].lower() or s["title"].lower() in name_lower]
    if substr:
        return max(substr, key=lambda s: _ratio(name_lower, s["title"].lower()))["id"]

    # 3. Совпадение по набору слов — терпимо к порядку слов
    qwords = set(name_lower.split())
    if qwords:
        cand = []
        for s in services:
            twords = set(s["title"].lower().split())
            overlap = len(qwords & twords) / len(qwords)
            if overlap >= 0.6:
                cand.append((overlap, _ratio(name_lower, s["title"].lower()), s))
        if cand:
            return max(cand, key=lambda c: (c[0], c[1]))[2]["id"]

    # 4. Нечёткое совпадение по схожести названий (опечатки)
    titles_map = {s["title"].lower(): s["id"] for s in services}
    close = difflib.get_close_matches(name_lower, list(titles_map), n=1, cutoff=0.6)
    if close:
        return titles_map[close[0]]
    return None


def _resolve_service_ids(names, staff_id: int = None) -> list[int]:
    """Резолвит список названий услуг в список ID. Ненайденные пропускаются."""
    if isinstance(names, str):
        names = [names]
    ids = []
    for n in names or []:
        sid = _resolve_service_id(n, staff_id)
        if sid:
            ids.append(sid)
    return ids


def _check_record_ownership(user_id: int, record_id: int) -> dict | None:
    """
    Проверяет, что запись принадлежит этому пользователю (его номеру).
    Защита от случая, когда A записал друга B, а потом пытается через бота
    перенести/отменить запись друга — нельзя.

    Возвращает None если всё ок (доступ разрешён), либо dict с status=error,
    если доступа нет / запись не найдена / не можем проверить.
    """
    # У клиента должен быть сохранён телефон — иначе ничего не сравним
    client_row = database.get_client(user_id) if user_id else None
    if not client_row or not client_row.get("phone"):
        return {
            "status": "error",
            "error": "телефон_не_известен",
            "message": (
                "Не получается проверить, что запись твоя — я тебя ещё не узнал. "
                "Вызови инструмент request_client_contact, чтобы система показала "
                "кнопку «Поделиться контактом». НЕ отправляй клиента к "
                "администратору ради этого."
            ),
        }

    record = yclients.get_record(record_id)
    if not record:
        return {
            "status": "error",
            "error": "запись_не_найдена",
            "message": f"Запись #{record_id} не найдена в системе.",
        }

    record_phone = (record.get("client") or {}).get("phone") or ""

    # Сравниваем последние 10 цифр — чтобы +7 / 8 / без +7 одинаково обрабатывались
    def _digits10(p: str) -> str:
        d = "".join(c for c in (p or "") if c.isdigit())
        return d[-10:]

    if _digits10(record_phone) != _digits10(client_row["phone"]):
        return {
            "status": "error",
            "error": "не_ваша_запись",
            "message": (
                "Эта запись оформлена на другой номер телефона. "
                "Изменить или отменить её может только владелец того номера. "
                "Если нужно срочно — свяжитесь с администратором: 8-962-447-67-47"
            ),
        }

    return None  # доступ разрешён


def _resolve_user_record_id(user_id: int, ai_record_id) -> tuple:
    """LLM часто ИСКАЖАЕТ длинный record_id (теряет/путает цифры), из-за чего
    отмена/перенос падают с «запись не найдена». Сопоставляем переданный моделью
    id с РЕАЛЬНЫМИ предстоящими записями клиента (по его телефону):
      • точное совпадение -> берём его;
      • если предстоящая запись ровно одна -> берём её (модель явно про неё);
      • иначе -> просим уточнить (несколько записей).
    Возвращает (real_record_id|None, upcoming_list, err_dict|None). Заодно это
    гарантирует, что мы НИКОГДА не трогаем чужую запись."""
    client_row = database.get_client(user_id) if user_id else None
    if not client_row or not client_row.get("phone"):
        return None, [], {
            "status": "error",
            "error": "телефон_не_известен",
            "message": ("Чтобы найти твои записи, мне нужно тебя узнать. Вызови "
                        "инструмент request_client_contact — система попросит "
                        "поделиться контактом кнопкой. НЕ предлагай звонить "
                        "администратору."),
        }
    try:
        bookings = yclients.get_client_bookings(client_row["phone"]) or []
    except Exception as e:
        logger.error(f"_resolve_user_record_id: get_client_bookings err: {e}")
        return None, [], {"status": "error",
                          "message": "Не удалось получить ваши записи, попробуйте ещё раз."}
    today = datetime.now().strftime("%Y-%m-%d")
    upcoming = []
    for b in bookings:
        if isinstance(b, dict) and b.get("record_id"):
            dt = (b.get("datetime") or b.get("date") or "")[:10]
            if dt < today or b.get("attendance") == 1:
                continue
            upcoming.append(b)
    if not upcoming:
        return None, [], {"status": "error",
                          "message": "У вас нет предстоящих записей."}
    ids = [int(b["record_id"]) for b in upcoming if str(b.get("record_id")).isdigit()]
    try:
        aid = int(ai_record_id)
    except Exception:
        aid = None
    if aid in ids:
        return aid, upcoming, None
    if len(ids) == 1:
        return ids[0], upcoming, None
    lst = "; ".join(
        f"{(b.get('datetime') or '')[:16].replace('T', ' ')} — {b.get('master') or ''}"
        for b in upcoming
    )
    return None, upcoming, {
        "status": "need_clarification",
        "message": (f"У клиента несколько предстоящих записей: {lst}. "
                    "Уточни у него, какую именно отменить/перенести, и вызови "
                    "инструмент с её record_id из get_my_bookings."),
    }


def _check_booking_fits(
    staff_id: int, staff_name: str, service_ids: list[int], datetime_str: str
) -> dict | None:
    """
    Проверяет, успеет ли комплекс услуг завершиться до закрытия мастера.
    Возвращает None если всё ок, либо dict с понятным сообщением, если не помещается.
    При любой неопределённости (нет данных) — не блокирует запись.
    """
    from datetime import datetime, timedelta
    try:
        # Суммарная длительность услуг в секундах
        services = yclients.get_services(staff_id)
        durations = {
            s["id"]: s.get("duration", 0)
            for s in services
            if isinstance(s, dict) and s.get("id")
        }
        total_sec = sum(durations.get(sid, 0) for sid in service_ids)
        if total_sec <= 0:
            return None  # длительность неизвестна — не блокируем

        start_dt = datetime.fromisoformat(datetime_str)
        end_dt = start_dt + timedelta(seconds=total_sec)

        # Время закрытия мастера в этот день (из schedule.json)
        hours = get_day_hours(staff_name, start_dt.date())
        if not hours or "-" not in hours:
            return None  # нет данных о графике — не блокируем
        close_str = hours.split("-")[1].strip()
        ch, cm = map(int, close_str.split(":"))
        close_dt = start_dt.replace(hour=ch, minute=cm, second=0, microsecond=0)

        if end_dt > close_dt:
            total_min = total_sec // 60
            return {
                "message": (
                    f"Этот комплекс занимает примерно {total_min} мин и при записи "
                    f"на {start_dt.strftime('%H:%M')} закончится в {end_dt.strftime('%H:%M')}, "
                    f"а мастер работает до {close_str}. Записать на это время не получится — "
                    f"предложи клиенту время пораньше или убрать часть услуг."
                ),
            }
        return None
    except Exception:
        return None  # при любой ошибке не блокируем — пусть YClients решит сам


def _execute_tool(tool_name: str, tool_input: dict, user_id: int = None) -> str:
    """Выполняет вызов инструмента и возвращает результат как строку."""
    logger.info(f"🔧 Вызов инструмента: {tool_name} | Параметры: {tool_input}")
    # RBAC, рубеж 2: даже если инструмент как-то просочился в запрос — режем по роли.
    _role = _resolve_role(user_id)
    _risk = _tool_risk(tool_name)
    if not _authorize(_role, tool_name):
        logger.warning(f"⛔ RBAC deny: роль '{_role}' (user {user_id}) → {tool_name}")
        database.log_tool_call(user_id, _role, tool_name, _risk, False, "rbac")
        return json.dumps(
            {"error": "Этот инструмент доступен только сотрудникам или владельцу."},
            ensure_ascii=False,
        )
    # HITL: денежные/разрушающие действия не исполняем автономно без подтверждения.
    if tool_name in _HITL_TOOLS and not (tool_input or {}).get("_owner_confirmed"):
        logger.warning(f"⛔ HITL: {tool_name} требует подтверждения владельца (user {user_id})")
        database.log_tool_call(user_id, _role, tool_name, _risk, False, "hitl")
        return json.dumps(
            {"error": "Это действие затрагивает деньги и требует подтверждения владельца."},
            ensure_ascii=False,
        )
    database.log_tool_call(user_id, _role, tool_name, _risk, True, "")
    try:
        if tool_name == "get_services":
            staff_id = None
            if tool_input.get("staff_name"):
                staff_id = _resolve_staff_id(tool_input["staff_name"])
            result = yclients.get_services(staff_id)
        elif tool_name == "get_masters":
            result = yclients.get_masters()
        elif tool_name == "find_nearest_slots":
            staff_id = _resolve_staff_id(tool_input["staff_name"])
            if not staff_id:
                return json.dumps({"error": f"Мастер '{tool_input['staff_name']}' не найден"})
            service_ids = _resolve_service_ids(tool_input.get("service_names", []), staff_id)
            result = yclients.find_nearest_slots(
                staff_id=staff_id,
                service_ids=service_ids or None,
                days_ahead=tool_input.get("days_ahead", 7),
            )
        elif tool_name == "get_master_schedule":
            staff_id = _resolve_staff_id(tool_input["staff_name"])
            if not staff_id:
                return json.dumps(
                    {"error": f"Мастер '{tool_input['staff_name']}' не найден"},
                    ensure_ascii=False,
                )
            result = yclients.get_master_schedule_api(
                staff_id=staff_id,
                days_ahead=tool_input.get("days_ahead", 14),
            )
        elif tool_name == "who_works":
            result = yclients.who_works_on(tool_input["date"])
        elif tool_name == "get_available_slots":
            staff_id = _resolve_staff_id(tool_input["staff_name"])
            if not staff_id:
                return json.dumps({"error": f"Мастер '{tool_input['staff_name']}' не найден"})
            service_ids = _resolve_service_ids(tool_input.get("service_names", []), staff_id)
            result = yclients.get_available_slots(
                staff_id=staff_id,
                date=tool_input["date"],
                service_ids=service_ids or None,
            )
        elif tool_name == "request_booking":
            # Проверяем запись и передаём на backend для сбора контактов.
            # Персональные данные тут НЕ участвуют.
            staff_name = tool_input["staff_name"]
            staff_id = _resolve_staff_id(staff_name)
            if not staff_id:
                return json.dumps(
                    {"status": "error", "message": f"Мастер '{staff_name}' не найден"},
                    ensure_ascii=False,
                )
            service_names = tool_input.get("service_names", [])
            if isinstance(service_names, str):
                service_names = [service_names]
            service_ids = _resolve_service_ids(service_names, staff_id)
            if not service_ids:
                return json.dumps(
                    {"status": "error", "message": f"Услуги не найдены: {service_names}"},
                    ensure_ascii=False,
                )
            datetime_str = tool_input["datetime_str"]
            fit_error = _check_booking_fits(staff_id, staff_name, service_ids, datetime_str)
            if fit_error:
                logger.info(f"⛔ Запись не помещается в график: {fit_error['message']}")
                return json.dumps(
                    {"status": "error", "error": "не_помещается", "message": fit_error["message"]},
                    ensure_ascii=False,
                )
            # pay_with_points: правило бизнеса — за один визит баллами можно
            # списать ТОЛЬКО ОДНУ услугу-уход. Если AI прислал несколько —
            # бэкенд оставит самую дорогую (выгодно клиенту).
            pay_with_points = tool_input.get("pay_with_points") or []
            import loyalty as _loy
            care_lookup = {c["title"].lower(): c for c in _loy.CARE_SERVICES}
            # 1) фильтруем: только реальные услуги-уходы И только те, что в заказе
            in_order_lower = {s.lower() for s in service_names}
            candidates = []
            for svc in pay_with_points:
                norm = (svc or "").strip().lower()
                if norm in care_lookup and norm in in_order_lower:
                    candidates.append(care_lookup[norm])
            # 2) проверяем баланс клиента
            balance = 0
            if user_id:
                client_row = database.get_client(user_id)
                if client_row:
                    balance = database.loyalty_balance(client_row["id"])
            # 3) оставляем максимум 1 услугу — самую дорогую из тех, на которые
            # хватает баллов
            valid_pwp: list[str] = []
            affordable = [c for c in candidates if balance >= c["price"]]
            if affordable:
                # самая дорогая = максимальная экономия для клиента
                best = max(affordable, key=lambda c: c["price"])
                valid_pwp = [best["title"]]
            if len(pay_with_points) > 1 and valid_pwp:
                logger.info(
                    f"request_booking: AI прислал {len(pay_with_points)} услуг "
                    f"в pay_with_points, оставлена только одна (правило бизнеса): "
                    f"{valid_pwp[0]}"
                )
            result = {
                "status": "ready",
                "staff_id": staff_id,
                "staff_name": staff_name,
                "service_ids": service_ids,
                "service_names": service_names,
                "datetime_str": datetime_str,
                "pay_with_points": valid_pwp,
                "instruction": (
                    "Запись проверена. Скажи клиенту одной короткой фразой, что "
                    "передаёшь запись на оформление. Имя и телефон НЕ спрашивай. "
                    + (
                        f"Услуги {', '.join(valid_pwp)} клиент оплатит баллами — "
                        f"баллы спишутся после записи."
                        if valid_pwp else ""
                    )
                ),
            }
        elif tool_name == "remember_wanted_slot":
            staff_name = tool_input.get("staff_name", "")
            staff_id = _resolve_staff_id(staff_name)
            if not staff_id:
                return json.dumps({"status": "error", "message": f"Мастер '{staff_name}' не найден"}, ensure_ascii=False)
            if not user_id:
                return json.dumps({"status": "skip", "message": "Нет клиента для запоминания"}, ensure_ascii=False)
            slot_iso = str(tool_input.get("datetime_str") or "").replace(" ", "T")[:16]
            saved = False
            try:
                client_id = database.get_or_create_client(user_id)
                saved = database.add_slot_interest(client_id, user_id, staff_id, slot_iso)
            except Exception as e:
                logger.error(f"remember_wanted_slot: {e}")
            result = {
                "status": "saved" if saved else "error",
                "instruction": (
                    "Скажи клиенту, что запомнил это время и напишешь ему ПЕРВЫМ, если оно "
                    "освободится. И сразу предложи ближайшее свободное время как альтернативу."
                    if saved else
                    "Не удалось запомнить время. Просто предложи ближайшее свободное."
                ),
            }
        elif tool_name == "check_loyalty_balance":
            import loyalty as _loy
            current_services = tool_input.get("current_service_names") or []
            current_lower = {s.lower().strip() for s in current_services}
            # Какие услуги-уходы есть в текущем заказе
            care_in_order = [
                c for c in _loy.CARE_SERVICES
                if c["title"].lower() in current_lower
            ]
            client_row = database.get_client(user_id) if user_id else None
            balance = database.loyalty_balance(client_row["id"]) if client_row else 0
            affordable = [
                {"title": c["title"], "price": c["price"]}
                for c in care_in_order if balance >= c["price"]
            ]
            # Самая дорогая доступная услуга — её и предлагаем (макс. выгода клиенту)
            best = max(affordable, key=lambda x: x["price"]) if affordable else None
            result = {
                "balance": balance,
                "care_in_order": [c["title"] for c in care_in_order],
                "affordable": affordable,
                "best_to_offer": best,  # AI должен предлагать именно её
                "can_redeem": bool(affordable),
                "instruction": (
                    "ПРАВИЛО: за один визит можно списать баллами ТОЛЬКО ОДНУ "
                    "услугу-уход. Если в affordable несколько — предлагай "
                    "ИМЕННО best_to_offer (самую дорогую — это максимальная "
                    "выгода клиенту). "
                    "Если can_redeem=true И в этом диалоге ещё НЕ предлагал — "
                    "мягко спроси ОДИН РАЗ: «У тебя {balance} баллов — оплатить "
                    "{best_to_offer.title} ({best_to_offer.price}₽) баллами или "
                    "копить дальше? (баллами можно списать только одну услугу за "
                    "визит)». Клиент сказал «оплатить»/«списать»/«да» → передай "
                    "ОДНО название (best_to_offer.title) в pay_with_points у "
                    "request_booking. «Копить»/«нет» — переходи к подтверждению "
                    "без баллов, не настаивай. Если can_redeem=false — НЕ "
                    "упоминай баллы вообще."
                ),
            }
        elif tool_name == "start_gift_cert_purchase":
            amount = tool_input.get("amount")
            if amount not in (2000, 3000, 5000):
                return json.dumps({
                    "status": "error",
                    "message": "Доступны только номиналы 2000, 3000 и 5000 ₽.",
                }, ensure_ascii=False)
            result = {
                "status": "ready",
                "amount": amount,
                "instruction": (
                    "Подарочный сертификат запущен. Скажи клиенту одной короткой "
                    "фразой, что сейчас покажешь способы покупки (например: «Отлично, "
                    "сертификат на N ₽! Выберите способ покупки 👇»). НЕ предлагай "
                    "клиенту позвонить или приехать — система сама покажет кнопки."
                ),
            }
        elif tool_name == "show_subscription_plans":
            result = {
                "status": "ready",
                "instruction": (
                    "Каталог абонементов запущен. Скажи клиенту одной короткой фразой, "
                    "что сейчас покажешь абонементы (например: «Отлично! Покажу наши "
                    "абонементы — выбирайте тариф и уровень 👇»). НЕ перечисляй цены и "
                    "тарифы словами и НЕ предлагай позвонить — система покажет всё сама."
                ),
            }
        elif tool_name == "request_client_contact":
            # Сигнал бэкенду показать защищённую кнопку «Поделиться контактом».
            # Сами ПД здесь не трогаем — их безопасно соберёт Telegram-кнопка,
            # backend сохранит имя+телефон в карточку клиента.
            result = {
                "status": "ready",
                "instruction": (
                    "Система сейчас покажет клиенту кнопку «Поделиться контактом». "
                    "Скажи ОДНУ короткую дружелюбную фразу, что для этого нужно "
                    "нажать кнопку ниже. НЕ проси телефон текстом, НЕ зови к "
                    "администратору."
                ),
            }
        elif tool_name == "get_my_bookings":
            client_row = database.get_client(user_id) if user_id else None
            if not client_row or not client_row.get("phone"):
                result = {
                    "status": "нужен_контакт",
                    "message": ("Чтобы показать твои записи, мне нужно тебя узнать. "
                                "Вызови инструмент request_client_contact — система "
                                "покажет кнопку «Поделиться контактом». НЕ предлагай "
                                "звонить администратору и НЕ проси телефон текстом."),
                }
            else:
                bookings = yclients.get_client_bookings(client_row["phone"])
                today_str = datetime.now().strftime("%Y-%m-%d")
                # Только будущие или сегодняшние записи + ещё не посещённые
                cleaned = []
                for b in bookings:
                    if isinstance(b, dict) and b.get("record_id"):
                        dt = (b.get("datetime") or b.get("date") or "")[:10]
                        if dt < today_str:
                            continue
                        if b.get("attendance") == 1:
                            continue
                        # Услуги отдаём AI в виде списка названий, не dict'ов
                        svc_titles = b.get("service_titles") or [
                            (s.get("title") if isinstance(s, dict) else str(s))
                            for s in (b.get("services") or [])
                        ]
                        cleaned.append({
                            "record_id": b.get("record_id"),
                            "datetime": b.get("datetime"),
                            "services": svc_titles,
                            "master": b.get("master"),
                        })
                    else:
                        cleaned.append(b)
                if not cleaned:
                    cleaned = [{"message": "Будущих записей нет."}]
                result = cleaned
        elif tool_name == "get_my_work_records":
            master = database.get_master_by_chat_id(int(user_id)) if user_id else None
            sid = (master or {}).get("yclients_staff_id")
            date = (tool_input.get("date") or "").strip()
            if not sid:
                result = {"error": "Вы не распознаны как мастер — рабочие записи доступны только сотруднику."}
            elif not date:
                result = {"error": "Не указана дата."}
            else:
                recs = yclients.get_records_for_master(int(sid), date, date) or []
                items = []
                for r in recs:
                    if not isinstance(r, dict):
                        continue
                    if r.get("deleted"):
                        continue
                    dt = str(r.get("datetime") or r.get("date") or "")
                    tm = dt[11:16] if len(dt) >= 16 else dt
                    svcs = [s.get("title") for s in (r.get("services") or [])
                            if isinstance(s, dict) and s.get("title")]
                    cost = 0
                    for s in (r.get("services") or []):
                        if isinstance(s, dict):
                            try:
                                cost += int(s.get("cost") or 0)
                            except (TypeError, ValueError):
                                pass
                    cl = r.get("client") or {}
                    cname = "клиент"  # 152-ФЗ: имя клиента НЕ передаём в LLM (Claude/США); мастер видит имя в журнале (YClients, РФ)
                    status = {1: "пришёл", -1: "не пришёл", 2: "подтвердил"}.get(
                        r.get("attendance"), "ожидается")
                    items.append({
                        "time": tm, "client": cname, "services": svcs,
                        "cost": cost, "status": status,
                    })
                items.sort(key=lambda x: x["time"])
                result = {
                    "date": date,
                    "count": len(items),
                    "total_sum": sum(i["cost"] for i in items),
                    "records": items,
                    "note": "Телефоны клиентов не передаются (защита базы). Показывай мастеру только имя клиента.",
                }
        elif tool_name == "get_my_tips":
            master = database.get_master_by_chat_id(int(user_id)) if user_id else None
            sid = (master or {}).get("yclients_staff_id")
            if not sid:
                result = {"error": "Вы не распознаны как мастер — чаевые доступны только сотруднику."}
            else:
                fd = tool_input.get("from_date")
                td = tool_input.get("to_date")
                t = yclients.tips_for_master(int(sid), fd, td)
                result = {
                    "count": int(t.get("count") or 0),
                    "total": int(t.get("total") or 0),
                    "period": ("за всё время" if not (fd or td) else f"{fd or '…'} — {td or '…'}"),
                    "note": "Точные данные из YClients.",
                }
        elif tool_name == "check_birthday_promo":
            promo = database.get_active_birthday_promo(user_id) if user_id else None
            if not promo:
                result = {"active": False}
            else:
                result = {
                    "active": True,
                    "code": promo["code"],
                    "percent": promo["percent"],
                    "expires_at": promo["expires_at"][:10],
                }
        elif tool_name == "suggest_upsell":
            current_titles = set(
                (t or "").lower().strip()
                for t in (tool_input.get("current_service_names") or [])
            )
            # ── 1. Персональные допуслуги из истории клиента (если есть) ──
            history_suggestions = []
            client_row = database.get_client(user_id) if user_id else None
            if client_row and client_row.get("phone"):
                past_bookings = yclients.get_client_bookings(client_row["phone"])
                past_services: dict[str, dict] = {}
                for b in past_bookings or []:
                    if not isinstance(b, dict):
                        continue
                    for s in (b.get("services") or []):
                        title = (s.get("title") or "").strip()
                        if not title:
                            continue
                        key = title.lower()
                        dt = b.get("date") or b.get("datetime") or ""
                        if key not in past_services or dt > past_services[key]["last_date"]:
                            past_services[key] = {"title": title, "last_date": dt[:10] if dt else ""}
                hist_kw = (
                    "тонирование", "моделирование", "окантовк", "камуфляж", "воск",
                    "бритье", "брить", "уход", "маск", "укладка", "spa", "спа",
                    "массаж", "патчи", "скраб", "эпиляц", "бород",
                )
                cands = []
                for key, info in past_services.items():
                    if key in current_titles:
                        continue
                    if any(k in key for k in hist_kw):
                        cands.append(info)
                cands.sort(key=lambda x: x["last_date"], reverse=True)
                history_suggestions = [
                    {"service": c["title"], "last_taken": c["last_date"] or "ранее"}
                    for c in cands[:3]
                ]
            # ── 2. Допуслуги из МЕНЮ салона (доступны ВСЕМ, не только по истории) ──
            menu_addons = []
            try:
                main_kw = ("стрижка", "фейд", "бритье головы", "детск")
                addon_kw = (
                    "бород", "тонирование", "укладка", "окантовк", "гладкое бритье",
                    "spa", "спа", "массаж", "патчи", "эпиляц", "скраб", "маск", "уход за кож",
                )
                prio_kw = ("бород", "укладка", "тонирование")  # лучше всего сочетаются со стрижкой
                hist_keys = {hs["service"].lower() for hs in history_suggestions}
                for s in (yclients.get_services() or []):
                    if not isinstance(s, dict):
                        continue
                    title = (s.get("title") or "").strip()
                    key = title.lower()
                    if not title or key in current_titles or key in hist_keys:
                        continue
                    if any(k in key for k in main_kw):
                        continue
                    if not any(k in key for k in addon_kw):
                        continue
                    try:
                        price = int(s.get("price_min") or s.get("cost") or s.get("price") or 0)
                    except Exception:
                        price = 0
                    prio = 0 if any(k in key for k in prio_kw) else 1
                    menu_addons.append({"service": title, "price": price, "_p": prio})
                menu_addons.sort(key=lambda x: (x["_p"], -x["price"]))
                menu_addons = [{"service": m["service"], "price": m["price"]} for m in menu_addons[:8]]
            except Exception as e:
                logger.warning(f"suggest_upsell menu fetch: {e}")
            # ── Результат ──
            if history_suggestions:
                result = {
                    "suggestions": history_suggestions,
                    "menu_addons": menu_addons[:6],
                    "instruction": (
                        "Сначала мягко предложи услуги из suggestions (клиент их уже брал — "
                        "одной фразой через «и», «как в прошлый раз»). Можешь добавить ОДНУ "
                        "уместную из menu_addons, если в тему. С ценой, без напора. "
                        "«Да» — добавь в заказ. «Нет» — не настаивай."
                    ),
                }
            elif menu_addons:
                result = {
                    "menu_addons": menu_addons,
                    "instruction": (
                        "Персональной истории по допуслугам нет. Предложи мягко ОДНУ-ДВЕ "
                        "уместные допуслуги из menu_addons, которые дополняют выбранную услугу "
                        "(к стрижке обычно подходят оформление бороды, укладка или тонирование). "
                        "Короткой дружелюбной фразой С ЦЕНОЙ, например: «хотите ещё освежить "
                        "бороду? Моделирование — 1000 ₽». Без напора. «Да/давай» — добавь в "
                        "заказ. «Нет/не надо» — не настаивай, продолжай оформление."
                    ),
                }
            else:
                result = {"history": "empty_for_upsell", "reason": "Нет подходящих допуслуг"}
        elif tool_name == "reschedule_booking":
            # сопоставляем (часто искажённый моделью) record_id с реальными записями клиента
            rid, _up, rerr = _resolve_user_record_id(user_id, tool_input.get("record_id"))
            if rerr:
                return json.dumps(rerr, ensure_ascii=False)
            # Новый мастер (если указан) — переносим к нему, цена пересчитается по
            # его рангу. service_ids резолвим под нового мастера.
            new_staff_id = _resolve_staff_id(tool_input["staff_name"]) if tool_input.get("staff_name") else None
            service_ids = None
            if tool_input.get("service_names"):
                service_ids = _resolve_service_ids(tool_input["service_names"], new_staff_id)
            result = yclients.reschedule_booking(
                record_id=rid,
                new_datetime_str=tool_input["new_datetime_str"],
                service_ids=service_ids,
                staff_id=new_staff_id,
            )
            # Помечаем, КТО перенёс: владелец/админ в своём чате с MAYA → 'staff',
            # обычный клиент → 'client'. Webhook record.update прочитает метку и
            # напишет мастеру «Клиент перенёс сам» vs «перенесено администратором».
            try:
                if isinstance(result, dict) and result.get("success"):
                    _actor = "staff" if database.is_admin(user_id) else "client"
                    database.mark_reschedule_actor(result.get("record_id") or rid, _actor)
            except Exception:
                pass
        elif tool_name == "update_booking":
            rid, _up, rerr = _resolve_user_record_id(user_id, tool_input.get("record_id"))
            if rerr:
                return json.dumps(rerr, ensure_ascii=False)
            staff_id = _resolve_staff_id(tool_input["staff_name"])
            service_ids = _resolve_service_ids(tool_input.get("service_names", []), staff_id)
            if not service_ids:
                return json.dumps({"error": "Услуги не найдены"})
            result = yclients.update_booking(
                record_id=rid,
                service_ids=service_ids,
            )
        elif tool_name == "cancel_booking":
            rid, _up, rerr = _resolve_user_record_id(user_id, tool_input.get("record_id"))
            if rerr:
                return json.dumps(rerr, ensure_ascii=False)
            result = yclients.cancel_booking(rid)
            # Если отменил САМ клиент (не владелец в своём чате) — помечаем, чтобы
            # webhook написал мастеру «Запись отменена клиентом».
            try:
                if isinstance(result, dict) and result.get("success") and not database.is_admin(user_id):
                    database.mark_cancel_actor(rid, "client")
            except Exception:
                pass
        elif tool_name == "get_business_report":
            # Read-only аналитика для владельца. Ворота: только админ/владелец.
            if not user_id or not database.is_admin(int(user_id)):
                result = {"error": "Эта аналитика доступна только владельцу."}
            else:
                import analytics  # ленивый импорт: отсутствие файла не валит весь мозг
                f_iso, t_iso, label = analytics.resolve_period(
                    tool_input.get("period"),
                    tool_input.get("date_from"),
                    tool_input.get("date_to"),
                )
                want_top = bool(tool_input.get("top_services"))
                if tool_input.get("compare"):
                    result = analytics.business_pulse(
                        f_iso, t_iso, tool_input.get("period"), label, include_top=want_top
                    )
                else:
                    result = analytics.business_summary(f_iso, t_iso, include_top=want_top)
                    result["period_label"] = label
        elif tool_name == "barber_knowledge":
            # База знаний по технике — только сотрудникам (мастер/владелец).
            is_staff = bool(user_id and (database.get_master_by_chat_id(int(user_id))
                                         or database.is_admin(int(user_id))))
            if not is_staff:
                result = {"error": "База знаний по технике доступна только сотрудникам."}
            else:
                import barber_knowledge
                result = barber_knowledge.answer(tool_input.get("query") or "")
        elif tool_name == "remember_client_preference":
            # Клиент сам сообщил привычку — сохраняем обезличенно (ключ — его client_id).
            pref = (tool_input.get("preference") or "").strip()
            if not user_id or not pref:
                result = {"error": "Нет данных для сохранения."}
            else:
                import anonymizer
                # Вычищаем случайные ПД + ограничиваем длину: эта строка позже
                # подмешивается обратно в промпт, поэтому лимит сужает окно для
                # инъекции второго порядка (хранимый текст как «инструкция»).
                safe = anonymizer.redact_pii(pref)[:500]
                ok = database.add_client_preference(int(user_id), safe)
                result = {"saved": bool(ok), "preference": safe,
                          "note": "Не озвучивай клиенту, что «сохранил в базу» — просто учти в дальнейшем разговоре."}
        elif tool_name == "remember_business_rule":
            # Procedural-память: владелец задаёт правило словами (доступ уже отрезан гейтом).
            import anonymizer
            # Вычистить ПД + ограничить длину (правило тоже подмешивается обратно
            # в промпт → лимит сужает окно для инъекции второго порядка).
            rule = anonymizer.redact_pii((tool_input.get("rule") or "").strip())[:500]
            if not rule:
                result = {"error": "Пустое правило — нечего сохранять."}
            else:
                rid = database.add_salon_rule(rule, created_by=user_id)
                result = {"success": True, "rule_id": rid, "saved": rule,
                          "note": "Подтверди владельцу, что правило принято и ты будешь его соблюдать."}
        elif tool_name == "forget_business_rule":
            try:
                rid = int(tool_input.get("rule_id"))
            except (TypeError, ValueError):
                rid = 0
            if not rid:
                result = {"error": "Нужен номер правила (rule_id)."}
            else:
                ok = database.deactivate_salon_rule(rid)
                result = {"success": bool(ok), "rule_id": rid,
                          "note": ("Правило отменено." if ok else "Такого действующего правила нет.")}
        elif tool_name == "get_client_dossier":
            # Досье клиенту мастеру/владельцу. ТОЛЬКО чтение, телефон не отдаём.
            is_staff = bool(user_id and (database.get_master_by_chat_id(int(user_id))
                                         or database.is_admin(int(user_id))))
            if not is_staff:
                result = {"error": "Досье клиента доступно только сотрудникам."}
            else:
                q = (tool_input.get("query") or "").strip()
                matches = yclients.search_clients(q, 5) if q else []
                if not matches:
                    result = {"error": "Клиент не найден. Уточни имя (≥3 букв) или телефон (≥4 цифр)."}
                else:
                    from collections import Counter
                    from datetime import date as _date
                    c = matches[0]
                    hist = yclients.get_client_history(c.get("id"), count=30) or []
                    svc_counter = Counter()
                    total_spent = 0
                    dates = []
                    for v in hist:
                        for s in (v.get("services") or []):
                            if isinstance(s, dict) and s.get("title"):
                                svc_counter[s["title"]] += 1
                                try:
                                    total_spent += int(s.get("cost") or 0)
                                except (TypeError, ValueError):
                                    pass
                        d = v.get("date") or v.get("datetime")
                        if isinstance(d, str) and len(d) >= 10:
                            dates.append(d[:10])
                    dates.sort()
                    cycle = None
                    if len(dates) >= 2:
                        try:
                            ds = [_date.fromisoformat(x) for x in dates]
                            gaps = [(ds[i] - ds[i - 1]).days for i in range(1, len(ds))
                                    if (ds[i] - ds[i - 1]).days > 0]
                            if gaps:
                                cycle = round(sum(gaps) / len(gaps))
                        except Exception:
                            cycle = None
                    prefs = database.get_client_preferences_by_phone(c.get("phone") or "")
                    result = {
                        "name": "клиент",  # 152-ФЗ: имя не уходит в LLM (Claude/США); мастер ищет и видит имя в журнале (YClients, РФ)
                        "visits": len(hist),
                        "last_visit": dates[-1] if dates else None,
                        "favorite_services": [t for t, _ in svc_counter.most_common(4)],
                        "avg_cycle_days": cycle,
                        "total_spent": total_spent,
                        "preferences": prefs or "(пока ничего не запомнено)",
                        "note": "Телефон не показывай. Это история и привычки клиента — для тёплого приёма и совета.",
                    }
        else:
            result = {"error": f"Неизвестный инструмент: {tool_name}"}
    except Exception as e:
        result = {"error": str(e)}

    logger.info(f"📦 Результат {tool_name}: {str(result)[:200]}")
    return json.dumps(result, ensure_ascii=False)


def _build_system_prompt(user_id: int = None, role: str = None) -> list:
    """
    Возвращает system как список блоков с кешированием статичной части
    (системный промпт + дата + список услуг). Anthropic кеширует помеченное
    блоком cache_control — повторные вызовы платят 10% от обычной цены input.
    Персональный контекст клиента вынесен в отдельный блок без кеша.
    role — серверная роль (client/master/owner/founder); решает topic-scope.
    """
    if role is None:
        role = _resolve_role(user_id)
    from datetime import datetime, timedelta
    _days_ru = ["понедельник", "вторник", "среда", "четверг", "пятница",
                "суббота", "воскресенье"]
    _now = datetime.now()
    today = _now.strftime("%Y-%m-%d")
    weekday = _days_ru[_now.weekday()]
    # Явная таблица дат → день недели на 2 недели вперёд. Claude плохо считает
    # дни недели сам (путал, что 05.06 — пятница, а не четверг) → даём готовое.
    _cal_lines = []
    for _i in range(15):
        _d = _now + timedelta(days=_i)
        _tag = " — СЕГОДНЯ" if _i == 0 else (" — завтра" if _i == 1 else "")
        _cal_lines.append(f"{_d.strftime('%Y-%m-%d')} ({_d.strftime('%d.%m')}) — {_days_ru[_d.weekday()]}{_tag}")
    static_text = SYSTEM_PROMPT + (
        f"\n\n## Текущая дата\nСегодня {today} ({weekday}). Используй этот год при создании записей."
        f"\n\n## Календарь (день недели для любой даты бери ТОЛЬКО из этой таблицы, "
        f"НЕ вычисляй сам):\n" + "\n".join(_cal_lines)
    )

    services = yclients.get_services()
    titles = [s["title"] for s in services if isinstance(s, dict) and s.get("title")]
    if titles:
        static_text += (
            "\n\n## Услуги барбершопа — точные названия\n"
            "Когда клиент называет услугу своими словами или неточно — подбери "
            "ТОЧНОЕ название из этого списка и в инструменты передавай именно его:\n"
            + "\n".join(f"• {t}" for t in titles)
        )

    static_text += (
        "\n\n## Память о привычках клиента\n"
        "Если клиент в разговоре сам сообщает о своей привычке или предпочтении "
        "(«люблю фейд», «не люблю болтать в кресле», «кофе без сахара», «стригусь "
        "раз в 3 недели», «чувствительная кожа») — тихо вызови инструмент "
        "remember_client_preference с короткой формулировкой (без имени/телефона). "
        "Не объявляй «я записал в базу» — просто учитывай это дальше. Так мастер "
        "получит готовое досье, а клиент почувствует, что его помнят."
    )

    blocks = [{"type": "text", "text": static_text, "cache_control": {"type": "ephemeral"}}]

    # Procedural-память: действующие правила салона (заданы владельцем словами).
    # Отдельный блок БЕЗ кеша — новое правило применяется сразу, со следующего хода.
    # Грузим для ВСЕХ ролей: правила должны соблюдаться и в работе с клиентами.
    try:
        _rules = database.list_salon_rules(active_only=True, limit=40)
    except Exception:
        _rules = []
    if _rules:
        _rules_txt = "\n".join(f"• [{r['id']}] {r['rule_text']}" for r in _rules)
        blocks.append({"type": "text", "text": (
            "## Правила салона (заданы владельцем — соблюдай их в работе)\n"
            + _rules_txt +
            "\n(Номер в скобках — id правила; владелец может отменить его через forget_business_rule.)"
        )})

    # Персональный контекст клиента — отдельный блок без кеша (у каждого свой)
    if user_id:
        context = build_context(user_id)
        if context:
            blocks.append({"type": "text", "text": context})
        try:
            master = database.get_master_by_chat_id(int(user_id))
            is_admin = database.is_admin(int(user_id))
            if master or is_admin:
                master_name = (master or {}).get("full_name") or "сотрудник"
                staff_id = (master or {}).get("yclients_staff_id")
                blocks.append({
                    "type": "text",
                    "text": (
                        "## Внутренний режим сотрудника\n"
                        f"Сейчас пишет сотрудник/мастер: {master_name}"
                        + (f" (staff_id {staff_id})." if staff_id else ".") +
                        "\nНе воспринимай его автоматически как клиента на запись. "
                        "Он может спрашивать про СВОИ записи/клиентов/услуги на любой день "
                        "('сколько у меня записей на пятницу', 'во сколько какая запись', "
                        "'какие услуги в пятницу', 'кто ко мне сегодня придёт') — вызови "
                        "инструмент get_my_work_records с нужной датой и ответь ПОДРОБНО: "
                        "перечисли каждую запись (время, имя клиента, услуги, статус), "
                        "посчитай итог по числу записей и сумме. Если записей нет — так и скажи. "
                        f"Про график работы (рабочие дни) — get_master_schedule с именем '{master_name}'. "
                        "Телефоны клиентов мастеру не показывай (защита базы) — только имя. "
                        "Если он спрашивает СКОЛЬКО у него чаевых / на какую сумму "
                        "('сколько у меня чаевых', 'сколько мне начаевили', 'мои чаевые') — "
                        "вызови get_my_tips и назови количество переводов и сумму (точные данные YClients). "
                        "Если спрашивает КАК работают чаевые (механика) — кратко: клиент открывает "
                        "экран чаевых в приложении/по QR, выбирает мастера и платит, "
                        "мастеру приходит push «Вам оставили чай». "
                        "Если спрашивает про push: скажи открыть приложение как мастер и нажать "
                        "«Включить уведомления».\n"
                        "ДОСЬЕ КЛИЕНТА: если мастер спрашивает про конкретного клиента "
                        "('что за клиент придёт в 15', 'расскажи про Андрея', 'что обычно "
                        "берёт', 'что ему предложить') — вызови get_client_dossier с именем "
                        "или телефоном и расскажи: сколько визитов, любимые услуги, как часто "
                        "ходит, что запомнили о привычках. Телефон не называй. "
                        "НАСТАВНИК ПО ТЕХНИКЕ: если мастер спрашивает КАК стричь/делать "
                        "('как сделать фейд', 'какая насадка', 'что идёт круглому лицу', "
                        "'как смоделировать бороду', 'частые ошибки') — вызови barber_knowledge "
                        "и отвечай ТОЛЬКО по тому, что вернёт база салона. Если в базе нет — "
                        "честно скажи и предложи уточнить у Стаса, НЕ выдумывай технику."
                    ),
                })
            if is_admin:
                blocks.append({
                    "type": "text",
                    "text": (
                        "## Режим владельца — аналитика бизнеса\n"
                        "Это владелец/админ. На вопросы о состоянии бизнеса — «как дела / "
                        "как прошла неделя / сколько заработали / какая касса / сколько "
                        "выплатить мастерам / кто сколько сделал / средний чек / выручка за "
                        "месяц» — вызывай инструмент get_business_report с нужным period "
                        "(today/yesterday/week/last_week/month/last_30) либо date_from/date_to. "
                        "Ответ давай кратко и по-деловому: итоговая выручка, разбивка наличные/"
                        "карта, число визитов, средний чек, и по мастерам — валовая и зарплата. "
                        "🔴 «Валовая / выручка за период» = поле total_gross из ответа инструмента "
                        "(это выручка ВСЕГО салона за услуги, ВКЛЮЧАЯ работу владельца). Называй "
                        "ИМЕННО total_gross дословно; НЕ складывай валовые по мастерам сам и НЕ "
                        "исключай владельца — иначе занизишь ровно на сумму его собственных услуг. "
                        "Если вопрос про ДИНАМИКУ или самочувствие бизнеса («как чувствует себя "
                        "бизнес / растём или падаем / лучше или хуже / в плюсе ли») — добавляй "
                        "compare=true и опиши тренд: выросла/просела выручка и визиты, на сколько "
                        "процентов против прошлого периода, что это значит. При anomaly=true — "
                        "прямо отметь резкое отклонение. Для «что лучше продаётся / топ услуг» — "
                        "top_services=true. Все суммы в рублях. Это ТОЛЬКО аналитика (чтение): "
                        "записи, перенос и кассу этим инструментом не трогаешь. Если данных за "
                        "период нет — скажи прямо."
                    ),
                })
        except Exception:
            pass

        # Topic-scope ≠ data-scope: основателю снимаем тематический ограничитель.
        # Доступ к данным/деньгам всё равно режется инструментами и _authorize().
        if role == "founder":
            blocks.append({
                "type": "text",
                "text": (
                    "## Кто перед тобой: основатель Стас — общайся как с ним лично\n"
                    "С тобой говорит Стас — основатель и владелец «Мужской Эстетики», "
                    "твой руководитель. Ты его хорошо знаешь и держишься тепло, живо и "
                    "по-человечески — как умная правая рука и собеседник, а НЕ как "
                    "администратор на ресепшене.\n"
                    "Для Стаса НЕ действуют ограничения из инструкций выше:\n"
                    "• Правило «коротко, 1-2 предложения» — НЕ применяй. Говори "
                    "естественно и настолько развёрнуто, насколько требует вопрос: "
                    "рассуждай, объясняй, делись мнением, идеями, эмоцией. (В голосовом "
                    "режиме — живо и по делу, но без сухости и без зубрёжки.)\n"
                    "• Правило «только про барбершоп» — НЕ применяй. Обсуждай ЛЮБЫЕ "
                    "темы: стратегию и развитие салона, найм, маркетинг, деньги, "
                    "технологии, личные и общие вопросы, просто разговор — ты "
                    "разносторонний ассистент-директор, а не бот для записи.\n"
                    "• НЕ своди разговор к «записать вас на стрижку» и НЕ предлагай "
                    "услуги/абонементы/рефералку без его прямой просьбы — он владелец, "
                    "а не клиент на запись.\n"
                    "Команду и салон ты знаешь; конкретные факты (мастера, записи, "
                    "выручка, расписание) бери ИНСТРУМЕНТАМИ (get_masters, "
                    "get_business_report и т.д.), а не выдумывай. Доступ к данным и "
                    "деньгам — строго по инструментам."
                ),
            })

    return blocks


def _msgs_with_cache(messages: list) -> list:
    """
    Возвращает messages с cache_control на последнем блоке последнего сообщения.
    Это кеш-точка для истории переписки — Anthropic запоминает префикс до этой
    точки. Внутри цикла tool-use и между запросами кеш переиспользуется и input
    до точки считается как 10% от обычной цены. Оригинальный список не меняется.
    Все строковые content оборачиваются в text-блоки ради единого формата —
    иначе кеш-ключ между вызовами не совпадает.
    """
    if not messages:
        return messages
    result = []
    last_idx = len(messages) - 1
    for i, msg in enumerate(messages):
        is_last = i == last_idx
        content = msg.get("content")
        if isinstance(content, str):
            block = {"type": "text", "text": content}
            if is_last:
                block["cache_control"] = {"type": "ephemeral"}
            result.append({**msg, "content": [block]})
        elif is_last and isinstance(content, list) and content:
            *head, last_block = content
            if isinstance(last_block, dict):
                last_block = {**last_block, "cache_control": {"type": "ephemeral"}}
            result.append({**msg, "content": [*head, last_block]})
        else:
            result.append(msg)
    return result


def _run_tool_uses(tool_uses: list, messages: list, user_id: int = None) -> tuple[list, dict | None, dict | None]:
    """Выполняет tool_use-блоки одного хода модели — ЕДИНЫЙ источник правды
    для обычного и стримингового путей (правило suggest_upsell→request_booking,
    сигналы contact_request / gift_cert / subscription).

    messages[-1] — это ответ ассистента с ЭТИМИ tool_uses; имена ранее вызванных
    инструментов считаем по messages[:-1].
    Возвращает (tool_results, contact_request, gift_cert_action).
    """
    contact_request = None
    gift_cert_action = None

    # Собираем имена инструментов, вызванных РАНЬШЕ в этой беседе.
    # Нужно для жёсткого правила: request_booking блокируется, если
    # перед ним не было suggest_upsell.
    past_tool_names: set[str] = set()
    for msg in messages[:-1]:  # исключая текущий ответ ассистента
        content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                name = None
                if hasattr(block, "type") and getattr(block, "type", None) == "tool_use":
                    name = getattr(block, "name", None)
                elif isinstance(block, dict) and block.get("type") == "tool_use":
                    name = block.get("name")
                if name:
                    past_tool_names.add(name)

    tool_results = []
    for tool_use in tool_uses:
        # ЖЁСТКОЕ ПРАВИЛО: перед request_booking должен быть вызван
        # suggest_upsell в этой беседе. Если AI пропустил — отклоняем
        # с понятной ошибкой и заставляем переходить.
        if (
            tool_use.name == "request_booking"
            and "suggest_upsell" not in past_tool_names
        ):
            logger.info(
                f"⛔ request_booking заблокирован: AI забыл вызвать "
                f"suggest_upsell. Заставляю переходить."
            )
            tool_result_str = json.dumps({
                "status": "error",
                "error": "skip_upsell",
                "message": (
                    "Ты пропустил обязательный шаг. Сначала вызови "
                    "`suggest_upsell` с теми же service_names — это "
                    "обязательно. Обработай ответ (если есть suggestions "
                    "— мягко предложи одну услугу; если history: empty — "
                    "просто продолжай). Потом снова вызови request_booking."
                ),
            }, ensure_ascii=False)
        else:
            tool_result_str = _execute_tool(tool_use.name, tool_use.input, user_id)

        # request_booking готов — передаём backend'у сигнал собрать контакты
        if tool_use.name == "request_booking":
            data = json.loads(tool_result_str)
            if data.get("status") == "ready":
                contact_request = {
                    "staff_id": data["staff_id"],
                    "staff_name": data["staff_name"],
                    "service_ids": data["service_ids"],
                    "service_names": data["service_names"],
                    "datetime_str": data["datetime_str"],
                    "pay_with_points": data.get("pay_with_points") or [],
                }
        # start_gift_cert_purchase — backend покажет кнопки выбора способа покупки
        if tool_use.name == "start_gift_cert_purchase":
            data = json.loads(tool_result_str)
            if data.get("status") == "ready":
                gift_cert_action = {"amount": data["amount"]}
        # show_subscription_plans — backend покажет каталог/кнопку абонементов.
        # Едем по тому же слоту gift_cert_action с дискриминатором kind.
        if tool_use.name == "show_subscription_plans":
            data = json.loads(tool_result_str)
            if data.get("status") == "ready":
                gift_cert_action = {"kind": "subscription"}
        # request_client_contact — backend покажет защищённую кнопку «Поделиться
        # контактом». Тот же слот gift_cert_action, дискриминатор kind=contact.
        if tool_use.name == "request_client_contact":
            data = json.loads(tool_result_str)
            if data.get("status") == "ready":
                gift_cert_action = {"kind": "contact"}

        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_use.id,
            "content": tool_result_str,
        })

    return tool_results, contact_request, gift_cert_action


def get_ai_response(conversation_history: list[dict], user_id: int = None, model: str = None) -> tuple[str, dict | None, dict | None]:
    """
    Отправляет историю переписки в модель и возвращает
    (текст_ответа, contact_request, gift_cert_action).

    contact_request — сигнал начать сбор контактов для записи.
    gift_cert_action — сигнал запустить флоу покупки сертификата (показать кнопки).
    Оба заполняются, если AI вызвал соответствующий инструмент.
    model — переопределение модели (голос → Haiku для скорости); по умолчанию Sonnet.
    """
    messages = conversation_history.copy()
    contact_request = None
    gift_cert_action = None
    mdl = model or CLAUDE_MODEL
    role = _resolve_role(user_id)

    while True:
        response = client.messages.create(
            model=mdl,
            max_tokens=1024,
            system=_build_system_prompt(user_id, role),
            tools=_tools_for_role(role),
            messages=_msgs_with_cache(messages),
        )

        # Лог кеша — видно в journalctl, что экономия работает
        u = response.usage
        cw = getattr(u, "cache_creation_input_tokens", 0) or 0
        cr = getattr(u, "cache_read_input_tokens", 0) or 0
        if cw or cr:
            logger.info(f"💾 кеш Claude: чтение {cr}, запись {cw}, обычный input {u.input_tokens}")

        # Учёт расхода: каждый вызов Антона идёт в журнал — для /ai_cost
        ai_billing.log_anthropic_usage("anton_chat", CLAUDE_MODEL, response, user_id=user_id)

        # Собираем текст и tool_use блоки из ответа
        text_parts = []
        tool_uses = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(block)

        # Если модель закончила — возвращаем ответ
        if response.stop_reason == "end_turn" or not tool_uses:
            return "\n".join(text_parts).strip(), contact_request, gift_cert_action

        # Модель хочет вызвать инструменты — выполняем их (общий хелпер)
        messages.append({"role": "assistant", "content": response.content})
        tool_results, cr2, gc2 = _run_tool_uses(tool_uses, messages, user_id)
        contact_request = cr2 or contact_request
        gift_cert_action = gc2 or gift_cert_action
        messages.append({"role": "user", "content": tool_results})


def get_ai_response_stream(conversation_history: list[dict], user_id: int = None, model: str = None):
    """
    Стриминговый вариант get_ai_response — ГЕНЕРАТОР событий-словарей.
    Тот же «мозг» и те же инструменты, но текст ответа отдаётся по мере генерации.
    model — переопределение модели (голос → Haiku для скорости); по умолчанию Sonnet.

    yield-ит:
      {"type": "delta", "text": "..."}   — кусок текста ответа (по мере генерации)
      {"type": "reset"}                  — промежуточный ход закончился вызовом
                                            инструмента; то, что успело настримиться
                                            до вызова, надо стереть (это была присказка
                                            вроде «секунду, проверю…», а не сам ответ)
      {"type": "meta", "contact_request": ..., "gift_cert_action": ..., "text": "..."}
                                          — ВСЕГДА последний; финальные сигналы +
                                            полный текст финального хода (на случай
                                            фолбэка, если дельты не дошли)

    Никакой записи в историю и никакой booking/cert-постобработки здесь нет —
    это делает вызывающий хендлер, как и в не-стрим версии.
    """
    messages = conversation_history.copy()
    contact_request = None
    gift_cert_action = None
    role = _resolve_role(user_id)
    mdl = model or CLAUDE_MODEL

    while True:
        with client.messages.stream(
            model=mdl,
            max_tokens=1024,
            system=_build_system_prompt(user_id, role),
            tools=_tools_for_role(role),
            messages=_msgs_with_cache(messages),
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield {"type": "delta", "text": text}
            final = stream.get_final_message()

        # Лог кеша + учёт расхода (как в не-стрим версии)
        u = final.usage
        cw = getattr(u, "cache_creation_input_tokens", 0) or 0
        cr = getattr(u, "cache_read_input_tokens", 0) or 0
        if cw or cr:
            logger.info(f"💾 кеш Claude(stream): чтение {cr}, запись {cw}, обычный input {u.input_tokens}")
        ai_billing.log_anthropic_usage("anton_chat", CLAUDE_MODEL, final, user_id=user_id)

        text_parts = []
        tool_uses = []
        for block in final.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(block)

        # Финальный ход — отдаём сигналы и выходим
        if final.stop_reason == "end_turn" or not tool_uses:
            yield {
                "type": "meta",
                "contact_request": contact_request,
                "gift_cert_action": gift_cert_action,
                "text": "\n".join(text_parts).strip(),
            }
            return

        # Промежуточный ход закончился инструментами: настримленная присказка —
        # не ответ, просим клиента стереть её перед следующим ходом.
        yield {"type": "reset"}

        messages.append({"role": "assistant", "content": final.content})
        tool_results, cr2, gc2 = _run_tool_uses(tool_uses, messages, user_id)
        contact_request = cr2 or contact_request
        gift_cert_action = gc2 or gift_cert_action
        messages.append({"role": "user", "content": tool_results})
