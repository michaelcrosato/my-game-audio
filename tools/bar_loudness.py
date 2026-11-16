"""Loudness (LUFS, K-weighted, gated per window) of consecutive windows of a WAV: one value per bar or section.
usage: python3 tools/bar_loudness.py FILE.wav SECONDS_PER_WINDOW [LABEL ...]"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

sr, x = wavfile.read(sys.argv[1])
x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
if x.ndim == 1:
    x = x[:, None]
# K-weighting (ITU-R BS.1770) at 44.1/48 kHz via bilinear-designed coefficients
from scipy.signal import bilinear
def kw(sig):
    import math
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / sr)
    Vh, Vb = 10 ** (G / 20), (10 ** (G / 20)) ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = lfilter(b, a, sig, axis=0)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / sr)
    a = [1, 2 * (K * K - 1) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)]
    return lfilter([1, -2, 1], a, y, axis=0)
y = kw(x)
win = float(sys.argv[2])
labels = sys.argv[3:]
n = int(win * sr)
out = []
for k in range(int(len(y) / n)):
    seg = y[k * n:(k + 1) * n]
    ms = np.mean(seg ** 2, axis=0).sum()
    L = -0.691 + 10 * np.log10(ms + 1e-12)
    out.append(L)
    lab = labels[k] if k < len(labels) else str(k + 1)
    print(f"{lab:18} {L:6.1f}")
