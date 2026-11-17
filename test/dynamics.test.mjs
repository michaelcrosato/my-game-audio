// Dynamics reach every instrument a score names: the band, synth and chip presets (types that have no dynamics of
// their own: pluck, fm, va, chip, drums) play the level at each note's start on the orchestra's scale, and music with
// no marks sounds as it did. Instruments written as raw specs without `dyn` keep playing every note alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSong } from '../engine/render.mjs';
import { presetSpec } from '../engine/orchestra.mjs';
import { GM_KIT } from '../engine/midi.mjs';

const rms = (L) => 10 * Math.log10(L.reduce((a, x) => a + x * x, 0) / L.length);
const play = (spec, line, dyn) => renderSong({
  bpm: 120, meter: [4, 4], grid: 16, seed: 1, tail: 1, instruments: { x: { ...spec, range: [0, 127] } }, parts: { p: { inst: 'x' } },
  sections: { a: { bars: 1, parts: { p: line }, ...(dyn ? { dyn: { p: `| ${dyn} |` } } : {}) } }, form: ['a'], master: { lufs: false },
});

for (const name of ['electric_guitar', 'electric_bass', 'electric_piano', 'synth_lead', 'synth_pad', 'chip_pulse', 'chip_triangle']) {
  test(`${name}: pp to ff spans 12 dB or more`, () => {
    const line = '| C4:4 E4:4 G4:4 C5:4 |';
    const pp = rms(play(presetSpec(name), line, 'pp').L), ff = rms(play(presetSpec(name), line, 'ff').L);
    assert.ok(ff - pp >= 12, `${name}: ${(ff - pp).toFixed(1)} dB from pp to ff`);
  });
}

test('the band kit follows dynamics too; a raw spec without dyn, and unmarked music, are as they were', () => {
  const kit = (d) => rms(play(GM_KIT, '| k:4 s:4 k:4 s:4 |', d).L);
  assert.ok(kit('ff') - kit('pp') >= 12);
  const raw = { ...presetSpec('electric_piano'), dyn: undefined };
  assert.equal(rms(play(raw, '| C4:16 |', 'pp').L).toFixed(3), rms(play(raw, '| C4:16 |', 'ff').L).toFixed(3));
  const marked = play(presetSpec('electric_piano'), '| C4:16 |', null), plain = play(raw, '| C4:16 |', null);
  assert.equal(rms(marked.L).toFixed(4), rms(plain.L).toFixed(4), 'with no marks (level 0.7), dyn changes nothing');
});
