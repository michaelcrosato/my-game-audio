// "Neon Causeway": synthwave. Supersaw pad, 16th arpeggio through a ping-pong delay, octave bass, saw lead,
// four-on-the-floor kit with a gated snare; pad, bass and arp duck under the kick.
import { arpLine, bassLine, padLine } from '../engine/score.mjs';

const INTRO = '| Am | F | C | G |';
const A = '| Am | F | C | G | Am | F | Dm | E |';
const B = '| F | G | Em | Am |';
const OUT = '| F | Am |';

const KICK = 'k . . . k . . . k . . . k . . .';
const SNARE = '.:4 s .:7 s .:3';
const HATS = 'h? h? o h? h? h? o h? h? h? o h? h? h? o h?';
const HATS_C = 'c h? o h? h? h? o h? h? h? o h? h? h? o h?';

export default {
  title: 'Neon Causeway',
  style: 'Electronic: synthwave',
  bpm: 100, meter: [4, 4], grid: 16, key: 'A minor', seed: 21, tail: 3.5,
  instruments: {
    lead: {
      type: 'va', osc: 'saw', unison: 3, detune: 9, spread: 0.25, glide: 0.06, vib: [5.5, 0.16, 0.35],
      filter: { type: 'lp24', cutoff: 2300, res: 0.25, env: 1.6, key: 0.4, a: 0.01, d: 0.7, s: 0.5 }, amp: { a: 0.015, d: 0.3, s: 0.85, r: 0.35 },
    },
    arp: {
      type: 'va', osc: 'saw', filter: { type: 'lp24', cutoff: 420, res: 0.3, env: 3.4, key: 0.5, a: 0.001, d: 0.16, s: 0 },
      amp: { a: 0.002, d: 0.22, s: 0.0, r: 0.1 },
    },
    pad: {
      type: 'va', osc: 'saw', unison: 7, detune: 24, spread: 0.85,
      filter: { type: 'lp12', cutoff: 9000, res: 0.08, env: 0.3, a: 0.6, d: 1.5, s: 0.8 }, amp: { a: 0.45, d: 1, s: 0.9, r: 1.3 },
    },
    bass: {
      type: 'va', osc: 'saw', sub: 0.6, unison: 2, detune: 7,
      filter: { type: 'lp24', cutoff: 300, res: 0.22, env: 2.3, key: 0.2, a: 0.001, d: 0.14, s: 0.2 }, amp: { a: 0.003, d: 0.2, s: 0.85, r: 0.07 },
    },
    kit: {
      type: 'drums',
      kit: {
        k: { type: 'kick', f0: 47, f1: 145, pd: 0.035, d: 0.42, click: 0.25, drive: 1.7, gain: 1.1 },
        s: { type: 'snare', tone: [190, 330], td: 0.12, nd: 0.25, nf: [1100, 12500], snap: 0.7, gate: [0.55, 0.2, 0.03], len: 0.42, gain: 0.85 },
        h: { type: 'metal', d: 0.05, bp: 10500, hp: 7500, metal: 0.65, gain: 0.32, pan: 0.25 },
        o: { type: 'metal', d: 0.3, bp: 9500, hp: 6500, metal: 0.6, gain: 0.26, pan: 0.25 },
        c: { type: 'metal', d: 2.4, bp: 6500, hp: 3500, q: 0.6, metal: 0.45, scale: 1.4, gain: 0.42, pan: -0.2 },
      },
    },
  },
  parts: {
    lead: { inst: 'lead', role: 'melody', gain: -3, pan: 0.05, sends: { delay: -11, hall: -12 } },
    arp: { inst: 'arp', role: 'harmony', gain: -7, pan: 0.18, sends: { delay: -5, hall: -14 }, fx: [['dynlp', 1200, 14000, 0.7], ['duck', { source: 'kick', token: 'k', depth: 0.35, release: 0.16 }]] },
    pad: { inst: 'pad', role: 'harmony', gain: -10, sends: { hall: -7 }, fx: [['dynlp', 400, 13000, 0.6], ['duck', { source: 'kick', token: 'k', depth: 0.55, release: 0.22 }]] },
    bass: { inst: 'bass', role: 'bass', gain: -3, mono: true, fx: [['duck', { source: 'kick', token: 'k', depth: 0.45, release: 0.14 }]] },
    kick: { inst: 'kit', gain: -2, mono: true },
    snare: { inst: 'kit', gain: -5, sends: { hall: -13 } },
    hats: { inst: 'kit', gain: -5, sends: { hall: -20 } },
  },
  buses: {
    hall: { type: 'reverb', rt60: 2.6, size: 1.1, predelay: 0.03, hf: 0.5, lowCut: 220, highCut: 8000 },
    delay: { type: 'delay', time: '3/16', feedback: 0.42, lowCut: 300, highCut: 3800 },
  },
  sections: {
    intro: {
      bars: 4, chords: INTRO,
      parts: {
        pad: padLine(INTRO, { lo: 'A3', hi: 'E5', notes: 4 }),
        arp: arpLine(INTRO, { lo: 'A3', hi: 'A4', pattern: [0, 1, 2, 3, 1, 2, 3, 2] }),
        bass: '| .:16 | .:16 | ' + bassLine('| C | G |', { rhythm: 'xoxoxoxo', octave: 1 }).slice(2),
        kick: `| .:16 | .:16 | ${KICK} | ${KICK} |`,
        hats: `| .:16 | .:16 | ${HATS} | ${HATS} |`,
        snare: '| .:16 | .:16 | .:16 | .:8 s? s? s s s s s! s! |',
      },
      dyn: { pad: '| pp< | - | - | f |', arp: '| p< | - | - | f |' },
    },
    A: {
      bars: 8, chords: A,
      parts: {
        lead: `| E5:6 D5:2 C5:4 B4:2 C5:2 | A4:8 .:4 C5:2 D5:2 | E5:6 G5:2 E5:4 D5:2 C5:2 | D5:12 .:4
               | E5:6 D5:2 C5:4 E5:2 A5:2 | A5:6 G5:2 F5:4 E5:2 C5:2 | D5:6 F5:2 A5:4 G5:2 F5:2 | G#5:8 B5:4 E5:4 |`,
        pad: padLine(A, { lo: 'A3', hi: 'E5', notes: 4 }),
        arp: arpLine(A, { lo: 'A3', hi: 'A4', pattern: [0, 1, 2, 3, 1, 2, 3, 2] }),
        bass: bassLine(A, { rhythm: 'xoxoxoxo', octave: 1 }),
        kick: KICK,
        snare: `| ${SNARE} | ${SNARE} | ${SNARE} | ${SNARE} | ${SNARE} | ${SNARE} | ${SNARE} | .:4 s .:5 s? s? s s s s |`,
        hats: `| ${HATS_C} | ${HATS} | ${HATS} | ${HATS} | ${HATS} | ${HATS} | ${HATS} | ${HATS} |`,
      },
      dyn: { pad: '| f |', arp: '| f |' },
    },
    B: {
      bars: 4, chords: B,
      parts: {
        lead: '| C6:6 A5:2 F5:4 A5:2 C6:2 | D6:6 B5:2 G5:4 B5:2 D6:2 | E6:8 D6:4 B5:4 | C6:4 B5:4 A5:8 |',
        pad: padLine(B, { lo: 'C4', hi: 'G5', notes: 4 }),
        arp: arpLine(B, { lo: 'C4', hi: 'C5', pattern: [0, 1, 2, 3, 1, 2, 3, 2] }),
        bass: bassLine(B, { rhythm: 'xoxoxoxo', octave: 1 }),
        kick: KICK,
        snare: `| ${SNARE} | ${SNARE} | ${SNARE} | s? s? s? s? s s s s s s s s s! s! s! s! |`,
        hats: `| ${HATS_C} | ${HATS} | ${HATS} | ${HATS} |`,
      },
      dyn: { pad: '| ff |', arp: '| ff |' },
    },
    outro: {
      bars: 2, chords: OUT,
      parts: {
        lead: '| A5:12 G5:2 F5:2 | E5:16 |',
        pad: padLine(OUT, { lo: 'A3', hi: 'E5', notes: 4 }),
        arp: arpLine(OUT, { lo: 'A3', hi: 'A4', pattern: [0, 1, 2, 3, 1, 2, 3, 2] }),
        bass: '| F1:4 F2:4 F1:4 F2:4 | A1:16 |',
        kick: '| k . . . k . . . k . . . k . . . | k .:15 |',
        snare: `| ${SNARE} | .:16 |`,
        hats: '| c h? o h? h? h? o h? h? h? o h? h? h? o h? | c .:15 |',
      },
      dyn: { pad: '| f> | pp |', arp: '| f> | p |' },
    },
  },
  form: ['intro', 'A', 'B', 'outro'],
  master: { lufs: -16, eq: [['hp', 25, 0.7], ['hs', 7000, 0.7, 2.5]], comp: { threshold: -16, ratio: 2, attack: 0.02, release: 0.2 } },
};
