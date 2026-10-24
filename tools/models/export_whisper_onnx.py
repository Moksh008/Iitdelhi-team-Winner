"""
Export abhishekgautamm/whisper-tiny-hinglish to ONNX for on-device inference.

The upstream checkpoint is a standard Hugging Face `WhisperForConditionalGeneration`
(safetensors, fp32, 39M params). Android cannot run it directly, so this script
exports two ONNX graphs with a layout that is simple to drive from Kotlin:

  encoder: mel [1, 80, 3000]
           -> cross_k, cross_v [L, 1, H, 1500, D]   (cross-attention K/V for every decoder layer)
  decoder: tokens [1, n], self_k, self_v [L, 1, H, T, D], cross_k, cross_v, offset []
           -> logits [1, n, vocab], new_self_k, new_self_v [L, 1, H, T+n, D]

Cross-attention K/V are computed once per audio window; the decoder keeps a
self-attention KV cache, so each generated token costs one small decoder step.

Outputs in --out (default: android/app/src/main/assets/whisper):
  encoder.onnx, decoder.onnx             fp32 compute, weights stored as fp16 (see compact_onnx)
  tokens.bin                             per token id: uint16 length + raw UTF-8 bytes
  mel_filters.bin                        uint32 n_mels, uint32 n_freq, then n_mels*n_freq float32
  whisper_config.json                    prompt ids, special-token range, shapes
  MODEL_LICENSE.txt

Usage (from the repo root):
  pip install torch transformers onnx onnxruntime soundfile
  python tools/models/export_whisper_onnx.py [--revision <commit>] [--keep-fp32]
"""

import argparse
import json
import os
import shutil
import struct
import tempfile

import torch
from torch import nn

MODEL_ID = "abhishekgautamm/whisper-tiny-hinglish"


def bytes_to_unicode():
    # Same table GPT-2 / Whisper use for byte-level BPE.
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return dict(zip(bs, [chr(c) for c in cs]))


