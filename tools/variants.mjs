// Render variants of a song (gain/patch tweaks) so a scorer can rank them: node tools/variants.mjs rock
import { writeFileSync } from 'node:fs';
import { renderSong, wav } from '../engine/render.mjs';

const name = process.argv[2];
const base = (await import(`../songs/${name}.mjs`)).default;
const clone = (o) => structuredClone({ ...o, sections: undefined }); // sections hold no functions after import
const variants = {
  v0: (s) => s,
  v1: (s) => { s.parts.kick.gain += 4; s.parts.snare.gain += 2; return s; },
  v2: (s) => { s.parts.kick.gain += 4; s.parts.snare.gain += 2; s.parts.bass.gain -= 2; s.parts.lead.gain += 3; return s; },
  v3: (s) => { s.parts.kick.gain += 4; s.parts.snare.gain += 2; s.parts.bass.gain -= 2; s.parts.lead.gain += 3; s.parts.gtr.fx[0][1].gain = 26; return s; },
};
for (const [v, f] of Object.entries(variants)) {
  const s = f({ ...clone(base), sections: base.sections });
  const res = renderSong(s);
  writeFileSync(`out/${name}_${v}.wav`, wav(res.L, res.R));
  console.log(v, res.stats.lufs, res.stats.peakDb);
}
