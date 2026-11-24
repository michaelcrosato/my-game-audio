// ears.mjs: judge rendered audio by numbers, with no Python: loudness, true peak, band balance, stereo, onsets and
// tempo, key, clicks, and flags for what may sound wrong. A port of tools/ears.py's measurements (same bands,
// thresholds and key profiles), so an agent can check a render in Node or a browser. `node tools/ears.mjs` runs it on
// WAV files or on a song's cues; `checkAudio` turns the numbers into a pass or fail.
import { SR } from './dsp.mjs';
import { lufs } from './fx.mjs';

export const EAR_BANDS = [['sub', 20, 60], ['bass', 60, 250], ['low-mid', 250, 500], ['mid', 500, 2000], ['high-mid', 2000, 6000], ['air', 6000, 20000]];
// key profiles: Bellman-Budge (the share of each scale degree in the chords of tonal music). Over the 31 tonal cues of
// the cue sets and songs/lantern_road.mjs they name all 31 written keys; Krumhansl-Kessler's named 27 (the dominant
// or the relative minor for the rest)
const KEY_MAJOR = [16.8, 0.86, 12.95, 1.41, 13.49, 11.93, 1.25, 20.28, 1.8, 8.04, 0.62, 10.57];
const KEY_MINOR = [18.16, 0.69, 12.99, 13.34, 1.07, 11.15, 1.38, 21.07, 7.49, 1.53, 0.92, 10.21];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const dB = (x) => 20 * Math.log10(x + 1e-12);

// an in-place radix-2 FFT of re/im (length a power of two)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
const hann = (n) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
/** Magnitude spectra of frames of x (Hann window `n`, hop `hop`); calls each(k, mag) for frame k. */
function frames(x, n, hop, each, pad = false) {
  const w = hann(n), re = new Float64Array(n), im = new Float64Array(n), mag = new Float64Array(n / 2 + 1);
  const off = pad ? n / 2 : 0; // centred frames, as scipy's stft pads its ends
  const count = pad ? Math.floor(x.length / hop) + 1 : Math.max(0, Math.floor((x.length - n) / hop) + 1);
  for (let k = 0; k < count; k++) {
    const s = k * hop - off;
    for (let i = 0; i < n; i++) {
      const j = s + i;
      re[i] = j >= 0 && j < x.length ? x[j] * w[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let i = 0; i <= n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    each(k, mag);
  }
  return count;
}
// the true peak: 4x oversampled with a 32-tap windowed sinc (as resample_poly and loudness meters do)
const TP4 = [0.25, 0.5, 0.75].map((t) => Array.from({ length: 32 }, (_, j) => {
  const d = j - 15 - t;
  return (Math.sin(Math.PI * d) / (Math.PI * d)) * (0.5 + 0.5 * Math.cos((Math.PI * d) / 16));
}));
export function truePeak(x) {
  let m = 0;
  const n = x.length;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  const gate = m * 0.5; // between samples a signal can only beat the sample peak near loud samples
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(x[i]) < gate && Math.abs(x[i + 1]) < gate) continue;
    for (const k of TP4) {
      let v = 0;
      for (let j = 0; j < 32; j++) {
        const at = i - 15 + j;
        if (at >= 0 && at < n) v += k[j] * x[at];
      }
      if (Math.abs(v) > m) m = Math.abs(v);
    }
  }
  return m;
}
const corrcoef = (a, b) => {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) (ma += a[i]), (mb += b[i]);
  ma /= n;
  mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 1;
};

/**
 * Measure stereo audio (Float32Arrays at 44.1 kHz). Returns the same fields as tools/ears.py: seconds,
 * integrated_lufs, true_peak_dbtp, sample_peak_dbfs, crest_db, loudness_range_lu, balance_pct, centroid_hz,
 * stereo_corr, side_vs_mid_db, onsets_per_s, tempo_bpm_est, key_est, key_conf, key_runner_up, clicks, flags.
 */
/**
 * The energy in each band (EAR_BANDS) of a signal's mid channel: Welch's sum of 8192-point power spectra, half
 * overlapping, as the ears measure balance. Comparable between stems of one mix: { sub, bass, 'low-mid', ... }.
 */
export function bandEnergy(L, R = L, { sr = SR } = {}) {
  const mid = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) mid[i] = (L[i] + R[i]) / 2;
  const N1 = 8192, psd = new Float64Array(N1 / 2 + 1);
  frames(mid, N1, N1 / 2, (_, mag) => {
    for (let i = 0; i < psd.length; i++) psd[i] += mag[i] * mag[i];
  });
  const hz = sr / N1, out = {};
  for (const [name, lo, hi] of EAR_BANDS) {
    let e = 0;
    for (let i = 0; i < psd.length; i++) if (i * hz >= lo && i * hz < hi) e += psd[i];
    out[name] = e;
  }
  return out;
}

