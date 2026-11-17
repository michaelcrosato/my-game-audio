// The orchestra's balance: the loudness each preset should reach playing the same phrase at mf, dry, and the
// measurement itself. Shared by tools/orchestra_calibrate.mjs (which writes the gains) and test/presets.test.mjs
// (which checks they are still right).
import { renderSong } from '../engine/render.mjs';
import { lufs } from '../engine/fx.mjs';
import { midiToName } from '../engine/score.mjs';

// target loudness (LUFS) of one part playing mf on its own, dry
export const TARGET = {
  violins: -20, violas: -21, cellos: -20, basses: -21, violin_solo: -24, viola_solo: -24, cello_solo: -23, contrabass_solo: -24,
  violins_pizz: -24, violas_pizz: -24, cellos_pizz: -23, basses_pizz: -23,
  flute: -24, piccolo: -23, recorder: -26, oboe: -23, english_horn: -24, clarinet: -24, bass_clarinet: -24, bassoon: -24,
  contrabassoon: -24, soprano_sax: -22, alto_sax: -22, tenor_sax: -22, baritone_sax: -22,
  horn: -21, trumpet: -20, cornet: -21, trombone: -20, bass_trombone: -20, tuba: -21, euphonium: -21, muted_trumpet: -24,
  timpani: -26, glockenspiel: -21, xylophone: -23, marimba: -24, vibraphone: -24, tubular_bells: -22, celesta: -26, crotales: -26,
  piano: -21, harp: -23, harpsichord: -28, organ: -20,
  soprano_choir: -21, alto_choir: -21, tenor_choir: -21, bass_choir: -21, soprano_voice: -22, alto_voice: -22, tenor_voice: -22, bass_voice: -22,
  acoustic_guitar: -22, electric_guitar: -22, distortion_guitar: -21, electric_bass: -21, electric_piano: -22,
  synth_lead: -20, synth_pluck: -24, synth_pad: -24, synth_bass: -21, chip_pulse: -21, chip_triangle: -21,
};
export const KIT_TARGET = { bd: -21, sd: -23, cym: -21, scym: -24, tri: -28, tam: -22, tamb: -26, wb: -26, cast: -27, sleigh: -27, cowbell: -26, whip: -25 };

/** Render one instrument spec playing `line` at mf, dry and unnormalized. Returns the render. */
export function play(spec, line, { drum = false, fx = [], gain = 0, bars = 2 } = {}) {
  const song = {
    bpm: 80, meter: [4, 4], grid: 16, seed: 3, tail: 2,
    instruments: { x: { ...spec, ...(drum ? {} : { range: [0, 127] }) } },
    parts: { p: { inst: 'x', gain, fx } },
    sections: { a: { bars, parts: { p: line }, dyn: { p: '|' + ' mf |'.repeat(bars) } } },
    form: ['a'], master: { lufs: false },
  };
  return renderSong(song);
}

/** The calibration phrase for a pitched preset: a rising arpeggio from below the middle of its range, then a dyad. */
export function phrase([lo, hi]) {
  const mid = Math.round((lo + hi) / 2) - 3;
  const notes = [mid, mid + 4, mid + 7, mid + 12].map((m) => midiToName(Math.min(hi, m)));
  return `| ${notes[0]}:4 ${notes[1]}:4 ${notes[2]}:4 ${notes[3]}:4 | [${notes[0]} ${notes[2]}]:8 .:8 |`;
}
export const kitPhrase = (tok) => `| ${tok}:4 ${tok}:4 ${tok}:4 ${tok}:4 | .:16 |`;

/** Loudness of a preset's calibration phrase with no gain, or of one percussion token at gain 1. */
export function measure(P, name, tok) {
  const p = P.instruments[name];
  if (tok) {
    const kit = { ...p.spec.kit, [tok]: { ...p.spec.kit[tok], gain: 1 } };
    const r = play({ ...p.spec, kit }, kitPhrase(tok), { drum: true });
    return lufs(r.L, r.R);
  }
  const r = play(p.spec, phrase(p.range), { fx: p.fx });
  return lufs(r.L, r.R);
}
