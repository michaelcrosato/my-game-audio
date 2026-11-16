// "Iron Vow": metal. Double-tracked Karplus-Strong rhythm guitars through a 4x-oversampled drive and a cabinet
// model, palm-muted gallops, a vibrato lead, a driven bass and a synthesized rock kit.
import { noteToMidi, midiToName } from '../engine/score.mjs';

// small generators, written for this song: power chords from chord roots, and a bass line from a guitar line
const POWER = { E: 'E2', F: 'F2', 'F#': 'F#2', G: 'G2', A: 'A2', Bb: 'A#2', B: 'B2', C: 'C3', D: 'D3' };
const pc = (root) => {
  const m = noteToMidi(POWER[root]);
  return `[${[m, m + 7, m + 12].map(midiToName).join(' ')}]`;
};
const roots = (line) => line.replace(/\[([^\s\]]+)[^\]]*\]/g, '$1').replace(/([A-G][#b]?)(\d)/g, (_, n, o) => `${n}${Number(o) - 1}`);
const strum = (chords, rhythm) =>
  '| ' + chords.map((c) => rhythm.replace(/X/g, pc(c))).join(' | ') + ' |';

const E = 'E2:2^ E2^ E2^';
const VERSE = `| ${E} ${E} ${pc('G')}:2! ${pc('G')}:2 ${E}
               | ${E} ${E} ${pc('A')}:2! ${pc('A')}:2 ${pc('G')}:2! ${pc('F#')}:2
               | ${E} ${E} ${pc('G')}:2! ${pc('G')}:2 ${E}
               | ${E} ${E} ${pc('A')}:2! ${pc('A')}:2 ${pc('G')}:2! ${pc('F#')}:2
               | ${E} ${E} ${pc('C')}:4! ${pc('B')}:4
               | ${E} ${E} ${pc('A')}:4! ${pc('G')}:4
               | ${E} ${E} ${pc('C')}:2! ${pc('C')}:2 ${pc('D')}:2! ${pc('D')}:2
               | ${pc('B')}:8! ${pc('B')}:2^ ${pc('B')}:2^ ${pc('B')}:2^ ${pc('B')}:2^ |`;
const CHORUS_ROOTS = ['E', 'C', 'G', 'D', 'E', 'C', 'A', 'B'];
const CHORUS = strum(CHORUS_ROOTS, 'X:4! X:2 X:2 X:4 X:2 X:2');

const VK = 'k . k k k . k k k . k . k . k k';
const SN = '.:4 s .:7 s .:3';
const HH = 'h . h . h . h . h . h . h . h .';
const CK = 'k . k . k . k . k . k . k . k .';
const RD = 'r . r . r . r . r . r . r . r .';

export default {
  title: 'Iron Vow',
  style: 'Band: metal',
  bpm: 150, meter: [4, 4], grid: 16, key: 'E minor', seed: 66, tail: 2.5,
  instruments: {
    gtr: { type: 'pluck', bright: 0.75, pick: 0.11, decay: 2.4, damp: 0.22, muteT: 0.06, pmT: 0.12, strum: 0.006, rangeName: 'guitar' },
    lead: { type: 'pluck', bright: 0.7, pick: 0.13, decay: 6, damp: 0.18, muteT: 0.08, vib: [5.6, 0.28, 0.22], rangeName: 'guitar' },
    bass: { type: 'pluck', bright: 0.45, pick: 0.14, decay: 2.2, damp: 0.35, muteT: 0.07, pmT: 0.1, rangeName: 'bassguitar' },
    kit: {
      type: 'drums',
      kit: {
        k: { type: 'kick', f0: 58, f1: 140, pd: 0.025, d: 0.22, click: 0.8, thump: 0.3, drive: 2.4, gain: 1.0 },
        s: { type: 'snare', tone: [200, 335], td: 0.16, nd: 0.22, nf: [1500, 11000], snap: 0.8, bodyMix: 0.7, noiseMix: 0.9, gain: 0.95 },
        t1: { type: 'tom', f0: 165, f1: 220, pd: 0.05, d: 0.45, thump: 0.25, gain: 0.8, pan: -0.25 },
        t2: { type: 'tom', f0: 120, f1: 165, pd: 0.05, d: 0.5, thump: 0.25, gain: 0.8, pan: 0.1 },
        t3: { type: 'tom', f0: 85, f1: 115, pd: 0.06, d: 0.6, thump: 0.25, gain: 0.85, pan: 0.35 },
        h: { type: 'metal', d: 0.07, bp: 9000, hp: 6500, metal: 0.55, gain: 0.35, pan: 0.3 },
        r: { type: 'metal', d: 1.2, bp: 5500, hp: 3500, q: 0.7, metal: 0.6, scale: 1.7, gain: 0.3, pan: -0.3 },
        c: { type: 'metal', d: 2.0, bp: 6000, hp: 3000, q: 0.5, metal: 0.4, scale: 1.4, gain: 0.5, pan: -0.35 },
      },
    },
  },
  parts: {
    gtr: {
      inst: 'gtr', double: 0.85, gain: -4, humanize: 0.004, sends: { room: -18 },
      fx: [['drive', { gain: 26, bias: 0.1, pre: [['hp', 90, 0.7], ['peak', 720, 0.9, 6], ['lp', 6500, 0.7]], level: -20 }], ['cab', 'metal'], ['eq', [['peak', 140, 0.9, 3]]]],
    },
    lead: {
      inst: 'lead', role: 'melody', mono: true, gain: -5, pan: 0.05, sends: { hall: -10, delay: -12 },
      fx: [['drive', { gain: 36, bias: 0.12, pre: [['hp', 200, 0.7], ['peak', 900, 0.8, 5], ['lp', 7000, 0.7]], level: -20 }], ['cab', 'lead']],
    },
    bass: {
      inst: 'bass', role: 'bass', mono: true, gain: 1,
      fx: [['drive', { gain: 10, bias: 0.05, pre: [['hp', 35, 0.7]], level: -14 }], ['cab', 'bass'], ['comp', { threshold: -22, ratio: 4, attack: 0.005, release: 0.1 }]],
    },
    kick: { inst: 'kit', mono: true, gain: -11 },
    snare: { inst: 'kit', gain: -6, sends: { room: -10 } },
    cymbals: { inst: 'kit', gain: -12, sends: { room: -14 } },
  },
  buses: {
    room: { type: 'reverb', rt60: 0.85, size: 0.7, predelay: 0.008, er: 0.6, hf: 0.45, lowCut: 250, highCut: 9000 },
    hall: { type: 'reverb', rt60: 2.2, size: 1.2, predelay: 0.03, hf: 0.5, lowCut: 300, highCut: 8000 },
    delay: { type: 'delay', time: '1/4', feedback: 0.3, lowCut: 400, highCut: 4000 },
  },
  sections: {
    intro: {
      bars: 2, chords: '| Em | Em |',
      parts: {
        gtr: `| .:16 | ${pc('E')}:16! |`,
        bass: '| .:16 | E1:16 |',
        kick: '| .:16 | k:16 |',
        snare: '| s s s s t1 t1 t2 t2 t3 t3 t3 t3 s! s! s! s! | .:16 |',
        cymbals: '| .:16 | c:16 |',
      },
    },
    verse: {
      bars: 8, chords: '| Em | Em | Em | Em | Em | Em | Em | B |',
      parts: {
        gtr: VERSE,
        bass: roots(VERSE),
        kick: `| ${VK} | ${VK} | ${VK} | ${VK} | ${VK} | ${VK} | ${VK} | k:8 k . k . k . k . |`,
        snare: `| ${SN} | ${SN} | ${SN} | ${SN} | ${SN} | ${SN} | ${SN} | .:8 s s t1 t1 t2 t2 t3 t3 |`,
        cymbals: `| c . h . h . h . h . h . h . h . | ${HH} | ${HH} | ${HH} | c . h . h . h . h . h . h . h . | ${HH} | ${HH} | c:8 .:8 |`,
      },
    },
    chorus: {
      bars: 8, chords: '| Em | C | G | D | Em | C | Am | B |',
      parts: {
        gtr: CHORUS,
        lead: '| B4:4 E5:4 G5:6 F#5:2 | E5:4 D5:2 C5:2 G4:8 | D5:4 B4:4 G4:4 B4:2 D5:2 | A4:12 F#4:4 | B4:4 E5:4 G5:4 B5:4 | C6:6 B5:2 G5:8 | A5:4 C6:4 E5:4 A5:4 | F#5:8 D#5:4 B4:4 |',
        bass: roots(CHORUS),
        kick: CK,
        snare: `| ${SN} | ${SN} | ${SN} | ${SN} | ${SN} | ${SN} | ${SN} | s s s s t1 t1 t2 t2 t3 t3 t3 t3 s! s! s! s! |`,
        cymbals: `| c . r . r . r . r . r . r . r . | ${RD} | c . r . r . r . r . r . r . r . | ${RD} | c . r . r . r . r . r . r . r . | ${RD} | c . r . r . r . r . r . r . r . | ${RD} |`,
      },
    },
    outro: {
      bars: 2, chords: '| Em | Em |',
      parts: {
        gtr: `| ${pc('E')}:2! .:2 ${pc('E')}:2! .:2 ${pc('E')}:8! | -:16 |`,
        bass: '| E1:2 .:2 E1:2 .:2 E1:8 | -:16 |',
        kick: '| k . . . k . . . k:8 | .:16 |',
        snare: '| s . . . s . . . s:8 | .:16 |',
        cymbals: '| c . . . c . . . c:8 | .:16 |',
      },
    },
  },
  form: ['intro', 'verse', 'chorus', 'outro'],
  intro: ['intro'], loop: ['verse', 'chorus'],
  layers: { drums: ['kick', 'snare', 'cymbals'], lead: ['lead'] },
  stingers: { end: ['outro'] },
  master: { lufs: -16, eq: [['hp', 30, 0.7]], comp: { threshold: -14, ratio: 2.5, attack: 0.01, release: 0.15 } },
};
