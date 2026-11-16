// Render single dry piano notes (no reverb, no EQ, key held) for comparison with reference recordings.
// usage: node tools/piano_note.mjs OUT.wav MIDI HAMMER_VELOCITY [SECONDS] [SPEC_JSON]
import { writeFileSync } from 'node:fs';
import { piano } from '../engine/piano.mjs';
import { wav } from '../engine/render.mjs';
import { SR, panGains } from '../engine/dsp.mjs';

const [out, midiS, hvS, secS = '10', specS = '{}'] = process.argv.slice(2);
const secs = Number(secS);
const L = new Float32Array(Math.ceil(secs * SR)), R = new Float32Array(L.length);
const inst = piano({ width: 0, ...JSON.parse(specS) });
// level such that the instrument's hammer velocity equals HAMMER_VELOCITY (hv = 0.1 + 0.88 * level at vel 0.8)
const level = (Number(hvS) - 0.1) / 0.88;
inst.render(
  { t: 0.05, dur: secs, midi: Number(midiS), vel: 0.8, art: '_', seed: 12345, pan: 0, ci: 0, cn: 1, grace: null },
  { L, R },
  { pan: panGains, levelAt: () => level, damperAt: () => Infinity },
);
writeFileSync(out, wav(L, R));
