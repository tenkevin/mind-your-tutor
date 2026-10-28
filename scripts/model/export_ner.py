"""Pack a BERT token-classification checkpoint into one int8 file for packages/ai (A7, D33).

    python export_ner.py <dir with pytorch_model.bin, config.json, vocab.txt> <out.bin>

Layout: b"IMNER1\0\0", u32 header length, JSON header, then the blob. The header lists each
tensor's name, shape, dtype and blob offset. 2-D weights are int8 with one float32 scale per
row (stored right after the int8 rows); 1-D tensors are float32. The vocabulary rides in the
blob as UTF-8 lines. Source model: gagan3012/bert-tiny-finetuned-ner (fine-tuned from
prajjwal1/bert-tiny, MIT, on CoNLL-2003). Needs torch and numpy; the app does not.
"""
import json, struct, sys
import numpy as np
import torch

src, out = sys.argv[1], sys.argv[2]
cfg = json.load(open(f"{src}/config.json"))
state = torch.load(f"{src}/pytorch_model.bin", map_location="cpu", weights_only=True)
blob = bytearray()
tensors = []
for name, t in state.items():
    if name.endswith("position_ids"):
        continue
    a = t.numpy().astype(np.float32)
    entry = {"name": name, "shape": list(a.shape), "offset": len(blob)}
    if a.ndim == 2:
        scale = np.abs(a).max(axis=1) / 127.0
        scale[scale == 0] = 1.0
        q = np.clip(np.round(a / scale[:, None]), -127, 127).astype(np.int8)
        entry["dtype"] = "int8"
        blob += q.tobytes()
        entry["scaleOffset"] = len(blob)
        blob += scale.astype(np.float32).tobytes()
    else:
        entry["dtype"] = "float32"
        blob += a.tobytes()
    tensors.append(entry)
vocab = open(f"{src}/vocab.txt", encoding="utf-8").read().rstrip("\n").split("\n")
vocab_bytes = "\n".join(vocab).encode("utf-8")
header = {
    "config": {k: cfg[k] for k in ("hidden_size", "num_hidden_layers", "num_attention_heads",
                                   "intermediate_size", "max_position_embeddings", "layer_norm_eps")},
    "labels": cfg.get("id2label"),
    "tensors": tensors,
    "vocab": {"offset": len(blob), "length": len(vocab_bytes), "count": len(vocab)},
}
blob += vocab_bytes
h = json.dumps(header).encode()
with open(out, "wb") as f:
    f.write(b"IMNER1\0\0" + struct.pack("<I", len(h)) + h + blob)
print(f"{len(h) + len(blob) + 12} bytes, {len(tensors)} tensors")
