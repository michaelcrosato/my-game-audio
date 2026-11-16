// "Ember Run": NES-faithful chiptune. Four channels only (two pulses, triangle, noise), FamiTracker-style macros.
import { arpLine, bassLine } from '../engine/score.mjs';

const INTRO = '| Em | C D |';
const A = '| Em | C | G | D | Em | C | Am | B |';
const B = '| C | D | Bm | Em | C | D | B7 | B |';
const A2 = '| Em | C | D | B7 |';

const GROOVE = 'k . h . s . h . k . h k s . h .';
const DRIVE = 'k . h h s . h . k k h . s . h h';

export default {
  title: 'Ember Run',
  style: 'Chiptune: NES 2A03, two pulses, triangle, noise',
  bpm: 150, meter: [4, 4], grid: 16, key: 'E minor', seed: 7, tail: 1.5,
  instruments: {
    lead: { type: 'chip', ch: 'pulse', duty: [1, 1, 2], vol: [15, 15, 14, 13, 12, 12, 11, 11, 10, 10, 10, 9], release: [5, 3, 2, 1], vib: [6, 22, 16] },
    harm: { type: 'chip', ch: 'pulse', duty: [0], vol: [10, 9, 8, 7, 7, 6], release: [3, 2, 1], vib: [6, 12, 20] },
    bass: { type: 'chip', ch: 'tri' },
    noise: {
      type: 'chip', ch: 'noise',
      kit: {
        h: { period: 1, vol: [7, 4, 2] },
        o: { period: 1, vol: [7, 6, 5, 4, 3, 3, 2, 2, 1, 1] },
        s: { period: [6, 5, 7, 8, 8, 9], vol: [14, 12, 10, 9, 7, 6, 4, 3, 2, 1] },
        k: { period: [11, 12, 13, 14, 14], vol: [15, 11, 7, 4, 2] },
        c: { period: [2, 3, 3, 3, 4], vol: [14, 13, 12, 11, 11, 10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1] },
      },
    },
  },
  parts: {
    pulse1: { inst: 'lead', pan: -0.12, role: 'melody', sends: { room: -20 } },
    pulse2: { inst: 'harm', pan: 0.22, role: 'harmony', gain: -2, sends: { room: -17 } },
    tri: { inst: 'bass', role: 'bass', gain: 1 },
    noise: { inst: 'noise', pan: 0.08, gain: -1, sends: { room: -24 } },
  },
  buses: { room: { type: 'reverb', rt60: 0.9, size: 0.6, predelay: 0.01, er: 0.5, hf: 0.5 } },
  sections: {
    intro: {
      bars: 2, chords: INTRO,
      parts: {
        pulse1: '| .:16 | .:8 B4:2 D5:2 E5:2 F#5:2 |',
        pulse2: arpLine(INTRO, { lo: 'E4', hi: 'D5', pattern: [0, 1, 2, 3, 2, 1, 0, 1] }),
        tri: bassLine(INTRO, { rhythm: 'xoxoxoxo', octave: 2 }),
        noise: '| h . h . h . h . h . h . h . h h | s . . . s . . . s . s . s s s s |',
      },
    },
    A: {
      bars: 8, chords: A,
      parts: {
        pulse1: `| E5:2 B4:2 E5:2 F#5:2 G5:4 F#5:2 E5:2 | G5:2 A5:2 G5:2 E5:2 C5:6 .:2
                 | D5:2 G5:2 B5:4 D6:2 B5:2 A5:2 G5:2 | A5:6 F#5:2 D5:4 .:2 D5:2
                 | E5:2 B4:2 E5:2 F#5:2 G5:4 B5:2 A5:2 | G5:2 E5:2 G5:2 C6:4 B5:2 A5:2 G5:2
                 | A5:4 C6:2 B5:2 A5:2 G5:2 E5:4 | F#5:4 D#5:4 B4:4 D#5:2 F#5:2 |`,
        pulse2: arpLine(A, { lo: 'B3', hi: 'B4', pattern: [0, 1, 2, 3, 2, 1, 2, 1], rate: 2 }),
        tri: bassLine(A, { rhythm: 'xoxoxoxo', octave: 2 }),
        noise: `| c . h . s . h . k . h k s . h . | ${GROOVE} | ${GROOVE} | ${GROOVE} | ${GROOVE} | ${GROOVE}
                | k . h . s . h . k . h k s . h h | k . h . s . s . s s s . s s s s |`,
      },
    },
    B: {
      bars: 8, chords: B,
      parts: {
        pulse1: `| G5:4 E5:2 G5:2 C6:6 B5:2 | A5:4 F#5:2 A5:2 D6:6 C6:2 | B5:4 D6:4 F#6:4 E6:2 D6:2 | E6:8 .:4 B5:2 D6:2
                 | E6:4 C6:2 D6:2 E6:4 G5:4 | A5:4 B5:2 C6:2 D6:4 F#5:4 | D#6:6 B5:2 A5:4 F#5:4 | B5:8 F#5:4 D#5:4 |`,
        pulse2: `| E5:8 G5:8 | F#5:8 A5:8 | F#5:4 B5:4 D6:4 B5:4 | G5:8 .:4 G5:2 B5:2
                 | C6:4 G5:2 B5:2 C6:4 E5:4 | F#5:4 G5:2 A5:2 A5:4 D5:4 | B5:6 F#5:2 F#5:4 D#5:4 | F#5:8 D#5:4 B4:4 |`,
        tri: bassLine(B, { rhythm: 'xxoxxoxo', octave: 2 }),
        noise: `| c . h h s . h . k k h . s . h h | ${DRIVE} | ${DRIVE} | ${DRIVE} | ${DRIVE} | ${DRIVE}
                | k . h h s . h . k k h . s . s s | s . s . s . s s s . s s s s s s |`,
      },
    },
    A2: {
      bars: 4, chords: A2,
      parts: {
        pulse1: '| E5:2 B4:2 E5:2 F#5:2 G5:4 F#5:2 E5:2 | G5:2 A5:2 G5:2 E5:2 C5:6 .:2 | A5:4 B5:2 A5:2 F#5:4 D5:4 | D#5:4 F#5:4 B5:4 A5:2 F#5:2 |',
        pulse2: arpLine(A2, { lo: 'B3', hi: 'B4', pattern: [0, 1, 2, 3, 2, 1, 2, 1], rate: 2 }),
        tri: bassLine(A2, { rhythm: 'xoxoxoxo', octave: 2 }),
        noise: `| c . h . s . h . k . h k s . h . | ${GROOVE} | ${GROOVE} | k . s . s . s s s s s s s s s s |`,
      },
    },
    tag: {
      bars: 2, chords: '| Em | Em |',
      parts: {
        pulse1: '| E5:4 B5:4 E6:8 | -:8 .:8 |',
        pulse2: '| B4:4 E5:4 G5:8 | -:8 .:8 |',
        tri: '| E2:2 E3:2 E2:2 E3:2 E2:8 | -:8 .:8 |',
        noise: '| c . h . s . s s c:8 | .:16 |',
      },
    },
  },
  form: ['intro', 'A', 'B', 'A2', 'tag'],
  // as game music: the intro once, then A B A2 forever; the noise channel is a layer a game can bring in and out
  intro: ['intro'], loop: ['A', 'B', 'A2'],
  layers: { drums: ['noise'] },
  stingers: { win: ['tag'] },
  master: { lufs: -16, eq: [['hp', 37, 0.7], ['lp', 14000, 0.7]] },
};