class EncoderWithCrossKV(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.encoder = model.model.encoder
        self.layers = model.model.decoder.layers
        cfg = model.config
        self.heads = cfg.decoder_attention_heads
        self.head_dim = cfg.d_model // cfg.decoder_attention_heads

    def forward(self, mel):
        hidden = self.encoder(mel).last_hidden_state  # [1, 1500, d]
        ks, vs = [], []
        for layer in self.layers:
            attn = layer.encoder_attn
            k = attn.k_proj(hidden).view(1, -1, self.heads, self.head_dim).transpose(1, 2)
            v = attn.v_proj(hidden).view(1, -1, self.heads, self.head_dim).transpose(1, 2)
            ks.append(k)
            vs.append(v)
        return torch.stack(ks), torch.stack(vs)


class DecoderWithCache(nn.Module):
    def __init__(self, model):
        super().__init__()
        dec = model.model.decoder
        self.embed_tokens = dec.embed_tokens
        self.embed_positions = dec.embed_positions
        self.layers = dec.layers
        self.layer_norm = dec.layer_norm
        cfg = model.config
        self.heads = cfg.decoder_attention_heads
        self.head_dim = cfg.d_model // cfg.decoder_attention_heads
        self.scale = self.head_dim ** -0.5

    def _split(self, x):
        return x.view(1, -1, self.heads, self.head_dim).transpose(1, 2)

    def _merge(self, x):
        return x.transpose(1, 2).reshape(1, -1, self.heads * self.head_dim)

    def forward(self, tokens, self_k, self_v, cross_k, cross_v, offset):
        n = tokens.shape[1]
        positions = torch.arange(n, dtype=torch.int64) + offset
        hidden = self.embed_tokens(tokens) + self.embed_positions.weight[positions].unsqueeze(0)

        total = self_k.shape[3] + n
        query_pos = positions.unsqueeze(1)                       # [n, 1]
        key_pos = torch.arange(total, dtype=torch.int64).unsqueeze(0)  # [1, total]
        mask = torch.where(key_pos <= query_pos, 0.0, float("-inf")).to(hidden.dtype)

        new_k, new_v = [], []
        for i, layer in enumerate(self.layers):
            residual = hidden
            h = layer.self_attn_layer_norm(hidden)
            attn = layer.self_attn
            q = self._split(attn.q_proj(h) * self.scale)
            k = torch.cat([self_k[i], self._split(attn.k_proj(h))], dim=2)
            v = torch.cat([self_v[i], self._split(attn.v_proj(h))], dim=2)
            new_k.append(k)
            new_v.append(v)
            w = torch.softmax(q @ k.transpose(2, 3) + mask, dim=-1)
            hidden = residual + attn.out_proj(self._merge(w @ v))

            residual = hidden
            h = layer.encoder_attn_layer_norm(hidden)
            cattn = layer.encoder_attn
            q = self._split(cattn.q_proj(h) * self.scale)
            w = torch.softmax(q @ cross_k[i].transpose(2, 3), dim=-1)
            hidden = residual + cattn.out_proj(self._merge(w @ cross_v[i]))

            residual = hidden
            h = layer.final_layer_norm(hidden)
            hidden = residual + layer.fc2(layer.activation_fn(layer.fc1(h)))

        hidden = self.layer_norm(hidden)
        logits = hidden @ self.embed_tokens.weight.t()
        return logits, torch.stack(new_k), torch.stack(new_v)


def compact_onnx(src, dst, embed_rows):
    """Shrink an exported graph without changing its fp32 arithmetic.

    1. The logits MatMul uses a transposed copy of the token embedding (80 MB for
       Whisper). Replace it with Gemm(transB=1) on the original embedding so the
       table is stored once.
    2. Store large float initializers as fp16 followed by a Cast to fp32. ONNX
       Runtime constant-folds the Cast when the session is created, so inference
       still runs in fp32; only the file is halved. (Dynamic int8 quantisation
       was measured to damage this model's transcripts badly; see docs.)
    """
    import numpy as np
    import onnx
    from onnx import helper, numpy_helper

    model = onnx.load(src)
    graph = model.graph
    inits = {init.name: init for init in graph.initializer}

    embed_name = None
    for node in graph.node:
        if node.op_type == "Gather" and node.input[0] in inits:
            if inits[node.input[0]].dims[0] == embed_rows:
                embed_name = node.input[0]
    if embed_name is not None:
        for idx, node in enumerate(list(graph.node)):
            if node.op_type != "MatMul" or node.input[1] not in inits:
                continue
            weight = inits[node.input[1]]
            if list(weight.dims) != [inits[embed_name].dims[1], embed_rows]:
                continue
            hidden, out = node.input[0], node.output[0]
            d_model = int(weight.dims[0])
            shape2d = numpy_helper.from_array(np.array([-1, d_model], dtype=np.int64), "logits_shape_2d")
            graph.initializer.append(shape2d)
            new_nodes = [
                helper.make_node("Shape", [hidden], ["logits_in_shape"]),
                helper.make_node("Slice", ["logits_in_shape", "logits_s0", "logits_s2"], ["logits_lead"]),
                helper.make_node("Reshape", [hidden, "logits_shape_2d"], ["logits_in_2d"]),
                helper.make_node("Gemm", ["logits_in_2d", embed_name], ["logits_2d"], transB=1),
                helper.make_node("Concat", ["logits_lead", "logits_vocab"], ["logits_out_shape"], axis=0),
                helper.make_node("Reshape", ["logits_2d", "logits_out_shape"], [out]),
            ]
            graph.initializer.extend([
                numpy_helper.from_array(np.array([0], dtype=np.int64), "logits_s0"),
                numpy_helper.from_array(np.array([2], dtype=np.int64), "logits_s2"),
                numpy_helper.from_array(np.array([embed_rows], dtype=np.int64), "logits_vocab"),
            ])
            graph.node.remove(node)
            for offset, new_node in enumerate(new_nodes):
                graph.node.insert(idx + offset, new_node)
            graph.initializer.remove(weight)
            break

    casts = []
    for init in list(graph.initializer):
        if init.data_type != onnx.TensorProto.FLOAT or int(np.prod(init.dims)) < 1024:
            continue
        array = numpy_helper.to_array(init).astype(np.float16)
        half = numpy_helper.from_array(array, init.name + "_fp16")
        graph.initializer.remove(init)
        graph.initializer.append(half)
        casts.append(helper.make_node("Cast", [half.name], [init.name], to=onnx.TensorProto.FLOAT))
    for cast in reversed(casts):
        graph.node.insert(0, cast)

    onnx.checker.check_model(model)
    onnx.save(model, dst)


def write_tokens(tokenizer, path, first_special):
    byte_decoder = {v: k for k, v in bytes_to_unicode().items()}
    vocab_size = len(tokenizer)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<I", vocab_size))
        for token_id in range(vocab_size):
            token = tokenizer.convert_ids_to_tokens(token_id)
            if token is None or token_id >= first_special:
                raw = b""  # special tokens are never rendered
            else:
                raw = bytes(byte_decoder[ch] for ch in token if ch in byte_decoder)
            fh.write(struct.pack("<H", len(raw)))
            fh.write(raw)
    return vocab_size


def export(model, out_dir, suffix):
    cfg = model.config
    layers, heads = cfg.decoder_layers, cfg.decoder_attention_heads
    head_dim = cfg.d_model // heads
    enc_path = os.path.join(out_dir, f"encoder{suffix}.onnx")
    dec_path = os.path.join(out_dir, f"decoder{suffix}.onnx")

    mel = torch.zeros(1, cfg.num_mel_bins, 3000)
    torch.onnx.export(
        EncoderWithCrossKV(model), (mel,), enc_path,
        input_names=["mel"], output_names=["cross_k", "cross_v"],
        opset_version=17, dynamo=False,
    )

    cross = torch.zeros(layers, 1, heads, 1500, head_dim)
    empty = torch.zeros(layers, 1, heads, 0, head_dim)
    tokens = torch.tensor([[50258, 50259, 50359, 50363]], dtype=torch.int64)
    torch.onnx.export(
        DecoderWithCache(model), (tokens, empty, empty, cross, cross, torch.tensor(0, dtype=torch.int64)), dec_path,
        input_names=["tokens", "self_k", "self_v", "cross_k", "cross_v", "offset"],
        output_names=["logits", "new_self_k", "new_self_v"],
        dynamic_axes={
            "tokens": {1: "n"},
            "self_k": {3: "past"},
            "self_v": {3: "past"},
            "logits": {1: "n"},
            "new_self_k": {3: "total"},
            "new_self_v": {3: "total"},
        },
        opset_version=17, dynamo=False,
    )
    return enc_path, dec_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join("android", "app", "src", "main", "assets", "whisper"))
    parser.add_argument("--revision", default="main")
    parser.add_argument("--keep-fp32", action="store_true", help="also keep the uncompacted fp32 ONNX graphs")
    args = parser.parse_args()

    from transformers import GenerationConfig, WhisperFeatureExtractor, WhisperForConditionalGeneration, WhisperTokenizer

    os.makedirs(args.out, exist_ok=True)
    model = WhisperForConditionalGeneration.from_pretrained(MODEL_ID, revision=args.revision).eval()

    work = args.out if args.keep_fp32 else tempfile.mkdtemp(prefix="whisper_onnx_")
    with torch.no_grad():
        enc_fp32, dec_fp32 = export(model, work, "_fp32")
    vocab_rows = model.config.vocab_size
    compact_onnx(enc_fp32, os.path.join(args.out, "encoder.onnx"), vocab_rows)
    compact_onnx(dec_fp32, os.path.join(args.out, "decoder.onnx"), vocab_rows)
    if not args.keep_fp32:
        shutil.rmtree(work, ignore_errors=True)  # antivirus may briefly lock fresh files on Windows

    tokenizer = WhisperTokenizer.from_pretrained(MODEL_ID, revision=args.revision)
    gen = GenerationConfig.from_pretrained(MODEL_ID, revision=args.revision)
    first_special = tokenizer.convert_tokens_to_ids("<|endoftext|>")
    vocab_size = write_tokens(tokenizer, os.path.join(args.out, "tokens.bin"), first_special)

    extractor = WhisperFeatureExtractor.from_pretrained(MODEL_ID, revision=args.revision)
    filters = extractor.mel_filters  # (n_freq=201, n_mels=80)
    n_freq, n_mels = filters.shape
    with open(os.path.join(args.out, "mel_filters.bin"), "wb") as fh:
        fh.write(struct.pack("<II", n_mels, n_freq))
        for mel in range(n_mels):
            fh.write(struct.pack(f"<{n_freq}f", *filters[:, mel].astype("float32")))

    cfg = model.config
    config = {
        "model_id": MODEL_ID,
        "revision": args.revision,
        "sample_rate": extractor.sampling_rate,
        "n_fft": extractor.n_fft,
        "hop_length": extractor.hop_length,
        "n_samples": extractor.n_samples,
        "n_frames": extractor.nb_max_frames,
        "n_mels": n_mels,
        "vocab_size": vocab_size,
        "decoder_layers": cfg.decoder_layers,
        "decoder_heads": cfg.decoder_attention_heads,
        "head_dim": cfg.d_model // cfg.decoder_attention_heads,
        "eot": gen.eos_token_id,
        # The model card says it emits Roman Hinglish for every input; generation_config uses language "en".
        "prompt": [
            gen.decoder_start_token_id,
            gen.lang_to_id["<|en|>"],
            gen.task_to_id["transcribe"],
            gen.no_timestamps_token_id,
        ],
        "suppress_at_begin": gen.begin_suppress_tokens,
        "first_special_token": first_special,
        "max_new_tokens": 96,
    }
    with open(os.path.join(args.out, "whisper_config.json"), "w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)

    with open(os.path.join(args.out, "MODEL_LICENSE.txt"), "w", encoding="utf-8") as fh:
        fh.write(
            f"{MODEL_ID} (fine-tune of openai/whisper-tiny), revision {args.revision}\n"
            "License: MIT, as declared on the Hugging Face model card.\n"
            "openai/whisper-tiny is also released under the MIT license.\n"
            "Converted to ONNX (fp16 weight storage, fp32 compute) by tools/models/export_whisper_onnx.py.\n"
        )

    for name in sorted(os.listdir(args.out)):
        size = os.path.getsize(os.path.join(args.out, name))
        print(f"{name:28s} {size / 1e6:8.2f} MB")


if __name__ == "__main__":
    main()
