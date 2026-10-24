"""
Writes android/app/src/test/resources/whisper_mel_fixture.bin for WhisperEngineTest:
a deterministic 2.5 s test signal and its reference log-mel from the NumPy
implementation in verify_whisper_onnx.py (which matches WhisperFeatureExtractor).

Layout (little endian): int32 n_audio, float32[n_audio] audio, int32 n_mel, float32[n_mel] mel.

Usage: python tools/models/make_whisper_test_fixture.py
"""

import json
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from verify_whisper_onnx import load_mel_filters, log_mel  # noqa: E402

ASSETS = os.path.join("android", "app", "src", "main", "assets", "whisper")
OUT = os.path.join("android", "app", "src", "test", "resources", "whisper_mel_fixture.bin")


def main():
    cfg = json.load(open(os.path.join(ASSETS, "whisper_config.json"), encoding="utf-8"))
    filters = load_mel_filters(os.path.join(ASSETS, "mel_filters.bin"))
    sr = cfg["sample_rate"]
    t = np.arange(int(2.5 * sr)) / sr
    rng = np.random.default_rng(1234)
    audio = (0.4 * np.sin(2 * np.pi * (200 + 900 * t) * t) + 0.05 * rng.standard_normal(t.size)).astype(np.float32)
    mel = log_mel(audio, filters, cfg).reshape(-1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as fh:
        fh.write(struct.pack("<i", audio.size))
        fh.write(audio.astype("<f4").tobytes())
        fh.write(struct.pack("<i", mel.size))
        fh.write(mel.astype("<f4").tobytes())
    print(f"wrote {OUT}: {audio.size} samples, {mel.size} mel values")


if __name__ == "__main__":
    main()