export function ears(L, R = L, { sr = SR } = {}) {
  const n = L.length;
  const mid = new Float64Array(n);
  let msq = 0, ssq = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    mid[i] = (L[i] + R[i]) / 2;
    const s = (L[i] - R[i]) / 2;
    msq += mid[i] * mid[i];
    ssq += s * s;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const integrated = lufs(L, R);
  const tp = dB(Math.max(truePeak(L), truePeak(R)));
  const rms = dB(Math.sqrt(msq / Math.max(1, n)));
  // short-term loudness (3 s windows, 1 s hop) for a loudness range estimate
  const st = [];
  for (let s = 0; s + 3 * sr <= n; s += sr) {
    const v = lufs(L.subarray(s, s + 3 * sr), R.subarray(s, s + 3 * sr));
    st.push(Number.isFinite(v) ? v : -70);
  }
  const valid = st.filter((v) => v > integrated - 20).sort((a, b) => a - b);
  const pct = (a, q) => {
    const x = (q / 100) * (a.length - 1), lo = Math.floor(x);
    return a[lo] + (a[Math.min(a.length - 1, lo + 1)] - a[lo]) * (x - lo);
  };
  const lra = valid.length > 2 ? pct(valid, 95) - pct(valid, 10) : 0;
  // spectral balance and centroid: Welch's average of 8192-point power spectra, half overlapping
  const N1 = 8192, psd = new Float64Array(N1 / 2 + 1);
  frames(mid, N1, N1 / 2, (_, mag) => {
    for (let i = 0; i < psd.length; i++) psd[i] += mag[i] * mag[i];
  });
  const hz = sr / N1;
  let tot = 0, cen = 0, all = 0;
  for (let i = 0; i < psd.length; i++) {
    const f = i * hz;
    if (f >= 20 && f <= 20000) tot += psd[i];
    cen += f * psd[i];
    all += psd[i];
  }
  const balance = {};
  for (const [name, lo, hi] of EAR_BANDS) {
    let e = 0;
    for (let i = 0; i < psd.length; i++) if (i * hz >= lo && i * hz < hi) e += psd[i];
    balance[name] = Math.round((1000 * e) / (tot || 1)) / 10;
  }
  const corr = corrcoef(L, R);
  const sideDb = 10 * Math.log10((ssq / Math.max(1, n) + 1e-20) / (msq / Math.max(1, n) + 1e-20));
  // onsets: spectral flux of log magnitudes (2048-point frames, hop 512), normalized; peaks over 1 are onsets
  const nper = 2048, hop = 512;
  let prev = null;
  const flux = [];
  frames(mid, nper, hop, (k, mag) => {
    const lg = Float64Array.from(mag, (m) => Math.log1p(100 * m * (2 / nper))); // scaled as scipy.signal.stft
    if (prev) {
      let f = 0;
      for (let i = 0; i < lg.length; i++) f += Math.max(0, lg[i] - prev[i]);
      flux.push(f);
    }
    prev = lg;
  }, true);
  const mean = flux.reduce((a, v) => a + v, 0) / Math.max(1, flux.length);
  const sd = Math.sqrt(flux.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, flux.length));
  const fz = flux.map((v) => (v - mean) / (sd + 1e-9));
  let onsets = 0;
  for (let i = 1; i < fz.length - 1; i++) if (fz[i] > 1 && fz[i] >= fz[i - 1] && fz[i] >= fz[i + 1]) onsets++;
  const dur = n / sr;
  // tempo: autocorrelation of the onset envelope between 50 and 220 BPM, with a log-normal prior around 120
  const env = fz.map((v) => Math.max(0, v));
  const fps = sr / hop;
  let best = 0, bestLag = 1;
  for (let lag = Math.floor((fps * 60) / 220) + 1; lag < (fps * 60) / 50; lag++) {
    let ac = 0;
    for (let i = 0; i + lag < env.length; i++) ac += env[i] * env[i + lag];
    const bpm = (60 * fps) / lag;
    const score = ac * Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    if (score > best) [best, bestLag] = [score, lag];
  }
  const tempo = (60 * fps) / bestLag;
  // key: chroma from 16384-point spectra (low notes land in the right pitch class), against the key profiles
  const N2 = 16384, chroma = new Float64Array(12), eSum = new Float64Array(N2 / 2 + 1);
  frames(mid, N2, 4096, (_, mag) => {
    for (let i = 0; i < eSum.length; i++) eSum[i] += mag[i] * mag[i];
  }, true);
  for (let i = 1; i < eSum.length; i++) {
    const f = (i * sr) / N2;
    if (f <= 60 || f >= 4200) continue;
    const semis = 12 * Math.log2(f / 440);
    if (Math.abs(semis - Math.round(semis)) >= 0.35) continue;
    chroma[(((Math.round(semis) + 9) % 12) + 12) % 12] += Math.sqrt(eSum[i]);
  }
  const csum = chroma.reduce((a, v) => a + v, 0) + 1e-12;
  const ch = Array.from(chroma, (v) => v / csum);
  const scores = [];
  for (let k = 0; k < 12; k++) {
    for (const [mode, prof] of [['major', KEY_MAJOR], ['minor', KEY_MINOR]]) {
      const rolled = prof.map((_, i) => prof[(i - k + 12) % 12]);
      scores.push([corrcoef(ch, rolled), `${NAMES[k]} ${mode}`]);
    }
  }
  scores.sort((a, b) => b[0] - a[0]);
  // clicks: a jump that is a lone spike (silence before, nothing after) or a cliff (sound stops dead); drum onsets,
  // where the sound carries on after the jump, are not clicks, and nor is a strike that opens an entry swelling in over
  // the next tens of ms (Aida's tutti under a triangle: little sound in its first 10 ms, more in the 40 after), so
  // "nothing after" holds for the first 50 ms
  const w = Math.round(0.01 * sr);
  const sq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sq[i + 1] = sq[i] + mid[i] * mid[i];
  let clicks = 0;
  for (let i = 0; i < n - 1; i++) {
    const d = Math.abs(mid[i + 1] - mid[i]);
    if (d <= 0.05) continue;
    const pre = Math.sqrt((sq[i] - sq[Math.max(0, i - w)]) / w);
    const post = Math.sqrt((sq[Math.min(n, i + 1 + w)] - sq[i + 1]) / w);
    const later = Math.sqrt((sq[Math.min(n, i + 1 + 5 * w)] - sq[i + 1]) / (5 * w));
    if ((pre < 0.005 && post < 0.25 * d && later < 0.25 * d) || (post < 0.003 && pre > 0.02)) clicks++;
  }
  const r = (x, k = 2) => Math.round(x * 10 ** k) / 10 ** k;
  const out = {
    seconds: r(dur), integrated_lufs: r(integrated), true_peak_dbtp: r(tp), sample_peak_dbfs: r(dB(peak)),
    crest_db: r(dB(peak) - rms, 1), loudness_range_lu: r(lra, 1), balance_pct: balance, centroid_hz: Math.round(cen / (all || 1)),
    stereo_corr: r(corr), side_vs_mid_db: r(sideDb, 1), onsets_per_s: r(onsets / dur), tempo_bpm_est: r(tempo, 1),
    key_est: scores[0][1], key_conf: r(scores[0][0]), key_runner_up: scores[1][1], clicks,
  };
  const flags = [];
  if (tp > -1) flags.push(`true peak ${tp.toFixed(1)} dBTP is above -1 dBTP`);
  if (balance['low-mid'] > 30) flags.push(`low-mids carry ${balance['low-mid']}% of the energy: may sound muddy`);
  if (balance.air < 0.5) flags.push(`only ${balance.air}% energy above 6 kHz: may sound dull`);
  if (balance.air > 25) flags.push(`${balance.air}% energy above 6 kHz: may sound harsh`);
  if (balance.sub + balance.bass > 65) flags.push('bass-heavy: sub + bass above 65%');
  if (corr < 0.1) flags.push(`stereo correlation ${corr.toFixed(2)}: phasey or too wide`);
  if (dB(peak) - rms < 8) flags.push(`crest factor ${(dB(peak) - rms).toFixed(1)} dB: heavily compressed`);
  if (clicks > 0) flags.push(`${clicks} click-like discontinuities`);
  out.flags = flags;
  return out;
}

/**
 * Pass or fail a measurement for a game: no clicks, true peak at or under -1 dBTP, loudness within `tolerance` LU of
 * `lufs` (default -16 +/- 2). The flags that remain (balance, stereo, crest) are warnings for a person to weigh.
 */
export function checkAudio(m, { lufs: target = -16, tolerance = 2 } = {}) {
  const problems = [];
  if (m.clicks > 0) problems.push(`${m.clicks} clicks`);
  if (m.true_peak_dbtp > -1) problems.push(`true peak ${m.true_peak_dbtp} dBTP over -1`);
  if (Math.abs(m.integrated_lufs - target) > tolerance) problems.push(`loudness ${m.integrated_lufs} LUFS, wanted ${target} +/- ${tolerance}`);
  const warnings = m.flags.filter((f) => !/click|true peak/.test(f));
  return { pass: problems.length === 0, problems, warnings };
}
