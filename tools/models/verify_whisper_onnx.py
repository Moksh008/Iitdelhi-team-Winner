"""
Verify the exported Whisper ONNX graphs against the original Transformers model.

For every <name>.wav (16 kHz mono) in --audio it prints:
  * the reference transcript from transformers `generate` (fp32 PyTorch)
  * the transcript from the exported ONNX graphs, using the same NumPy log-mel and
    greedy decoding algorithm that android/.../WhisperEngine.kt implements
  * the max abs difference between our NumPy log-mel and WhisperFeatureExtractor
  * ONNX encoder / decode timings on this PC (not a phone measurement)

Usage:
  python tools/models/verify_whisper_onnx.py --models android/app/src/main/assets/whisper --audio <dir>
"""

import argparse
import glob
import json
import os
import struct
import time

import numpy as np
import onnxruntime as ort
import soundfile as sf


def load_mel_filters(path):
    with open(path, "rb") as fh:
        n_mels, n_freq = struct.unpack("<II", fh.read(8))
        data = np.frombuffer(fh.read(), dtype="<f4")
    return data.reshape(n_mels, n_freq)


def load_tokens(path):
    tokens = []
    with open(path, "rb") as fh:
        (count,) = struct.unpack("<I", fh.read(4))
        for _ in range(count):
            (length,) = struct.unpack("<H", fh.read(2))
            tokens.append(fh.read(length))
    return tokens


def log_mel(audio, filters, cfg):
    """Mirror of WhisperEngine.logMel (Kotlin)."""
    n_fft, hop, n_samples = cfg["n_fft"], cfg["hop_length"], cfg["n_samples"]
    x = np.zeros(n_samples, dtype=np.float64)
    x[: min(len(audio), n_samples)] = audio[:n_samples]
    pad = n_fft // 2
    x = np.pad(x, (pad, pad), mode="reflect")
    window = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(n_fft) / n_fft)  # periodic Hann
    n_frames = cfg["n_frames"]
    frames = np.lib.stride_tricks.sliding_window_view(x, n_fft)[::hop][:n_frames]
    power = np.abs(np.fft.rfft(frames * window, axis=1)) ** 2  # [frames, 201]
    mel = filters.astype(np.float64) @ power.T                 # [80, frames]
    log_spec = np.log10(np.maximum(mel, 1e-10))
    log_spec = np.maximum(log_spec, log_spec.max() - 8.0)
    return ((log_spec + 4.0) / 4.0).astype(np.float32)


def is_repeating(tokens):
    """Same rule as WhisperEngine.isRepeating: a 1-3 token n-gram repeated 4 times."""
    for n in (1, 2, 3):
        if len(tokens) < n * 4:
            continue
        tail = tokens[-n:]
        if all(tokens[len(tokens) - n * (r + 1):len(tokens) - n * r] == tail for r in (1, 2, 3)):
            return True
    return False


def greedy_decode(encoder, decoder, mel, tokens_table, cfg):
    """Mirror of WhisperEngine.decode (Kotlin)."""
    t0 = time.perf_counter()
    cross_k, cross_v = encoder.run(None, {"mel": mel[None]})
    t_enc = time.perf_counter() - t0

    L, H, D = cfg["decoder_layers"], cfg["decoder_heads"], cfg["head_dim"]
    self_k = np.zeros((L, 1, H, 0, D), dtype=np.float32)
    self_v = np.zeros((L, 1, H, 0, D), dtype=np.float32)
    prompt = cfg["prompt"]
    feed = np.array([prompt], dtype=np.int64)
    offset = 0
    out = []
    first_special = cfg["first_special_token"]
    t1 = time.perf_counter()
    for step in range(cfg["max_new_tokens"]):
        logits, self_k, self_v = decoder.run(None, {
            "tokens": feed, "self_k": self_k, "self_v": self_v,
            "cross_k": cross_k, "cross_v": cross_v, "offset": np.array(offset, dtype=np.int64),
        })
        offset += feed.shape[1]
        last = logits[0, -1].copy()
        if step == 0:
            last[cfg["suppress_at_begin"]] = -np.inf
        # Only text tokens or end-of-text may be produced.
        last[first_special + 1:] = -np.inf
        token = int(np.argmax(last))
        if token == cfg["eot"]:
            break
        out.append(token)
        if is_repeating(out):
            break
        feed = np.array([[token]], dtype=np.int64)
    t_dec = time.perf_counter() - t1
    text = b"".join(tokens_table[t] for t in out).decode("utf-8", errors="replace").strip()
    return text, t_enc, t_dec, len(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", default=os.path.join("android", "app", "src", "main", "assets", "whisper"))
    parser.add_argument("--audio", required=True)
    parser.add_argument("--reference", action="store_true", help="also run the fp32 transformers model")
    parser.add_argument("--encoder", default="encoder.onnx")
    parser.add_argument("--decoder", default="decoder.onnx")
    args = parser.parse_args()

    cfg = json.load(open(os.path.join(args.models, "whisper_config.json"), encoding="utf-8"))
    filters = load_mel_filters(os.path.join(args.models, "mel_filters.bin"))
    tokens_table = load_tokens(os.path.join(args.models, "tokens.bin"))
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    encoder = ort.InferenceSession(os.path.join(args.models, args.encoder), opts, providers=["CPUExecutionProvider"])
    decoder = ort.InferenceSession(os.path.join(args.models, args.decoder), opts, providers=["CPUExecutionProvider"])

    if args.reference:
        import torch
        from transformers import WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperProcessor
        processor = WhisperProcessor.from_pretrained(cfg["model_id"])
        extractor = WhisperFeatureExtractor.from_pretrained(cfg["model_id"])
        model = WhisperForConditionalGeneration.from_pretrained(cfg["model_id"]).eval()

    for wav in sorted(glob.glob(os.path.join(args.audio, "*.wav"))):
        audio, sr = sf.read(wav, dtype="float32")
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        assert sr == cfg["sample_rate"], f"{wav}: expected {cfg['sample_rate']} Hz, got {sr}"
        mel = log_mel(audio, filters, cfg)
        text, t_enc, t_dec, n_tok = greedy_decode(encoder, decoder, mel, tokens_table, cfg)
        name = os.path.basename(wav)
        print(f"\n== {name} ({len(audio) / sr:.1f}s audio)")
        print(f"   onnx      : {text}")
        print(f"   timing    : encoder {t_enc * 1000:.0f} ms, decoder {t_dec * 1000:.0f} ms for {n_tok} tokens (this PC)")
        if args.reference:
            ref_mel = extractor(audio, sampling_rate=sr, return_tensors="np").input_features[0]
            with torch.no_grad():
                ids = model.generate(torch.from_numpy(ref_mel[None]), max_new_tokens=cfg["max_new_tokens"])
            ref = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
            print(f"   reference : {ref}")
            print(f"   mel max |diff| vs WhisperFeatureExtractor: {np.abs(ref_mel - mel).max():.2e}")
            print(f"   exact match: {ref == text}")
        txt = wav[:-4] + ".txt"
        if os.path.exists(txt):
            print(f"   spoken    : {open(txt, encoding='utf-8-sig').read().strip()[:160]}")


if __name__ == "__main__":
    main()
