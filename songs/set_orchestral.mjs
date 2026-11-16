// "The Long Campaign": a game's ten cues (songs/themes/cues.mjs) for orchestra, on a concert stage. Each cue gives
// its theme to the instrument that suits its mood (horn for the title, flute for the menu, oboe for the town and the
// defeat, trumpet for the victory) and uses the strings' techniques: measured tremolo in battle, sul ponticello in the
// dungeon, harmonics in the still air, and a choir singing Latin over the boss.
import { arpLine, bassLine, padLine, transposeLine, voiceLead, midiToName } from '../engine/score.mjs';
import { presetSpec, PRESETS } from '../engine/orchestra.mjs';
import { THEMES, CUES } from './themes/cues.mjs';

// per cue: which part plays the theme (and how far it is transposed), the strings' pad and its technique, the bass
// rhythm, whether the harp, timpani and choir play, and the dynamic
const STYLE = {
  title: { lead: 'hn', shift: -12, pad: '', bass: 'x---x---', harp: true, timp: 'x.......x.......', dyn: 'f' },
  menu: { lead: 'fl', shift: 0, pad: '', bass: 'x---------------', harp: true, dyn: 'mp' },
  exploration: { lead: 'vn', shift: 0, pad: '', bass: 'x-x-x-x-', harp: true, dyn: 'mf' },
  town: { lead: 'ob', shift: 0, pad: '^', bass: 'x.5.5.', harp: true, dyn: 'mf' },
  dungeon: { lead: 'vc', shift: -12, pad: '~%pont', bass: 'x---------------', dyn: 'p' },
  battle: { lead: 'vn', shift: 0, pad: '%trem16', bass: 'xxoxxxox', timp: 'x...x...x...x.xx', dyn: 'f' },
  boss: { lead: 'hn', shift: -12, pad: '%trem16', bass: 'xxxxxxxx', timp: 'x.x.x.x.x.x.x.xx', choir: ['di', 'es', 'i', 'rae', 'di', 'es', 'il', 'la'], dyn: 'ff' },
  victory: { lead: 'tp', shift: -12, pad: '', bass: 'xoxoxoxo', timp: 'x.......x...x.x.', harp: true, dyn: 'f' },
  defeat: { lead: 'ob', shift: 0, pad: '', bass: 'x---------------', dyn: 'p' },
  ambience: { lead: 'fl', shift: 0, pad: '*', bass: 'x---------------', harp: true, dyn: 'pp' },
};

const bars = (line) => line.split('|').filter((c) => c.trim()).length;
const dynLine = (n, d) => `| ${d} |${' - |'.repeat(n - 1)}`;

// a choir chord per half chord, each sung to the next syllable: the words come through (M4's consonants)
function choirLine(chords, words, spb) {
  let k = 0;
  const vs = voiceLead(chords, { lo: 'C5', hi: 'G5', notes: 3, spb });
  const out = [];
  let bar = [], used = 0;
  for (const v of vs) {
    const half = v.steps / 2;
    for (const len of [half, v.steps - half]) {
      bar.push(`[${v.notes.map(midiToName).join(' ')}]:${len}@${words[k++ % words.length]}`);
      used += len;
      if (used >= spb) {
        out.push(bar.join(' '));
        bar = [];
        used = 0;
      }
    }
  }
  return `| ${out.join(' | ')} |`;
}

