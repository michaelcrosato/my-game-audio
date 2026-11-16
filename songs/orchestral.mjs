// "The Last Lantern": a short cinematic cue for strings, horns, trombones, choir, harp, timpani, glockenspiel and
// percussion. Every instrument is synthesized: bowed-string ensembles with body resonances, brass with dynamic
// brightness, a formant choir, Karplus-Strong harp, modal timpani and glockenspiel.
import { arpLine } from '../engine/score.mjs';

const INTRO = '| Dm | Dm |';
const THEME = '| Dm | Bb | Gm | A |';
const THEME2 = '| Dm | Bb | Gm C | F A |';
const CLIMAX = '| Bb | C | Dm | A |';
const CODA = '| Dm | D |';

const VIOLIN_BODY = [['hp', 180, 0.7], ['peak', 280, 1.5, 3], ['peak', 480, 1.2, 2], ['peak', 1000, 1.0, -2], ['peak', 2800, 1.4, 3.5], ['peak', 4500, 1.0, -1.5], ['lp', 12000, 0.7]];
const VIOLA_BODY = [['hp', 120, 0.7], ['peak', 230, 1.4, 3], ['peak', 400, 1.2, 2], ['peak', 900, 1.0, -2], ['peak', 2200, 1.4, 2.5], ['lp', 10000, 0.7]];
const CELLO_BODY = [['hp', 55, 0.7], ['peak', 110, 1.3, 3], ['peak', 220, 1.2, 2], ['peak', 600, 1.0, -1.5], ['peak', 1500, 1.4, 2], ['lp', 8000, 0.7]];
const BASS_BODY = [['hp', 30, 0.7], ['peak', 65, 1.2, 3], ['peak', 140, 1.2, 1.5], ['peak', 450, 1.0, -2], ['lp', 3500, 0.7]];
const HORN_EQ = [['hp', 70, 0.7], ['peak', 400, 1.0, 2], ['peak', 1200, 1.0, -1.5], ['lp', 5200, 0.7]];
const TBN_EQ = [['hp', 60, 0.7], ['peak', 300, 1.0, 1.5], ['peak', 1500, 1.2, 2], ['lp', 6500, 0.7]];

const harp = (chords, opts = {}) => arpLine(chords, { lo: 'D3', hi: 'D5', rate: 2, pattern: [0, 1, 2, 3, 4, 3, 2, 1], ...opts });

