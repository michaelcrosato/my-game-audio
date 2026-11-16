// "Pixel Kingdom": a game's ten cues (songs/themes/cues.mjs) for the NES 2A03: two pulses, a triangle, a noise
// channel. Each cue loops seamlessly (player.music(song, { cue: 'battle' })); its mood picks the accompaniment.
import { arpLine, bassLine } from '../engine/score.mjs';
import { THEMES, CUES } from './themes/cues.mjs';

// per cue: the arpeggio (pattern, steps per note), the triangle's rhythm per bar, the noise channel's bar, the
// lead's articulation, and the dynamic
const STYLE = {
  title: { arp: [[0, 1, 2, 3, 2, 1, 0, 1], 2], bass: 'xoxoxoxo', drums: 'k . h . s . h . k . h k s . h .', dyn: 'f' },
  menu: { arp: [[0, 1, 2, 1], 4], bass: 'x-------5-------', drums: null, dyn: 'mp' },
  exploration: { arp: [[0, 2, 1, 3, 2, 1, 0, 2], 2], bass: 'x.xox.xo', drums: 'k . h . s . h h k . h . s . h .', dyn: 'mf' },
  town: { arp: [[0, 1, 2, 1, 2, 1], 2], bass: 'x.5.5.', drums: 'k . h . h . s . h . h .', dyn: 'mf' },
  dungeon: { arp: [[0, 2, 1, 2], 4], bass: 'x-------x-------', drums: 'h . . . . . . . h . . . . . o .', dyn: 'mp' },
  battle: { arp: [[0, 1, 2, 3, 2, 1, 2, 3], 1], bass: 'xxoxxxox', drums: 'k . h k s . h . k k h . s . h h', dyn: 'f' },
  boss: { arp: [[0, 1, 2, 3], 1], bass: 'xxxxxxxxxxxxxxxx', drums: 'k h k h s h k h k h k h s h s s', dyn: 'ff' },
  victory: { arp: [[0, 1, 2, 3, 2, 1, 2, 3], 2], bass: 'xoxoxoxo', drums: 'k . h . s . h . k . h . s . s s', dyn: 'f' },
  defeat: { arp: [[0, 1, 2, 1], 4], bass: 'x---------------', drums: null, dyn: 'p' },
  ambience: { arp: [[0, 2, 1, 3], 8], bass: 'x---------------', drums: 'h . . . . . . . . . . . . . . .', dyn: 'pp' },
};

const bars = (line) => line.split('|').filter((c) => c.trim()).length;
const dynLine = (n, d) => `| ${d} |${' - |'.repeat(n - 1)}`;
const rest = (n, spb) => '|' + ` .:${spb} |`.repeat(n);

function section(t, s, chords, melody, { intro = false } = {}) {
  const n = bars(chords), spb = t.grid;
  const lowArp = { lo: 'B3', hi: 'B4', spb };
  return {
    bars: n, meter: t.meter, grid: spb, bpm: t.bpm, chords,
    parts: {
      pulse1: melody,
      pulse2: arpLine(chords, { ...lowArp, pattern: s.arp[0], rate: Math.min(s.arp[1], spb) }),
      tri: bassLine(chords, { rhythm: s.bass, octave: 2, spb }),
      noise: s.drums && !(intro && t.name === 'Laurels') ? `|${` ${s.drums} |`.repeat(n)}` : rest(n, spb),
    },
    dyn: { pulse1: dynLine(n, s.dyn), pulse2: dynLine(n, s.dyn === 'ff' ? 'f' : s.dyn), tri: dynLine(n, 'f'), noise: dynLine(n, s.dyn) },
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
  title: 'Pixel Kingdom',
  style: 'Chiptune: NES 2A03, a cue set (title, menu, exploration, town, dungeon, battle, boss, victory, defeat, ambience)',
  bpm: 132, meter: [4, 4], grid: 16, key: 'C major', seed: 11, tail: 1.5,
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
      },
    },
  },
  parts: {
    pulse1: { inst: 'lead', pan: -0.12, role: 'melody', sends: { room: -20 } },
    pulse2: { inst: 'harm', pan: 0.22, role: 'harmony', gain: -3, sends: { room: -17 } },
    tri: { inst: 'bass', role: 'bass', gain: 1 },
    noise: { inst: 'noise', pan: 0.08, gain: -2, sends: { room: -24 } },
  },
  buses: { room: { type: 'reverb', rt60: 0.9, size: 0.6, predelay: 0.01, er: 0.5, hf: 0.5 } },
  sections, loops, form,
};
