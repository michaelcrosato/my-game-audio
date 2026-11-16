"""piano_compare.py: measure single piano notes the same way, to calibrate the synthesized piano against references.

For each file: partial levels just after the attack (dB re the strongest partial), the decay of partials 1, 2, 4 and 8
early (0.1-1 s) and late (2-6 s) in dB/s, the share of energy above 2 kHz at 0.1 s, and the inharmonicity B fitted
from the partial frequencies.
usage: python3 tools/piano_compare.py MIDI file.wav [file.wav ...]
"""
import sys

import numpy as np
from scipy.io import wavfile


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    x /= np.max(np.abs(x)) + 1e-12
    # start at the attack
    i0 = int(np.argmax(np.abs(x) > 0.05))
    return sr, x[max(0, i0 - int(0.005 * sr)) :]


def partials(sr, x, f0, t0, win=0.25, kmax=24):
    n = int(win * sr)
    seg = x[int(t0 * sr) : int(t0 * sr) + n]
    if len(seg) < n:
        return None, None
    w = np.hanning(n)
    nfft = 1 << (int(np.ceil(np.log2(n))) + 2)
    sp = np.abs(np.fft.rfft(seg * w, nfft))
    fr = np.fft.rfftfreq(nfft, 1 / sr)
    amps, freqs = [], []
    for k in range(1, kmax + 1):
        # search around the harmonic, allowing up to +6% inharmonic stretch
        lo, hi = k * f0 * 0.985, k * f0 * (1.0 + 0.06 * (k / kmax) + 0.01)
        idx = np.where((fr >= lo) & (fr <= hi))[0]
        if not len(idx):
            amps.append(1e-9)
            freqs.append(np.nan)
            continue
        j = idx[np.argmax(sp[idx])]
        amps.append(sp[j])
        freqs.append(fr[j])
    return np.array(amps), np.array(freqs)


def main():
    midi = int(sys.argv[1])
    f0 = 440 * 2 ** ((midi - 69) / 12)
    rows = []
    for path in sys.argv[2:]:
        sr, x = load(path)
        a, f = partials(sr, x, f0, 0.05)
        ref = a.max()
        lv = 20 * np.log10(a / ref + 1e-12)
        # inharmonicity: f_k = k f0' sqrt(1 + B k^2) -> (f_k/k)^2 = f0'^2 + f0'^2 B k^2
        k = np.arange(1, len(f) + 1)
        ok = np.isfinite(f) & (lv > -50)
        B = np.nan
        if ok.sum() > 4:
            c = np.polyfit(k[ok] ** 2, (f[ok] / k[ok]) ** 2, 1)
            B = c[0] / c[1]
        dec = {}
        for kk in (1, 2, 4, 8):
            tr = []
            for t in np.arange(0.1, 8.0, 0.1):
                aa, _ = partials(sr, x, f0, t, win=0.1, kmax=kk)
                if aa is None:
                    break
                tr.append((t, 20 * np.log10(aa[kk - 1] + 1e-12)))
            tr = np.array(tr)
            def slope(t1, t2):
                m = (tr[:, 0] >= t1) & (tr[:, 0] <= t2) if len(tr) else []
                return np.polyfit(tr[m, 0], tr[m, 1], 1)[0] if len(tr) and m.sum() > 3 else np.nan
            dec[kk] = (slope(0.1, 1.0), slope(2.0, 6.0))
        seg = x[int(0.05 * sr) : int(0.30 * sr)]
        sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
        fr = np.fft.rfftfreq(len(seg), 1 / sr)
        hi = 100 * sp[fr > 2000].sum() / sp.sum()
        cent = (fr * sp).sum() / sp.sum()
        att = x[: int(0.02 * sr)]
        rows.append((path.split("/")[-1], lv, B, dec, hi, cent))
    print(f"MIDI {midi} f0 {f0:.1f} Hz")
    print("file".ljust(18) + "".join(f"{k:>6}" for k in range(1, 17)))
    for name, lv, B, dec, hi, cent in rows:
        print(name[:18].ljust(18) + "".join(f"{v:6.0f}" for v in lv[:16]))
    print()
    for name, lv, B, dec, hi, cent in rows:
        d = "  ".join(f"p{k}: {e:5.1f}/{l:5.1f}" for k, (e, l) in dec.items())
        print(f"{name[:18].ljust(18)} B {B:.2e}  >2kHz {hi:5.2f}%  centroid {cent:6.0f} Hz  dB/s early/late  {d}")


if __name__ == "__main__":
    main()
