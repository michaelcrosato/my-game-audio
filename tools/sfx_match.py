"""sfx_match.py: does each sound effect sound like its description? A CLAP model (laion/larger_clap_general) embeds
every rendered sound and every description; each description's scores are standardized over the library's sounds
(some descriptions match everything a little), and each sound's own description is ranked among all of them. Rank 1:
the model picks this sound's description out of the whole library. A learned listener: use it to find sounds that
miss, not as a gate. Run it through tools/sfx.mjs, which renders the sounds and writes the manifest.

usage: python3 tools/sfx_match.py MANIFEST.json OUT.json
  MANIFEST: { "library": [{ name, cat, desc, wav }], "try": [{ name, desc, wav }] }. A tried sound is ranked against
  the library's descriptions, its own in place of a library sound of the same name.

Needs torch, transformers, numpy and scipy. The model (about 780 MB) comes from Hugging Face on first use, at a fixed
revision; set HF_HOME to keep it somewhere, and HF_HUB_OFFLINE=1 once it is there. Embeddings are cached next to
OUT.json, keyed by each file's bytes, so a rerun embeds only the sounds that changed."""
import hashlib
import json
import os
import sys

import numpy as np
import torch
from scipy.io import wavfile
from scipy.signal import resample_poly
from transformers import ClapModel, ClapProcessor

MODEL = "laion/larger_clap_general"
REVISION = "ada0c23a36c4e8582805bb38fec3905903f18b41"
TEMPLATE = "the sound of {}"

manifest_path, out_path = sys.argv[1], sys.argv[2]
manifest = json.load(open(manifest_path))
lib, tried = manifest["library"], manifest.get("try", [])

torch.set_num_threads(max(1, os.cpu_count() or 1))
model = ClapModel.from_pretrained(MODEL, revision=REVISION).eval()
proc = ClapProcessor.from_pretrained(MODEL, revision=REVISION)
cache_path = os.path.join(os.path.dirname(os.path.abspath(out_path)), "clap-cache.npz")
cache = dict(np.load(cache_path)) if os.path.exists(cache_path) else {}


def unit(x):
    # transformers 5 returns an output object whose pooler_output is the projected embedding
    x = x if torch.is_tensor(x) else x.pooler_output
    return (x / x.norm(dim=-1, keepdim=True)).numpy()


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float32)
    if np.abs(x).max() > 2:
        x = x / 32768.0
    if x.ndim == 2:
        x = x.mean(axis=1)
    # the model hears 48 kHz
    return resample_poly(x, 160, 147).astype(np.float32) if sr == 44100 else resample_poly(x, 48000, sr).astype(np.float32)


def audio(items):
    keys = [REVISION[:8] + hashlib.sha1(open(it["wav"], "rb").read()).hexdigest() for it in items]
    todo = [i for i, k in enumerate(keys) if k not in cache]
    with torch.no_grad():
        for b in range(0, len(todo), 8):
            idx = todo[b : b + 8]
            # a short sound is repeated to fill the model's 10 s window, as the model was trained
            f = proc.feature_extractor([load(items[i]["wav"]) for i in idx], sampling_rate=48000, return_tensors="pt", padding="repeatpad")
            for i, v in zip(idx, unit(model.get_audio_features(input_features=f["input_features"], is_longer=f.get("is_longer")))):
                cache[keys[i]] = v
    if todo:
        np.savez(cache_path, **cache)
    return np.stack([cache[k] for k in keys]) if keys else np.zeros((0, 512))


def text(descs):
    with torch.no_grad():
        return unit(model.get_text_features(**proc.tokenizer([TEMPLATE.format(d) for d in descs], return_tensors="pt", padding=True)))


T = text([it["desc"] for it in lib])
A = audio(lib)
S = A @ T.T
mu, sd = S.mean(0), S.std(0)
names = [it["name"] for it in lib]


def ranked(z, j):
    order = np.argsort(-z)
    return int(np.where(order == j)[0][0]) + 1, [[names[k], round(float(z[k]), 2)] for k in order[:3]]


out = []
for i, it in enumerate(lib):
    rank, top = ranked((S[i] - mu) / sd, i)
    out.append({"name": it["name"], "cat": it["cat"], "desc": it["desc"], "rank": rank, "own": round(float((S[i, i] - mu[i]) / sd[i]), 2), "top": top})

tries = []
if tried:
    C, Tt = audio(tried), text([it["desc"] for it in tried])
    for i, it in enumerate(tried):
        z = (C[i] @ T.T - mu) / sd
        j = names.index(it["name"]) if it["name"] in names else None
        col = A @ Tt[i]
        own = (C[i] @ Tt[i] - col.mean()) / col.std()
        if j is None:
            z = np.append(z, own)
            names.append(it["name"])
            rank, top = ranked(z, len(z) - 1)
            names.pop()
        else:
            z[j] = own
            rank, top = ranked(z, j)
        tries.append({"name": it["name"], "desc": it["desc"], "rank": rank, "own": round(float(own), 2), "top": top})

ranks = [r["rank"] for r in out]
summary = {"sounds": len(out), "top1": sum(r == 1 for r in ranks), "top5": sum(r <= 5 for r in ranks), "median": float(np.median(ranks)) if ranks else None,
           "model": MODEL, "revision": REVISION, "template": TEMPLATE}
json.dump({"summary": summary, "sounds": out, "try": tries}, open(out_path, "w"), indent=1)
