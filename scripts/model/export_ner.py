"""Pack a BERT token-classification checkpoint into one int8 file for packages/ai (A7, D33).

    python export_ner.py <dir with pytorch_model.bin, config.json, vocab.txt> <out.bin>

Layout: b"IMNER1\0\0", u32 header length, JSON header, then the blob. The header lists each
tensor's name, shape, dtype and blob offset. 2-D weights are int8 with one float32 scale per
row (stored right after the int8 rows); 1-D tensors are float32. The vocabulary rides in the
blob as UTF-8 lines. Source model: gagan3012/bert-tiny-finetuned-ner (fine-tuned from
prajjwal1/bert-tiny, MIT, on CoNLL-2003). Needs numpy only; the app needs neither.
"""
import collections, json, pickle, struct, sys, zipfile
import numpy as np


class _Storage:
    pass


def _rebuild(storage, offset, size, stride, *_):
    flat = storage.data
    out = np.lib.stride_tricks.as_strided(
        flat[offset:], shape=size, strides=[s * flat.itemsize for s in stride]
    )
    return np.array(out).reshape(size)


def read_checkpoint(path):
    """Read a PyTorch zip checkpoint's tensors with numpy only (no torch needed)."""
    zf = zipfile.ZipFile(path)
    prefix = zf.namelist()[0].split("/")[0]

    class Unpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if name == "_rebuild_tensor_v2":
                return _rebuild
            if name == "OrderedDict":
                return collections.OrderedDict
            if module == "torch" and name.endswith("Storage"):
                return {"FloatStorage": np.float32, "LongStorage": np.int64}[name]
            raise pickle.UnpicklingError(f"unexpected {module}.{name}")

        def persistent_load(self, pid):
            _, dtype, key, _, _ = pid
            storage = _Storage()
            storage.data = np.frombuffer(zf.read(f"{prefix}/data/{key}"), dtype=dtype)
            return storage

    return Unpickler(zf.open(f"{prefix}/data.pkl")).load()


src, out = sys.argv[1], sys.argv[2]
cfg = json.load(open(f"{src}/config.json"))
state = read_checkpoint(f"{src}/pytorch_model.bin")
blob = bytearray()
tensors = []
for name, t in state.items():
    if name.endswith("position_ids"):
        continue
    a = np.asarray(t).astype(np.float32)
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
