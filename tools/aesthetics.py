"""aesthetics.py: Meta's Audiobox Aesthetics scores (production quality PQ, production complexity PC, content
enjoyment CE, content usefulness CU; 1-10) for rendered tracks. A learned scorer: use it to rank takes, not as a gate.
usage: python3 tools/aesthetics.py out/a.wav [...]"""
import json
import sys

import numpy as np
import torch
from scipy.io import wavfile

import audiobox_aesthetics.infer as infer


def read_wav(meta):  # scipy instead of torchaudio.load (which now needs torchcodec)
    sr, x = wavfile.read(meta["path"])
    x = x.astype(np.float32) / (32768.0 if x.dtype == np.int16 else 1.0)
    if x.ndim == 2:
        x = x.mean(axis=1)
    return torch.from_numpy(x)[None, :], sr


infer.read_wav = read_wav
pred = infer.initialize_predictor()
files = [f for f in sys.argv[1:] if not f.endswith(".json")]
res = pred.forward([{"path": f} for f in files])
out = {f: {k: round(float(v), 2) for k, v in r.items()} for f, r in zip(files, res)}
for f, r in out.items():
    print(f"{f:28} {r}")
json.dump(out, open(sys.argv[-1] if sys.argv[-1].endswith(".json") else "out/aesthetics.json", "w"), indent=1)
