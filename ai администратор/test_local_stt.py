import os
import unittest
from unittest import mock

import local_stt


class _Segment:
    def __init__(self, text):
        self.text = text


class _Model:
    def __init__(self):
        self.calls = []

    def transcribe(self, path, **kwargs):
        self.calls.append((path, kwargs))
        return iter([_Segment("  Запишите меня"), _Segment(" к Илье завтра. ")]), object()


class LocalSttTests(unittest.TestCase):
    def test_audio_suffix_detects_supported_containers(self):
        self.assertEqual(local_stt.audio_suffix(b"RIFF" + b"\0" * 8), ".wav")
        self.assertEqual(local_stt.audio_suffix(b"OggS" + b"\0" * 8), ".ogg")
        self.assertEqual(local_stt.audio_suffix(b"\0\0\0\x18ftyp" + b"\0" * 8), ".mp4")
        self.assertEqual(local_stt.audio_suffix(b"ID3" + b"\0" * 8), ".mp3")

    def test_transcribe_serializes_segments_and_removes_temp_file(self):
        model = _Model()
        seen_path = ""

        def remember_duration(path):
            nonlocal seen_path
            seen_path = path
            return 4.2

        with mock.patch.object(local_stt, "_get_model", return_value=model), mock.patch.object(
            local_stt, "_probe_duration", side_effect=remember_duration
        ):
            text = local_stt.transcribe(b"RIFF" + b"\0" * 128, initial_prompt="MAYA")

        self.assertEqual(text, "Запишите меня к Илье завтра.")
        self.assertFalse(os.path.exists(seen_path))
        self.assertEqual(model.calls[0][1]["language"], "ru")
        self.assertTrue(model.calls[0][1]["vad_filter"])
        self.assertIn("MAYA", model.calls[0][1]["hotwords"])

    def test_transcribe_rejects_audio_over_duration_limit(self):
        with mock.patch.object(local_stt, "_probe_duration", return_value=31.0), mock.patch.object(
            local_stt, "_get_model"
        ) as get_model, mock.patch.dict(os.environ, {"VOICE_STT_MAX_SECONDS": "30"}):
            text = local_stt.transcribe(b"RIFF" + b"\0" * 128)

        self.assertIsNone(text)
        get_model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