function section(t, s, chords, melody) {
  const n = bars(chords), spb = t.grid;
  const parts = {
    [s.lead]: s.shift ? transposeLine(melody, s.shift) : melody,
    va: padLine(chords, { lo: 'C4', hi: 'A4', notes: 2, spb, art: s.pad }),
    vn2: padLine(chords, { lo: 'G4', hi: 'E5', notes: 2, spb, art: s.pad }),
    vcb: bassLine(chords, { rhythm: s.bass, octave: 2, spb }),
    cb: bassLine(chords, { rhythm: s.bass, octave: 1, spb }),
  };
  if (s.lead === 'vn') delete parts.vn2; // the violins have the theme
  if (s.lead === 'vc') {
    parts.vc = parts.vc ?? parts[s.lead];
    delete parts.vcb;
  }
  if (s.harp) parts.harp = arpLine(chords, { lo: 'C4', hi: 'C6', pattern: [0, 1, 2, 3, 2, 1], rate: spb === 12 ? 2 : 4, spb });
  if (s.timp) parts.timp = bassLine(chords, { rhythm: s.timp, octave: 2, spb, art: '!' }).replace(/\b([A-G][b#]?)2\b/g, (m, p) => (['A', 'Bb', 'B'].includes(p) ? `${p}1` : m)).replace(/\b([A-G][b#]?)1\b/g, (m, p) => (['A', 'Bb', 'B', 'C', 'Db', 'C#'].includes(p) ? `${p}2` : m));
  if (s.choir) parts.choir = choirLine(chords, s.choir, spb);
  const dyn = {};
  for (const p of Object.keys(parts)) dyn[p] = dynLine(n, p === s.lead ? s.dyn : s.dyn === 'ff' ? 'f' : s.dyn === 'f' ? 'mf' : s.dyn);
  return { bars: n, meter: t.meter, grid: spb, bpm: t.bpm, chords, parts, dyn };
}

const sections = {}, loops = {}, form = [];
for (const cue of CUES) {
  const t = THEMES[cue], s = STYLE[cue];
  if (t.intro) {
    sections[`${cue}_in`] = section(t, s, t.intro.chords, t.intro.melody);
    form.push(`${cue}_in`);
  }
  sections[cue] = section(t, s, t.chords, t.melody);
  form.push(cue);
  loops[cue] = { intro: t.intro ? [`${cue}_in`] : [], body: [cue] };
}

const P = PRESETS.instruments;
const part = (name, key, extra = {}) => ({ inst: name, gain: P[key].gain, pan: P[key].pan, sends: { hall: P[key].send }, fx: P[key].fx, ...extra });

export default {
  title: 'The Long Campaign',
  style: 'Orchestra: a cue set (title, menu, exploration, town, dungeon, battle, boss, victory, defeat, ambience)',
  bpm: 120, meter: [4, 4], grid: 16, key: 'C major', seed: 31, tail: 3,
  instruments: {
    violins: presetSpec('violins'), violas: presetSpec('violas'), cellos: presetSpec('cellos'), basses: presetSpec('basses'),
    flute: presetSpec('flute'), oboe: presetSpec('oboe'), horn: presetSpec('horn'), trumpet: presetSpec('trumpet'),
    harp: presetSpec('harp'), timpani: presetSpec('timpani'), choir: presetSpec('soprano_choir'),
  },
  parts: {
    vn: part('violins', 'violins', { role: 'melody' }),
    vn2: part('violins', 'violins', { role: 'harmony', pan: -0.3, gain: P.violins.gain - 3 }),
    va: part('violas', 'violas', { role: 'harmony', gain: P.violas.gain - 2 }),
    vc: part('cellos', 'cellos', { role: 'melody' }),
    vcb: part('cellos', 'cellos', { role: 'bass', gain: P.cellos.gain - 2 }),
    cb: part('basses', 'basses', { role: 'bass', gain: P.basses.gain - 2 }),
    fl: part('flute', 'flute', { role: 'melody' }),
    ob: part('oboe', 'oboe', { role: 'melody' }),
    hn: part('horn', 'horn', { role: 'melody' }),
    tp: part('trumpet', 'trumpet', { role: 'melody' }),
    harp: part('harp', 'harp', { role: 'harmony', gain: P.harp.gain - 3 }),
    timp: part('timpani', 'timpani'),
    choir: part('choir', 'soprano_choir', { role: 'harmony', gain: P.soprano_choir.gain - 3 }),
  },
  buses: { hall: PRESETS.hall },
  master: PRESETS.master,
  stage: PRESETS.stage,
  sections, loops, form,
};
