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


if __name__ == "__main__":
    unittest.main()
