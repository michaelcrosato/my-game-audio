// "Night Circuit": a game's ten cues (songs/themes/cues.mjs) as synthwave: a saw lead, a supersaw pad, a sixteenth
// arpeggio through a ping-pong delay, an octave bass and a drum machine; pad, bass and arpeggio duck under the kick.
// Each cue loops seamlessly; its mood picks the groove.
import { arpLine, bassLine, padLine } from '../engine/score.mjs';
import { THEMES, CUES } from './themes/cues.mjs';

// per cue: the kick, snare and hat bars (null: none), the bass rhythm, the arpeggio rate, the lead's octave shift
const STYLE = {
  title: { kick: 'k . . . k . . . k . . . k . . .', snare: '.:4 s .:7 s .:3', hats: 'h? h? o h? h? h? o h? h? h? o h? h? h? o h?', bass: 'xoxoxoxoxoxoxoxo', arp: 1, dyn: 'f' },
  menu: { kick: null, snare: null, hats: '.:2 h? .:5 h? .:5 h? .', bass: 'x-------x-------', arp: 2, dyn: 'mp' },
  exploration: { kick: 'k . . . . . k . k . . . . . . .', snare: '.:4 s .:7 s .:3', hats: 'h? . h . h? . h . h? . h . h? . h .', bass: 'x.xo.xo.x.xo.xo.', arp: 1, dyn: 'mf' },
  town: { kick: 'k . . . . . k . . . . .', snare: '.:6 s .:5', hats: 'h? . h . h . h? . h . h .', bass: 'x.5.5.', arp: 2, dyn: 'mf' },
  dungeon: { kick: 'k .:15', snare: null, hats: '.:8 h? .:7', bass: 'x---------------', arp: 4, dyn: 'mp' },
  battle: { kick: 'k . . k k . . . k . . k k . . .', snare: '.:4 s .:3 s? .:3 s .:3', hats: 'h h o h h h o h h h o h h h o h', bass: 'xxoxxxoxxxoxxxox', arp: 1, dyn: 'f' },
  boss: { kick: 'k . k . k . k . k . k . k . k k', snare: '.:4 s .:7 s .:2 s', hats: 'h h h h o h h h h h h h o h h h', bass: 'xxxxxxxxxxxxxxxx', arp: 1, dyn: 'ff' },
  victory: { kick: 'k . . . k . . . k . . . k . . .', snare: '.:4 s .:7 s .:3', hats: 'h? h? o h? h? h? o h? h? h? o h? h? h? o h?', bass: 'xoxoxoxoxoxoxoxo', arp: 1, dyn: 'f' },
  defeat: { kick: null, snare: null, hats: null, bass: 'x---------------', arp: 4, dyn: 'p' },
  ambience: { kick: null, snare: null, hats: null, bass: 'x---------------', arp: 8, dyn: 'pp' },
};

const bars = (line) => line.split('|').filter((c) => c.trim()).length;
const dynLine = (n, d) => `| ${d} |${' - |'.repeat(n - 1)}`;
const rest = (n, spb) => '|' + ` .:${spb} |`.repeat(n);
const each = (n, bar, spb) => (bar ? `|${` ${bar} |`.repeat(n)}` : rest(n, spb));
// the snare's last bar is a fill into the loop's start
const fill = (spb) => (spb === 12 ? '.:6 s . s s s s' : '.:4 s .:3 s . s s s s s s');
const withFill = (n, bar, spb) => `|${` ${bar} |`.repeat(n - 1)} ${fill(spb)} |`;

function section(t, s, chords, melody, { intro = false } = {}) {
  const n = bars(chords), spb = t.grid;
  // an intro is a build: no kick yet
  const kick = intro ? null : s.kick;
  return {
    bars: n, meter: t.meter, grid: spb, bpm: t.bpm, chords,
    parts: {
      lead: melody,
      pad: padLine(chords, { lo: 'F3', hi: 'E5', notes: 4, spb }),
      arp: arpLine(chords, { lo: 'A3', hi: 'A5', pattern: [0, 1, 2, 3, 4, 3, 2, 1], rate: s.arp, spb }),
      bass: bassLine(chords, { rhythm: s.bass, octave: 1, spb }),
      ...(kick ? { kick: each(n, kick, spb) } : {}),
      ...(s.snare ? { snare: intro ? each(n, s.snare, spb) : withFill(n, s.snare, spb) } : {}),
      ...(s.hats ? { hats: each(n, s.hats, spb) } : {}),
    },
    dyn: {
      lead: dynLine(n, s.dyn), pad: dynLine(n, s.dyn === 'ff' ? 'f' : s.dyn), arp: dynLine(n, 'mf'), bass: dynLine(n, 'f'),
      ...(kick ? { kick: dynLine(n, 'f') } : {}), ...(s.snare ? { snare: dynLine(n, 'f') } : {}), ...(s.hats ? { hats: dynLine(n, 'mf') } : {}),
    },
  };
}

const sections = {}, loops = {}, form = [];
for (const cue of CUES) {
  const t = THEMES[cue], s = STYLE[cue];
  if (t.intro) {
    sections[`${cue}_in`] = section(t, s, t.intro.chords, t.intro.melody, { intro: true });
    form.push(`${cue}_in`);
  }
  sections[cue] = section(t, s, t.chords, t.melody);
  form.push(cue);
  loops[cue] = { intro: t.intro ? [`${cue}_in`] : [], body: [cue] };
}

export default {
  title: 'Night Circuit',
  style: 'Electronic: synthwave, a cue set (title, menu, exploration, town, dungeon, battle, boss, victory, defeat, ambience)',
  bpm: 120, meter: [4, 4], grid: 16, key: 'C major', seed: 23, tail: 3,
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
      },
    },
  },
  parts: {
    lead: { inst: 'lead', role: 'melody', gain: -3, pan: 0.05, sends: { delay: -11, hall: -12 } },
    arp: { inst: 'arp', role: 'harmony', gain: -8, pan: 0.18, sends: { delay: -5, hall: -14 }, fx: [['dynlp', 1200, 14000, 0.7], ['duck', { source: 'kick', token: 'k', depth: 0.35, release: 0.16 }]] },
    pad: { inst: 'pad', role: 'harmony', gain: -11, sends: { hall: -7 }, fx: [['dynlp', 400, 13000, 0.6], ['duck', { source: 'kick', token: 'k', depth: 0.55, release: 0.22 }]] },
    bass: { inst: 'bass', role: 'bass', gain: -3, mono: true, fx: [['duck', { source: 'kick', token: 'k', depth: 0.45, release: 0.14 }]] },
    kick: { inst: 'kit', gain: -2, mono: true },
    snare: { inst: 'kit', gain: -5, sends: { hall: -13 } },
    hats: { inst: 'kit', gain: -5, sends: { hall: -20 } },
  },
  buses: {
    hall: { type: 'reverb', rt60: 2.6, size: 1.1, predelay: 0.03, hf: 0.5, lowCut: 220, highCut: 8000 },
    delay: { type: 'delay', time: 0.34, feedback: 0.42, lowCut: 300, highCut: 3800 },
  },
  sections, loops, form,
};
