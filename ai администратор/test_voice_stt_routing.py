import base64
import os
import unittest
from unittest import mock

import webhook_server


def _audio_payload() -> str:
    return "data:audio/wav;base64," + base64.b64encode(b"RIFF" + b"\0" * 128).decode()


class VoiceSttRoutingTests(unittest.TestCase):
    def test_local_provider_never_sends_audio_to_external_stt(self):
        with mock.patch.dict(os.environ, {"VOICE_STT_PROVIDER": "local"}), mock.patch.object(
            webhook_server, "_transcribe_local", return_value="Запишите меня завтра"
        ), mock.patch.object(webhook_server, "_transcribe_openai") as openai, mock.patch.object(
            webhook_server, "_transcribe_google"
        ) as google:
            text = webhook_server._transcribe_audio_b64(_audio_payload())

        self.assertEqual(text, "Запишите меня завтра")
        openai.assert_not_called()
        google.assert_not_called()

    def test_auto_provider_does_not_use_external_fallback_without_opt_in(self):
        env = {"VOICE_STT_PROVIDER": "auto", "VOICE_STT_ALLOW_EXTERNAL_FALLBACK": "false"}
        with mock.patch.dict(os.environ, env), mock.patch.object(
            webhook_server, "_transcribe_local", return_value=None
        ), mock.patch.object(webhook_server, "_transcribe_openai") as openai, mock.patch.object(
            webhook_server, "_transcribe_google"
        ) as google:
            text = webhook_server._transcribe_audio_b64(_audio_payload())

        self.assertIsNone(text)
        openai.assert_not_called()
        google.assert_not_called()

    def test_openai_provider_uses_business_prompt_without_local_stt(self):
        raw = b"OggS" + b"\0" * 128
        env = {"VOICE_STT_PROVIDER": "openai", "VOICE_STT_ALLOW_LOCAL_FALLBACK": "true"}
        with mock.patch.dict(os.environ, env), mock.patch.object(
            webhook_server, "_voice_stt_prompt", return_value="Контекст MAYA"
        ), mock.patch.object(
            webhook_server, "_transcribe_openai", return_value="Покажи выручку"
        ) as openai, mock.patch.object(webhook_server, "_transcribe_local") as local:
            text = webhook_server._transcribe_audio_bytes(raw)

        self.assertEqual(text, "Покажи выручку")
        openai.assert_called_once_with(raw, prompt="Контекст MAYA")
        local.assert_not_called()

    def test_openai_failure_falls_back_to_local_stt(self):
        raw = b"OggS" + b"\0" * 128
        env = {"VOICE_STT_PROVIDER": "openai", "VOICE_STT_ALLOW_LOCAL_FALLBACK": "true"}
        with mock.patch.dict(os.environ, env), mock.patch.object(
            webhook_server, "_voice_stt_prompt", return_value="Контекст MAYA"
        ), mock.patch.object(
            webhook_server, "_transcribe_openai", return_value=None
        ), mock.patch.object(
            webhook_server, "_transcribe_local", return_value="Запиши меня завтра"
        ) as local:
            text = webhook_server._transcribe_audio_bytes(raw)

        self.assertEqual(text, "Запиши меня завтра")
        local.assert_called_once_with(raw)

    def test_openai_failure_can_disable_local_fallback(self):
        raw = b"OggS" + b"\0" * 128
        env = {"VOICE_STT_PROVIDER": "openai", "VOICE_STT_ALLOW_LOCAL_FALLBACK": "false"}
        with mock.patch.dict(os.environ, env), mock.patch.object(
            webhook_server, "_voice_stt_prompt", return_value="Контекст MAYA"
        ), mock.patch.object(
            webhook_server, "_transcribe_openai", return_value=None
        ), mock.patch.object(webhook_server, "_transcribe_local") as local:
            text = webhook_server._transcribe_audio_bytes(raw)

        self.assertIsNone(text)
        local.assert_not_called()

    def test_app_base64_audio_uses_shared_bytes_route(self):
        payload = _audio_payload()
        with mock.patch.object(
            webhook_server, "_transcribe_audio_bytes", return_value="Привет"
        ) as transcribe:
            text = webhook_server._transcribe_audio_b64(payload)

        self.assertEqual(text, "Привет")
        transcribe.assert_called_once_with(b"RIFF" + b"\0" * 128)

    def test_business_prompt_contains_known_names_and_services(self):
        with mock.patch.object(
            webhook_server, "_voice_known_master_names", return_value=("Илья Третьяков",)
        ), mock.patch.object(
            webhook_server, "_voice_known_service_titles", return_value=("Мужская стрижка",)
        ):
            prompt = webhook_server._voice_stt_prompt()

        self.assertIn("Илья Третьяков", prompt)
        self.assertIn("Мужская стрижка", prompt)
        self.assertIn("YClients", prompt)


if __name__ == "__main__":
    unittest.main()
