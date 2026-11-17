"""aesthetics.py: Meta's Audiobox Aesthetics scores (production quality PQ, production complexity PC, content
enjoyment CE, content usefulness CU; 1-10) for rendered tracks. A learned scorer: use it to rank takes, not as a gate.

usage: python3 tools/aesthetics.py [--seconds N] [--json OUT.json] a.wav [b.wav ...]
  --seconds N   score only the first N seconds of each file (the repository's numbers score the first minute: 60)
  --json OUT    where to write the scores (default out/aesthetics.json; a last argument ending in .json works too)

Needs torch, scipy and audiobox_aesthetics. The model's checkpoint comes from Hugging Face on first use; where that is
not reachable, download https://dl.fbaipublicfiles.com/audiobox-aesthetics/checkpoint.pt and point MGA_AUDIOBOX_CKPT
at it. tools/takes.mjs runs this script with the Python named by MGA_AUDIOBOX_PYTHON (default python3)."""
import json
import os
import sys

import numpy as np
import torch
from scipy.io import wavfile

import audiobox_aesthetics.infer as infer

args = sys.argv[1:]
seconds = None
out_path = "out/aesthetics.json"
files = []
i = 0
while i < len(args):
    a = args[i]
    if a == "--seconds":
        seconds = float(args[i + 1])
        i += 2
    elif a == "--json":
        out_path = args[i + 1]
        i += 2
    elif a.endswith(".json"):
        out_path = a
        i += 1
    else:
        files.append(a)
        i += 1
if not files:
    sys.exit(__doc__)


def read_wav(meta):  # scipy instead of torchaudio.load (which now needs torchcodec)
    sr, x = wavfile.read(meta["path"])
    x = x.astype(np.float32) / (32768.0 if x.dtype == np.int16 else 1.0)
    if x.ndim == 2:
        x = x.mean(axis=1)
    if seconds is not None:
        x = x[: int(seconds * sr)]
    return torch.from_numpy(x)[None, :], sr


infer.read_wav = read_wav
pred = infer.initialize_predictor(os.environ.get("MGA_AUDIOBOX_CKPT") or None)
res = pred.forward([{"path": f} for f in files])
out = {f: {k: round(float(v), 2) for k, v in r.items()} for f, r in zip(files, res)}
for f, r in out.items():
    print(f"{f:28} {r}")
os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
with open(out_path, "w") as fh:
    json.dump(out, fh, indent=1)
