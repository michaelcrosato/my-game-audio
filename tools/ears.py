"""ears.py: judge a rendered track by numbers and pictures (no listening).

usage: python3 tools/ears.py out/<song>.wav [...]
writes out/<song>.ears.json and out/<song>.png (spectrogram, loudness over time, spectral balance), prints flags.
"""
import json
import sys

import numpy as np
import pyloudnorm as pyln
from scipy.io import wavfile
from scipy.signal import resample_poly, stft, welch

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

BANDS = [("sub", 20, 60), ("bass", 60, 250), ("low-mid", 250, 500), ("mid", 500, 2000), ("high-mid", 2000, 6000), ("air", 6000, 20000)]
# Bellman-Budge key profiles (as engine/ears.mjs): all 31 tonal cues of the cue sets and lantern_road in their keys
KEY_MAJOR = np.array([16.8, 0.86, 12.95, 1.41, 13.49, 11.93, 1.25, 20.28, 1.8, 8.04, 0.62, 10.57])
KEY_MINOR = np.array([18.16, 0.69, 12.99, 13.34, 1.07, 11.15, 1.38, 21.07, 7.49, 1.53, 0.92, 10.21])
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return sr, x


def analyze(path):
    sr, x = load(path)
    L, R = x[:, 0], x[:, 1]
    mid, side = (L + R) / 2, (L - R) / 2
    meter = pyln.Meter(sr)
    integrated = meter.integrated_loudness(x)
    tp = 20 * np.log10(np.max(np.abs(resample_poly(x, 4, 1, axis=0))) + 1e-12)
    peak = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
    rms = 20 * np.log10(np.sqrt(np.mean(mid**2)) + 1e-12)
    # short-term loudness (3 s windows, 1 s hop) for a loudness range estimate
    st = []
    for s in range(0, len(x) - 3 * sr, sr):
        seg = x[s : s + 3 * sr]
        v = meter.integrated_loudness(seg) if np.any(seg) else -70
        st.append(v if np.isfinite(v) else -70)
    st = np.array(st) if st else np.array([integrated])
    valid = st[st > integrated - 20]
    lra = float(np.percentile(valid, 95) - np.percentile(valid, 10)) if len(valid) > 2 else 0.0
    # spectral balance
    f, p = welch(mid, sr, nperseg=8192)
    tot = np.sum(p[(f >= 20) & (f <= 20000)])
    balance = {name: round(float(100 * np.sum(p[(f >= lo) & (f < hi)]) / tot), 1) for name, lo, hi in BANDS}
    centroid = float(np.sum(f * p) / np.sum(p))
    # stereo
    corr = float(np.corrcoef(L, R)[0, 1]) if np.std(L) > 0 and np.std(R) > 0 else 1.0
    side_db = 10 * np.log10((np.mean(side**2) + 1e-20) / (np.mean(mid**2) + 1e-20))
    # STFT for onsets, tempo, chroma, spectrogram
    nper, hop = 2048, 512
    fr, tt, Z = stft(mid, sr, nperseg=nper, noverlap=nper - hop)
    mag = np.abs(Z)
    logm = np.log1p(100 * mag)
    flux = np.maximum(0, np.diff(logm, axis=1)).sum(axis=0)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    thr = 1.0
    peaks = [i for i in range(1, len(flux) - 1) if flux[i] > thr and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1]]
    dur = len(mid) / sr
    onset_rate = len(peaks) / dur
    # tempo: autocorrelation of the onset envelope between 60 and 200 BPM
    env = np.maximum(flux, 0)
    ac = np.correlate(env, env, mode="full")[len(env) - 1 :]
    fps = sr / hop
    lags = np.arange(len(ac))
    bpm_lags = (lags > fps * 60 / 220) & (lags < fps * 60 / 50)
    cand_bpm = 60 * fps / lags[bpm_lags]
    prior = np.exp(-0.5 * (np.log2(cand_bpm / 120.0) / 1.0) ** 2)  # log-normal prior around 120 BPM
    best = lags[bpm_lags][np.argmax(ac[bpm_lags] * prior)]
    tempo = 60 * fps / best
    # chroma -> key (Bellman-Budge profiles), from a high-resolution spectrum so low notes land in the right pitch class
    fh, _, Zh = stft(mid, sr, nperseg=16384, noverlap=16384 - 4096)
    magh = np.abs(Zh)
    chroma = np.zeros(12)
    sel = (fh > 60) & (fh < 4200)
    semis = 12 * np.log2(fh[sel] / 440.0)
    near = np.abs(semis - np.round(semis)) < 0.35
    pcs = ((np.round(semis) + 9) % 12).astype(int)
    energy = np.sqrt((magh[sel] ** 2).sum(axis=1))
    for pc, e, ok in zip(pcs, energy, near):
        if ok:
            chroma[pc] += e
    chroma = chroma / (chroma.sum() + 1e-12)
    scores = []
    for k in range(12):
        for mode, prof in (("major", KEY_MAJOR), ("minor", KEY_MINOR)):
            scores.append((float(np.corrcoef(chroma, np.roll(prof, k))[0, 1]), f"{NAMES[k]} {mode}"))
    scores.sort(reverse=True)
    # clicks: a jump that is a lone spike (nothing sounds after it) or a cliff (sound stops dead). Drum onsets, where the
    # sound carries on after the jump, are not clicks, and nor is a strike that opens an entry swelling in over the next
    # tens of ms (Aida's tutti under a triangle), so "nothing after" holds for the first 50 ms.
    d = np.abs(np.diff(mid))
    w = int(0.01 * sr)
    sq = np.concatenate([[0.0], np.cumsum(mid**2)])
    clicks = 0
    for i in np.where(d > 0.05)[0]:
        pre = np.sqrt((sq[i] - sq[max(0, i - w)]) / w)
        post = np.sqrt((sq[min(len(mid), i + 1 + w)] - sq[i + 1]) / w)
        later = np.sqrt((sq[min(len(mid), i + 1 + 5 * w)] - sq[i + 1]) / (5 * w))
        if (pre < 0.005 and post < 0.25 * d[i] and later < 0.25 * d[i]) or (post < 0.003 and pre > 0.02):
            clicks += 1
    out = {
        "file": path,
        "seconds": round(dur, 2),
        "integrated_lufs": round(float(integrated), 2),
        "true_peak_dbtp": round(float(tp), 2),
        "sample_peak_dbfs": round(float(peak), 2),
        "crest_db": round(float(peak - rms), 1),
        "loudness_range_lu": round(lra, 1),
        "balance_pct": balance,
        "centroid_hz": round(centroid),
        "stereo_corr": round(corr, 2),
        "side_vs_mid_db": round(float(side_db), 1),
        "onsets_per_s": round(onset_rate, 2),
        "tempo_bpm_est": round(float(tempo), 1),
        "key_est": scores[0][1],
        "key_conf": round(scores[0][0], 2),
        "key_runner_up": scores[1][1],
        "clicks": clicks,
    }
    flags = []
    if tp > -1.0:
        flags.append(f"true peak {tp:.1f} dBTP is above -1 dBTP")
    if balance["low-mid"] > 30:
        flags.append(f"low-mids carry {balance['low-mid']}% of the energy: may sound muddy")
    if balance["air"] < 0.5:
        flags.append(f"only {balance['air']}% energy above 6 kHz: may sound dull")
    if balance["air"] > 25:
        flags.append(f"{balance['air']}% energy above 6 kHz: may sound harsh")
    if balance["sub"] + balance["bass"] > 65:
        flags.append("bass-heavy: sub + bass above 65%")
    if corr < 0.1:
        flags.append(f"stereo correlation {corr:.2f}: phasey or too wide")
    if peak - rms < 8:
        flags.append(f"crest factor {peak - rms:.1f} dB: heavily compressed")
    if clicks > 0:
        flags.append(f"{clicks} click-like discontinuities")
    out["flags"] = flags
    # pictures: spectrogram (log frequency), short-term loudness, balance bars
    fig = plt.figure(figsize=(12, 7.2), dpi=110)
    ax = fig.add_axes([0.06, 0.40, 0.92, 0.55])
    S = 20 * np.log10(mag + 1e-9)
    S -= S.max()
    fmask = fr >= 30
    ax.pcolormesh(tt, fr[fmask], S[fmask], vmin=-90, vmax=0, cmap="magma", shading="auto")
    ax.set_yscale("log")
    ax.set_ylim(30, sr / 2)
    ax.set_ylabel("Hz")
    ax.set_title(f"{path.split('/')[-1]}: {integrated:.1f} LUFS, true peak {tp:.1f} dBTP, key ~ {scores[0][1]}, tempo ~ {tempo:.0f} BPM")
    ax2 = fig.add_axes([0.06, 0.07, 0.55, 0.25])
    ax2.plot(np.arange(len(st)) + 1.5, st, color="#3b6")
    ax2.set_xlim(0, dur)
    ax2.set_ylim(min(-40, st.min() - 2), max(-5, st.max() + 2))
    ax2.set_xlabel("s")
    ax2.set_ylabel("short-term LUFS")
    ax3 = fig.add_axes([0.68, 0.07, 0.30, 0.25])
    ax3.bar(list(balance.keys()), list(balance.values()), color="#57a")
    ax3.set_ylabel("% energy")
    ax3.tick_params(axis="x", labelsize=8)
    png = path.replace(".wav", ".png")
    fig.savefig(png)
    plt.close(fig)
    out["png"] = png
    return out





