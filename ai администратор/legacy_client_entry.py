"""R01 native Client entry retirement. No identity lookup or business effect.

Telegram Update/contact/callback data is not one of the approved current
channel credentials. The existing authenticated PWA and its canonical Client
link/confirmation flows remain the entry point, including Clients without User.
"""


def client_handoff_message(app_url: str) -> str:
    return (
        "Запись, свои визиты и данные клиента доступны в приложении после "
        "подтверждения привязки. Откройте MAYA и войдите: " + app_url
    )


def is_retired_client_callback(value) -> bool:
    if not isinstance(value, str):
        return False
    return value in {
        "booking_confirm", "booking_cancel", "contact_self", "contact_other",
        "cancel_confirm_yes", "cancel_confirm_no", "freed_decline",
        "whatsnew_dismiss",
    } or value.startswith(("cancel_rec_", "freed_book_", "loy_redeem_", "dossier_", "dossierc_"))
