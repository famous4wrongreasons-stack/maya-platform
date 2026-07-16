import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parent


class BotBrandingRegressionTests(unittest.TestCase):
    def test_legacy_anton_bot_name_absent_in_runtime_copy(self):
        forbidden = {
            "lead_alerts.py": [
                "Последний ответ Антона",
                "Антон, видимо, не закрыл его до записи.",
            ],
            "bot.py": [
                "Переписка с Антоном",
                "🤖 Антон",
                "клиент не писал Антону",
                "Бот Антон запущен",
            ],
            "ai_billing.py": [
                "🧑‍💼 Антон (чат с клиентами)",
            ],
            "reactivation.py": [
                "персональное сообщение от Антона",
            ],
        }

        for file_name, needles in forbidden.items():
            text = (ROOT / file_name).read_text(encoding="utf-8")
            for needle in needles:
                self.assertNotIn(
                    needle,
                    text,
                    f"{file_name} still contains legacy bot naming: {needle}",
                )


if __name__ == "__main__":
    unittest.main()