def stem_table(folder):
    """Who carries which band: each stem's share of the full mix energy per band (stems are pre-master)."""
    import glob
    import os

    rows = []
    for f in sorted(glob.glob(os.path.join(folder, "*.wav"))):
        sr, x = load(f)
        m = (x[:, 0] + x[:, 1]) / 2
        fr, p = welch(m, sr, nperseg=8192)
        rows.append((os.path.basename(f)[:-4], {n: float(np.sum(p[(fr >= lo) & (fr < hi)])) for n, lo, hi in BANDS}))
    tot = {n: sum(r[1][n] for r in rows) + 1e-20 for n, _, _ in BANDS}
    print(f"{'stem':12}" + "".join(f"{n:>9}" for n, _, _ in BANDS))
    for name, e in rows:
        print(f"{name:12}" + "".join(f"{100 * e[n] / tot[n]:8.0f}%" for n, _, _ in BANDS))


if __name__ == "__main__" and len(sys.argv) > 2 and sys.argv[1] == "--stems":
    stem_table(sys.argv[2])
elif __name__ == "__main__":
    for p in sys.argv[1:]:
        r = analyze(p)
        with open(p.replace(".wav", ".ears.json"), "w") as fh:
            json.dump(r, fh, indent=2)
        print(json.dumps({k: v for k, v in r.items() if k not in ("file", "png")}, indent=1))