export default {
  title: 'The Last Lantern',
  style: 'Orchestral: strings, brass, choir, harp, timpani',
  bpm: 72, meter: [4, 4], grid: 16, key: 'D minor', seed: 1337, tail: 4.5,
  instruments: {
    violins: { type: 'strings', players: 8, detune: 5, vib: [5.8, 0.16, 0.25], attack: 0.12, release: 0.4, noise: 0.05, spread: 0.22, bright: [6, 32], rangeName: 'violin' },
    violas: { type: 'strings', players: 6, detune: 5, vib: [5.5, 0.15, 0.25], attack: 0.14, release: 0.4, bright: [5, 26], rangeName: 'viola' },
    cellos: { type: 'strings', players: 6, detune: 5, vib: [5.2, 0.14, 0.3], attack: 0.15, release: 0.45, bright: [4, 20], rangeName: 'cello' },
    basses: { type: 'strings', players: 4, detune: 4, vib: [4.8, 0.1, 0.35], attack: 0.18, release: 0.5, bright: [2.5, 10], rangeName: 'bass' },
    horns: { type: 'brass', players: 3, detune: 4, attack: 0.07, release: 0.32, scoop: 0.25, bright: [1.2, 11], res: 0.15, breath: 0.02, vib: [4.8, 0.04, 0.5], rangeName: 'horn' },
    trombones: { type: 'brass', players: 3, detune: 4, attack: 0.05, release: 0.28, scoop: 0.2, bright: [1.3, 14], res: 0.2, rangeName: 'trombone' },
    choir: { type: 'choir', players: 6, vib: [5.2, 0.25, 0.4], attack: 0.35, release: 0.7, tilt: 5, rangeName: 'alto' },
    timpani: {
      type: 'modal', rangeName: 'timpani', hardness: 900, noise: 0.22, noiseLP: 2500, velBright: 0.7, rollRate: 15, gain: 0.9,
      modes: [[0.63, 0.55, 0.25], [1, 1, 2.2], [1.5, 0.55, 1.6], [1.98, 0.35, 1.1], [2.44, 0.22, 0.8], [2.9, 0.12, 0.6]],
    },
    harp: { type: 'pluck', bright: 0.35, pick: 0.27, decay: 5, damp: 0.32, ring: true, rangeName: 'harp' },
    glock: { type: 'modal', rangeName: 'glock', hardness: 9000, noise: 0.08, noiseLP: 8000, velBright: 0.4, modes: [[1, 1, 3.0], [2.756, 0.38, 1.4], [5.404, 0.16, 0.7], [8.933, 0.06, 0.35]] },
    perc: {
      type: 'drums',
      kit: {
        b: { type: 'kick', f0: 40, f1: 62, pd: 0.09, d: 1.6, thump: 0.9, drive: 1.2, gain: 1 },
        c: { type: 'metal', d: 3.2, bp: 5200, hp: 2400, q: 0.5, metal: 0.4, scale: 1.25, gain: 0.5 },
        w: { type: 'metal', d: 1.5, swell: 'dur', bp: 6000, hp: 3000, q: 0.5, metal: 0.35, scale: 1.3, attack: 0, gain: 0.45 },
      },
    },
  },
  parts: {
    violinsI: { inst: 'violins', role: 'melody', pan: -0.55, gain: -1, fx: [['eq', VIOLIN_BODY], ['dynlp', 3500, 14000]], sends: { hall: -7 } },
    violinsII: { inst: 'violins', role: 'harmony', pan: -0.25, gain: -3, fx: [['eq', VIOLIN_BODY], ['dynlp', 3300, 11000]], sends: { hall: -7 } },
    violas: { inst: 'violas', role: 'harmony', pan: 0.2, gain: -3, fx: [['eq', VIOLA_BODY], ['dynlp', 3000, 10000]], sends: { hall: -7 } },
    cellos: { inst: 'cellos', role: 'harmony', pan: 0.45, gain: -2, fx: [['eq', CELLO_BODY], ['dynlp', 2000, 8000]], sends: { hall: -8 } },
    basses: { inst: 'basses', role: 'bass', pan: 0.65, gain: -4, fx: [['eq', BASS_BODY], ['dynlp', 900, 3500]], sends: { hall: -10 } },
    horns: { inst: 'horns', role: 'melody', pan: -0.12, gain: -2, fx: [['eq', HORN_EQ]], sends: { hall: -3 } },
    trombones: { inst: 'trombones', role: 'harmony', pan: 0.25, gain: -5, fx: [['eq', TBN_EQ]], sends: { hall: -5 } },
    choirOo: { inst: 'choir', role: 'harmony', gain: 4, fx: [['formant', 'alto', 'u'], ['eq', [['hp', 150, 0.7], ['lp', 8000, 0.7]]]], sends: { hall: -2 } },
    choirAh: { inst: 'choir', role: 'harmony', gain: 2, fx: [['formant', 'alto', 'a'], ['eq', [['hp', 160, 0.7], ['lp', 9000, 0.7]]]], sends: { hall: -2 } },
    timpani: { inst: 'timpani', pan: 0.05, gain: 0, sends: { hall: -8 } },
    harp: { inst: 'harp', role: 'harmony', pan: -0.4, gain: -3, sends: { hall: -7 } },
    glock: { inst: 'glock', pan: 0.3, gain: -8, sends: { hall: -5 } },
    drum: { inst: 'perc', pan: 0, gain: -4, sends: { hall: -6 } },
    cym: { inst: 'perc', pan: 0.1, gain: -9, sends: { hall: -5 } },
  },
  buses: { hall: { type: 'reverb', rt60: 2.4, size: 1.3, predelay: 0.025, er: 0.45, hf: 0.5, lowCut: 140, highCut: 9500 } },
  sections: {
    intro: {
      bars: 2, chords: INTRO,
      parts: {
        basses: '| D2:16 | -:16 |',
        cellos: '| D3:16 | -:16 |',
        violas: '| [F3 A3]:16~ | -:16 |',
        timpani: '| D2:16~ | -:8 .:4 A2:2! D2:2! |',
        harp: harp(INTRO),
        choirOo: '| .:16 | [D4 F4 A4]:16 |',
      },
      dyn: { basses: '| p< | mf |', cellos: '| p< | mf |', violas: '| pp< | mp |', timpani: '| pp< | f |', harp: '| mp |', choirOo: '| pp | pp |' },
    },
    theme: {
      bars: 4, chords: THEME,
      parts: {
        horns: '| A3:4 D4:4 F4:6 E4:2 | D4:6 C4:2 Bb3:4 F4:4 | G4:6 F4:2 D4:4 Bb3:2 C4:2 | C#4:8 E4:4 A3:4 |',
        violinsI: '| D5:16 | D5:16 | D5:16 | C#5:16 |',
        violinsII: '| A4:16 | Bb4:16 | Bb4:16 | A4:16 |',
        violas: '| F3:16 | F3:16 | G3:16 | A3:16 |',
        cellos: '| D3:16 | D3:16 | D3:8 Bb2:8 | C#3:8 E3:8 |',
        basses: '| D2:16 | Bb1:16 | G1:16 | A1:16 |',
        harp: harp(THEME),
        timpani: '| D2:16 | .:16 | G2:8 .:8 | A2:4 .:4 A2:2 A2:2 A2:4 |',
      },
      dyn: {
        horns: '| mf | mf | mf< | f |', violinsI: '| p | mp | mp< | mf |', violinsII: '| p | mp | mp< | mf |', violas: '| mp |',
        cellos: '| mp |', basses: '| mp |', harp: '| mp |', timpani: '| mp | mp | mp< | f |',
      },
    },
    theme2: {
      bars: 4, chords: THEME2,
      parts: {
        violinsI: '| A4:4 D5:4 F5:6 E5:2 | D5:6 C5:2 Bb4:4 F5:4 | G5:6 F5:2 E5:4 C5:4 | F5:4 A5:4 C#5:4 E5:4 |',
        violinsII: '| F4:8 A4:8 | Bb4:8 D5:8 | Bb4:8 G4:4 E4:4 | A4:8 A4:4 C#5:4 |',
        violas: '| D4:8 F4:8 | F4:16 | D4:8 E4:8 | C4:8 C#4:8 |',
        cellos: '| D3:8 A2:8 | Bb2:16 | G2:8 C3:8 | F2:8 A2:8 |',
        basses: '| D2:16 | Bb1:16 | G1:8 C2:8 | F1:8 A1:8 |',
        horns: '| F4:8 E4:8 | D4:16 | D4:8 E4:8 | F4:8 E4:8 |',
        harp: harp(THEME2),
        choirAh: '| .:16 | .:16 | [D4 G4 Bb4]:8 [E4 G4 C5]:8 | [F4 A4 C5]:8 [E4 A4 C#5]:8 |',
        glock: '| A6:4 .:12 | F6:4 .:12 | D6:4 .:12 | E6:4 .:4 C#6:4 .:4 |',
        timpani: '| D2:4 .:12 | F2:4 .:12 | G2:8 .:8 | A2:4 .:4 A2:2 A2:2 A2:2 A2:2 |',
        cym: '| .:16 | .:16 | .:16 | w:16 |',
      },
      dyn: {
        violinsI: '| mf | mf< | f | f< |', violinsII: '| mf | mf< | f | f< |', violas: '| mf | mf< | f | f< |', cellos: '| mf | mf< | f | f< |',
        basses: '| mf | mf< | f | f< |', horns: '| mf | mf | mf< | f |', harp: '| mf |', choirAh: '| p | p | p< | - |', glock: '| mp |', timpani: '| mf | mf | mf< | f |',
      },
    },
    climax: {
      bars: 4, chords: CLIMAX,
      parts: {
        violinsI: '| F5:8 D6:8 | E6:8 C6:4 G5:4 | A5:12 F5:4 | E5:16 |',
        violinsII: '| D5:8 F5:8 | G5:8 E5:8 | F5:12 D5:4 | C#5:16 |',
        violas: '| Bb4:8 Bb4:8 | C5:8 G4:8 | D4:8 A4:8 | A4:16 |',
        cellos: '| Bb2:8 F3:8 | C3:8 G3:8 | D3:8 A3:8 | A2:8 E3:8 |',
        basses: '| Bb1:16 | C2:16 | D2:16 | A1:16 |',
        horns: '| D4:4 F4:4 Bb4:8 | C5:4 G4:4 E4:8 | F4:4 A4:4 D5:8 | C#5:12 A4:4 |',
        trombones: '| [Bb2 F3]:16 | [C3 G3]:16 | [D3 A3]:16 | [A2 E3]:16 |',
        choirAh: '| [D4 F4 Bb4]:16 | [E4 G4 C5]:16 | [F4 A4 D5]:16 | [E4 A4 C#5]:16 |',
        harp: harp(CLIMAX, { lo: 'F3', hi: 'F5' }),
        glock: '| D6:4 F6:4 Bb6:8 | C7:4 G6:4 E6:8 | F6:4 A6:4 D7:8 | C#7:8 E7:8 |',
        timpani: '| F2:4 F2:2 F2:2 F2:4 F2:4 | G2:4 G2:2 G2:2 G2:4 G2:4 | D2:4 D2:2 D2:2 D2:4 A2:4 | A2:16~ |',
        drum: '| b:16 | b:8 b:8 | b:16 | .:16 |',
        cym: '| c:16 | .:16 | c:16 | .:16 |',
      },
      dyn: {
        violinsI: '| ff | ff | ff | f> |', violinsII: '| ff | ff | ff | f> |', violas: '| ff | ff | ff | f> |', cellos: '| ff | ff | ff | f> |',
        basses: '| ff | ff | ff | f> |', horns: '| ff | ff | ff | f> |', trombones: '| f | f | ff | f> |', choirAh: '| f | f | ff | f> |',
        harp: '| f |', glock: '| mf |', timpani: '| f | f | ff | f> |',
      },
    },
    coda: {
      bars: 2, chords: CODA, rit: [72, 54],
      parts: {
        violinsI: '| D5:16 | F#5:16 |',
        violinsII: '| A4:16 | A4:16 |',
        violas: '| F4:16 | D4:16 |',
        cellos: '| D3:16 | D3:16 |',
        basses: '| D2:16 | D2:16 |',
        horns: '| A3:8 D4:8 | F#4:16 |',
        choirOo: '| [D4 F4 A4]:16 | [D4 F#4 A4]:16 |',
        timpani: '| D2:16~ | -:8 .:8 |',
        harp: harp(CODA),
        glock: '| .:16 | F#6:4 A6:4 D7:8 |',
      },
      dyn: {
        violinsI: '| mf> | pp |', violinsII: '| mf> | pp |', violas: '| mf> | pp |', cellos: '| mf> | pp |', basses: '| mf> | pp |',
        horns: '| mp> | pp |', choirOo: '| p> | pp |', timpani: '| mp> | pp |', harp: '| mp> | p |', glock: '| p |',
      },
    },
  },
  form: ['intro', 'theme', 'theme2', 'climax', 'coda'],
  // two cues for a game: calm (the themes) and tense (the climax), with the battery as a layer
  loops: { main: { intro: ['intro'], body: ['theme', 'theme2'] }, climax: { body: ['climax'] } },
  layers: { battery: ['timpani', 'drum', 'cym'], choir: ['choirOo', 'choirAh'] },
  stingers: { coda: ['coda'] },
  master: { lufs: -16, eq: [['hp', 28, 0.7], ['ls', 140, 0.7, -1.5], ['hs', 6000, 0.7, 2]], comp: { threshold: -14, ratio: 1.8, attack: 0.03, release: 0.3 } },
};
